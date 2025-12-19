import { connectToDatabase, disconnectFromDatabase } from "./config/db.js";
import logger from "./utils/logger.js";
import env from "./config/env.js";
import { createBot, setupBotCommands, startPolling, startWebhook } from "./bot/setup.js";
import startAdminServer from "./dashboard/server.js";

const bootstrap = async () => {
  try {
    logger.info(`🚀 Starting bot in ${env.nodeEnv} mode`);

    await connectToDatabase();

    const bot = createBot();
    let adminServer = null;

    await setupBotCommands(bot);

    if (env.enableWebhook) {
      await startWebhook(bot);
      adminServer = await startAdminServer();
    } else {
      await startPolling(bot);
    }

    const gracefulShutdown = async () => {
      logger.info("Received shutdown signal, stopping bot...");

      try {
        bot.stop();
        await disconnectFromDatabase();
        if (adminServer) {
          adminServer.close(() => logger.info("Admin panel server stopped"));
        }
        logger.info("Bot stopped gracefully");
        process.exit(0);
      } catch (error) {
        logger.error({ error }, "Error during shutdown");
        process.exit(1);
      }
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);

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
      await disconnectFromDatabase();
    } catch (disconnectError) {
      logger.error({ error: disconnectError }, "Failed to disconnect from database");
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
