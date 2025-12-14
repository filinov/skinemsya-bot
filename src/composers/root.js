import { Composer } from "grammy";
import { sendHelp, sendMainMenu } from "../handlers/menuHandlers.js";
import {
  closePool,
  confirmPayment,
  confirmPaymentFromMenu,
  handlePaymentAmountInput,
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
import { handlePay, handleStart } from "../handlers/participantHandlers.js";

const composer = new Composer();

composer.command("start", handleStart);

composer.command("new", (ctx) => ctx.conversation.enter("createPool"));
composer.hears("Создать сбор", (ctx) => ctx.conversation.enter("createPool"));
composer.hears("➕ Создать сбор", (ctx) => ctx.conversation.enter("createPool"));
composer.callbackQuery("action:new", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("createPool");
});

composer.command("pools", sendOwnerPools);
composer.hears("Мои сборы", sendOwnerPools);
composer.hears("📂 Мои сборы", sendOwnerPools);
composer.callbackQuery("action:pools", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendOwnerPools(ctx);
});
composer.callbackQuery(/^pools:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendOwnerPools(ctx, Number(ctx.match[1]));
});

composer.command("help", sendHelp);
composer.hears("Помощь", sendHelp);
composer.hears("❔ Помощь", sendHelp);
composer.callbackQuery("action:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendHelp(ctx);
});
composer.callbackQuery("action:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendMainMenu(ctx);
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
composer.on("message:text", handlePaymentAmountInput);

export default composer;
