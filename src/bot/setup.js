import { Bot } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import setupSession from "./middlewares/session.js";
import logger from "../utils/logger.js";
import env from "../config/env.js";
import userContext from "./middlewares/userContext.js";
import rootComposer from "./composers/root.js";
import { setupBotErrorHandling } from "./handlers/errorHandler.js";
import { createPoolConversation } from "./conversations/createPoolConversation.js";
import { createApp } from "../server/app.js";
import { webhookCallback } from "grammy";

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
    const webhookUrl = `${env.webhookDomain}/webhook/${env.botToken}`;

    logger.info(`Setting up webhook for @${botInfo.username} to ${webhookUrl}`);

    await bot.api.setWebhook(webhookUrl, {
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
        secret_token: env.webhookSecret,
    });

    const app = createApp();

    app.post(`/webhook/${env.botToken}`, (req, res, next) => {
        logger.info("🎯 Webhook route hit!");
        // Explicitly handle the update
        const handler = webhookCallback(bot, "express");
        handler(req, res, next);
    });

    const port = env.port || 3000;
    const host = env.host || "0.0.0.0";

    const webhookServer = app.listen(port, host, () => {
        logger.info(`Webhook server listening on ${host}:${port}`);
        logger.info(`🤖 Bot @${botInfo.username} started successfully`);

        if (env.botAdminId && env.isProduction) {
            bot.api.sendMessage(
                env.botAdminId,
                `✅ Бот @${botInfo.username} запущен в режиме webhook на порту ${port}`
            ).catch(err => logger.warn("Failed to send startup message to admin"));
        }
    });

    return webhookServer;
};

export const createBot = () => {
    const bot = new Bot(env.botToken);

    setupBotErrorHandling(bot);
    initializeMiddlewares(bot);

    return bot;
};
