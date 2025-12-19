import logger from "../utils/logger.js";
import { GrammyError } from "grammy";

export const commands = [
    { command: "new", description: "➕ Создать сбор" },
    { command: "pools", description: "📋 Мои сборы" },
    { command: "help", description: "❓ Помощь" }
];

export const setupBotCommands = async (bot) => {
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
