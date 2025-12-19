import { Bot, GrammyError, HttpError } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { connectToDatabase, disconnectFromDatabase } from "../config/db.js";
import setupSession from "./middlewares/session.js";
import logger from "../utils/logger.js";
import env from "../config/env.js";
import userContext from "./middlewares/userContext.js";
import rootComposer from "./composers/root.js";
import { setupBotErrorHandling } from "./handlers/errorHandler.js";
import { createPoolConversation } from "./conversations/createPoolConversation.js";
import { attachAdminPanel } from "../dashboard/panel.js";
import startAdminServer from "../dashboard/server.js";

let webhookServer = null;

const setupBotCommands = async (bot) => {
    const commands = [
        { command: "new", description: "➕ Создать сбор" },
        { command: "pools", description: "📋 Мои сборы" },
        { command: "help", description: "❓ Помощь" }
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

export const startPolling = async (bot) => {
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

export const startWebhook = async (bot) => {
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

    attachAdminPanel(app);

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
            await disconnectFromDatabase();
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

export const createBot = () => {
    const bot = new Bot(env.botToken);

    setupBotErrorHandling(bot);
    initializeMiddlewares(bot);

    return bot;
};

export { setupBotCommands };
