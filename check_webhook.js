import { Bot } from "grammy";
import env from "./src/config/env.js";

const check = async () => {
    console.log("Checking webhook status for bot...");
    const bot = new Bot(env.botToken);
    try {
        const info = await bot.api.getWebhookInfo();
        console.log("Current Webhook Info:", JSON.stringify(info, null, 2));
    } catch (e) {
        console.error("Failed to get webhook info:", e);
    }
};

check();
