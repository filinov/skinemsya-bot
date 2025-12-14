import { Bot, GrammyError, HttpError } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { connectToMongoDB, disconnectFromMongoDB } from "./config/mongo.js";
import setupSession from "./middlewares/session.js";
import logger from "./utils/logger.js";
import env from "./config/env.js";
import userContext from "./middlewares/userContext.js";
import rootComposer from "./composers/root.js";
import { createPoolConversation } from "./conversations/createPoolConversation.js";

const setupBotCommands = async (bot) => {
  try {
    await bot.api.setMyCommands([
      { command: "new", description: "Создать сбор" },
      { command: "pools", description: "Мои сборы" },
      { command: "help", description: "Помощь" }
    ]);
  } catch (error) {
    logger.warn({ error }, "Failed to set bot commands");
  }
};

const bootstrap = async () => {
  await connectToMongoDB();

  const bot = new Bot(env.botToken);

  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    logger.error(
      {
        err: e,
        updateId: ctx?.update?.update_id,
        update: ctx?.update
      },
      `❌ Error while handling update ${ctx?.update?.update_id ?? "unknown"}`
    );
    if (e instanceof GrammyError) {
      logger.error(
        {
          description: e.description,
          parameters: e.parameters,
          response: e.response
        },
        "❌ Grammy error details"
      );
    } else if (e instanceof HttpError) {
      logger.error(
        {
          description: e.description,
          statusCode: e.statusCode,
          stack: e.stack
        },
        "❌ HTTP error details"
      );
    } else {
      logger.error(
        {
          message: e?.message,
          stack: e?.stack,
          type: typeof e
        },
        "❌ Unknown error type"
      );
    }
  });

  bot.use(setupSession());
  bot.use(conversations());
  bot.use(createConversation(createPoolConversation, "createPool"));
  bot.use(userContext);
  bot.use(rootComposer);

  await setupBotCommands(bot);

  await bot.start({
    onStart: (botInfo) => logger.info(`🤖 Bot started successfully as @${botInfo.username}`)
  });
};

bootstrap().catch((err) => {
  logger.error({ err }, "❌ Fatal error during bootstrap");
  disconnectFromMongoDB();
  process.exit(1);
});
