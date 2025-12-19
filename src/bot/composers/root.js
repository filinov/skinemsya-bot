import { Composer } from "grammy";
import { sendHelp, sendMainMenu } from "../handlers/menuHandlers.js";
import {
  closePool,
  confirmPayment,
  confirmPaymentFromMenu,
  manualConfirmPayment,
  manualConfirmPaymentFromMenu,
  openPool,
  confirmDeletePool,
  deletePool,
  confirmClosePool,
  setFullPaymentAmount,
  selfConfirmPayment,
  sendPaymentMenu,
  sendOwnerPool,
  sendOwnerPools
} from "../handlers/ownerHandlers.js";
import { handlePay, handleStart, handleJoin, handleDecline } from "../handlers/participantHandlers.js";

const composer = new Composer();

// Команда /start
composer.command("start", handleStart);

// Обработка приглашений
composer.callbackQuery(/^join:([a-f0-9]+)$/, async (ctx) => {
  await handleJoin(ctx, ctx.match[1]);
});

composer.callbackQuery(/^decline:([a-f0-9]+)$/, async (ctx) => {
  // We need to ensure ctx.match is available or passed. 
  // GrammY passes regex matches in ctx.match. 
  // My handleDecline implementation checks `ctx.match` which might be the whole string or array depending on regex.
  // Let's rely on standard grammy behavior: ctx.match[1] will be the joinCode.
  // Wait, my handleDecline implementation uses `(ctx.match || "").trim()` which seems designed for deep link start payload.
  // I should update handleDecline or the call here to be consistent.
  // Actually, handleDecline uses `const payload = (ctx.match || "").trim()`. 
  // If ctx.match is an array (from regex), trim() will fail or be weird.
  // Let's pass the joinCode explicitly to be safe, like handleJoin.
  await handleDecline(ctx, ctx.match[1]);
});

// Создание нового сбора
composer.command("new", (ctx) => ctx.conversation.enter("createPool"));
composer.callbackQuery("action:new", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("createPool");
});

// Мои сборы
composer.command("pools", sendOwnerPools);
composer.callbackQuery("action:pools", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendOwnerPools(ctx);
});

// Пагинация в списке сборов
composer.callbackQuery(/^pools:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendOwnerPools(ctx, Number(ctx.match[1]));
});

// Помощь
composer.command("help", sendHelp);
composer.callbackQuery("action:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendHelp(ctx);
});

// Главное меню
composer.callbackQuery("action:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendMainMenu(ctx);
});

// Fallback for stale confirmation buttons in create flow
composer.callbackQuery(/^(confirm_create|cancel_create)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Что-то пошло не так. Начни создание заново.", show_alert: true });
});

composer.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

const poolIdPattern = "([a-zA-Z0-9_-]+)";
composer.callbackQuery(new RegExp(`^pay:${poolIdPattern}:(transfer|cash)$`), handlePay);
composer.callbackQuery(new RegExp(`^pool:${poolIdPattern}$`), sendOwnerPool);
composer.callbackQuery(new RegExp(`^confirm:${poolIdPattern}:${poolIdPattern}$`), confirmPayment);
composer.callbackQuery(new RegExp(`^manual:${poolIdPattern}:${poolIdPattern}$`), manualConfirmPayment);
composer.callbackQuery(new RegExp(`^close_confirm:${poolIdPattern}$`), confirmClosePool);
composer.callbackQuery(new RegExp(`^close:${poolIdPattern}$`), closePool);
composer.callbackQuery(new RegExp(`^open:${poolIdPattern}$`), openPool);
composer.callbackQuery(new RegExp(`^delete_confirm:${poolIdPattern}$`), confirmDeletePool);
composer.callbackQuery(new RegExp(`^delete:${poolIdPattern}$`), deletePool);
composer.callbackQuery(new RegExp(`^pmenu:${poolIdPattern}:(\\d+)$`), sendPaymentMenu);
composer.callbackQuery(new RegExp(`^pmc:${poolIdPattern}:${poolIdPattern}:(\\d+)$`), confirmPaymentFromMenu);
composer.callbackQuery(new RegExp(`^pmm:${poolIdPattern}:${poolIdPattern}:(\\d+)$`), manualConfirmPaymentFromMenu);
composer.callbackQuery(new RegExp(`^selfpay:${poolIdPattern}:(\\d+)$`), selfConfirmPayment);
composer.callbackQuery(new RegExp(`^pamount:${poolIdPattern}:${poolIdPattern}:(\\d+):(confirm|manual|c|m)$`), setFullPaymentAmount);
composer.callbackQuery(new RegExp(`^pafull:${poolIdPattern}:${poolIdPattern}:(\\d+):(confirm|manual|c|m)$`), setFullPaymentAmount);

export default composer;
