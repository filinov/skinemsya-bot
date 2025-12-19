import { connectToDatabase, disconnectFromDatabase } from "./config/db.js";
import logger from "./utils/logger.js";
import env from "./config/env.js";
import { createBot, startPolling, startWebhook } from "./bot/setup.js";
import { setupBotCommands } from "./bot/commands.js";
import startAdminServer from "./dashboard/server.js";

const bootstrap = async () => {
  try {
    logger.info(`🚀 Starting bot in ${env.nodeEnv} mode`);

    logger.info("Connecting to database...");
    await connectToDatabase();
    logger.info("Database connected.");

    const bot = createBot();

    // Setup commands
    logger.info("Setting up bot commands...");
    await setupBotCommands(bot);
    logger.info("Bot commands set.");

    let server = null;

    const stopHandler = async (signal) => {
      logger.info(`Received ${signal}, stopping application...`);

      try {
        if (env.webhookDomain) {
        } else {
          await bot.stop();
        }

        if (server) {
          await new Promise((resolve, reject) => {
            server.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          logger.info("Server stopped");
        }

        await disconnectFromDatabase();
        logger.info("Application stopped gracefully");
        process.exit(0);
      } catch (error) {
        logger.error({ error }, "Error during graceful shutdown");
        process.exit(1);
      }
    };

    process.once("SIGINT", () => stopHandler("SIGINT"));
    process.once("SIGTERM", () => stopHandler("SIGTERM"));

    if (env.webhookDomain) {
      server = await startWebhook(bot);
    } else {
      server = await startAdminServer();

      logger.info("Starting polling...");
      await bot.start({
        drop_pending_updates: env.isProduction,
        allowed_updates: ["message", "callback_query", "inline_query"],
        onStart: (botInfo) => {
          logger.info(`🤖 Bot @${botInfo.username} started successfully`);
          if (env.botAdminId && env.isProduction) {
            bot.api.sendMessage(
              env.botAdminId,
              `✅ Бот @${botInfo.username} запущен в режиме polling`
            ).catch(err => logger.warn("Failed to send startup message to admin"));
          }
        }
      });
    }

    if (!env.webhookDomain) {
      if (server) {
        server.close();
      }
      await disconnectFromDatabase();
      logger.info("Cleanup finished");
      process.exit(0);
    }

  } catch (error) {
    logger.error({ error }, "❌ Fatal error during bootstrap");
    try { await disconnectFromDatabase(); } catch (e) { }
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error) => {
    logger.error({ error }, "Failed to bootstrap application");
    process.exit(1);
  });
}
