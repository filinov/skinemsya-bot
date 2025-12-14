import { Bot, GrammyError, HttpError } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { connectToMongoDB, disconnectFromMongoDB } from "./config/mongo.js";
import setupSession from "./middlewares/session.js";
import logger from "./utils/logger.js";
import env from "./config/env.js";
import userContext from "./middlewares/userContext.js";
import rootComposer from "./composers/root.js";
import { setupBotErrorHandling } from "./handlers/errorHandler.js";
import { createPoolConversation } from "./conversations/createPoolConversation.js";

let webhookServer = null;

const setupBotCommands = async (bot) => {
  const commands = [
    { command: "new", description: "Создать сбор" },
    { command: "pools", description: "Мои сборы" },
    { command: "help", description: "Помощь" }
  ];

  try {
    await bot.api.setMyCommands(commands);
    logger.info("✅ Bot commands updated successfully");
  } catch (error) {
    logger.warn({ error }, "❌ Failed to set bot commands");
    
    if (error instanceof GrammyError && error.error_code === 401) {
      logger.error("Invalid bot token. Please check BOT_TOKEN in .env file");
    }
  }
};

const initializeMiddlewares = (bot) => {
  bot.use(setupSession());
  bot.use(userContext);
  bot.use(conversations());
  bot.use(createConversation(createPoolConversation, "createPool"));
  bot.use(rootComposer);

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    
    if (text.startsWith("/")) {
      await ctx.reply(
        "Неизвестная команда. Используйте /help для списка доступных команд."
      );
      logger.info(`Unknown command from user ${ctx.from.id}: ${text}`);
    }
  });
};

const startPolling = async (bot) => {
  const botInfo = await bot.api.getMe();

  await bot.start({
    onStart: (botInfo) => {
      logger.info(`🤖 Bot @${botInfo.username} started successfully`);
      
      if (env.botAdminId && env.isProduction) {
        bot.api.sendMessage(
          env.botAdminId,
          `✅ Бот @${botInfo.username} запущен в режиме polling`
        ).catch(err => logger.warn("Failed to send startup message to admin"));
      }
    },
    
    allowed_updates: ["message", "callback_query", "inline_query"],
    drop_pending_updates: env.isProduction,
    limit: 100,
  });
};

const startWebhook = async (bot) => {
  const botInfo = await bot.api.getMe();
  const webhookUrl = `${env.webhookDomain}${env.webhookPath || `/webhook/${env.botToken}`}`;
  
  logger.info(`Setting up webhook for @${botInfo.username} to ${webhookUrl}`);

  await bot.api.setWebhook(webhookUrl, {
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
    secret_token: env.webhookSecret,
  });

  const { default: express } = await import("express");
  const { default: helmet } = await import("helmet");
  const { webhookCallback } = await import("grammy");

  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      bot: botInfo.username,
      environment: env.nodeEnv,
    });
  });

  app.post(env.webhookPath || `/webhook/${env.botToken}`, webhookCallback(bot, "express"));

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const port = env.port || 3000;
  const host = env.host || "0.0.0.0";

  webhookServer = app.listen(port, host, () => {
    logger.info(`Webhook server listening on ${host}:${port}`);
    logger.info(`🤖 Bot @${botInfo.username} started successfully`);
    
    if (env.botAdminId && env.isProduction) {
      bot.api.sendMessage(
        env.botAdminId,
        `✅ Бот @${botInfo.username} запущен в режиме webhook на порту ${port}`
      ).catch(err => logger.warn("Failed to send startup message to admin"));
    }
  });

  const gracefulShutdown = () => {
    logger.info("Received shutdown signal, closing webhook server...");
    webhookServer.close(async () => {
      await disconnectFromMongoDB();
      logger.info("Webhook server closed");
      process.exit(0);
    });
    
    setTimeout(() => {
      logger.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
  
  return webhookServer;
};

const createBot = () => {
  const bot = new Bot(env.botToken);

  setupBotErrorHandling(bot);
  initializeMiddlewares(bot);

  return bot;
};

const bootstrap = async () => {
  try {
    logger.info(`🚀 Starting bot in ${env.nodeEnv} mode`);

    await connectToMongoDB();

    const bot = createBot();

    await setupBotCommands(bot);

    if (env.enableWebhook) {
      await startWebhook(bot);
    } else {
      await startPolling(bot);
    }

    if (!env.enableWebhook) {
      const gracefulShutdown = async () => {
        logger.info("Received shutdown signal, stopping bot...");
        
        try {
          bot.stop();
          await disconnectFromMongoDB();
          logger.info("Bot stopped gracefully");
          process.exit(0);
        } catch (error) {
          logger.error({ error }, "Error during shutdown");
          process.exit(1);
        }
      };
      
      process.on("SIGTERM", gracefulShutdown);
      process.on("SIGINT", gracefulShutdown);
    }

    process.on("uncaughtException", (error) => {
      logger.error({ error }, "Uncaught Exception");
      setTimeout(() => process.exit(1), 1000);
    });
    
    process.on("unhandledRejection", (reason, promise) => {
      logger.error({ reason, promise }, "Unhandled Rejection");
    });
  } catch (error) {
    logger.error({ error }, "❌ Fatal error during bootstrap");

    try {
      await disconnectFromMongoDB();
    } catch (error) {
      logger.error({ error: disconnectError }, "Failed to disconnect from MongoDB");
    }

    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error) => {
    logger.error({ error }, "Failed to bootstrap application");
    process.exit(1);
  });
}

export { createBot, startPolling, startWebhook, setupBotCommands };