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
  askPaymentAmount,
  requestCustomPaymentAmount,
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

composer.callbackQuery(/^pay:([a-f0-9]{24}):(transfer|cash)$/, handlePay);
composer.callbackQuery(/^pool:([a-f0-9]{24})$/, sendOwnerPool);
composer.callbackQuery(/^confirm:([a-f0-9]{24}):([a-f0-9]{24})$/, confirmPayment);
composer.callbackQuery(/^manual:([a-f0-9]{24}):([a-f0-9]{24})$/, manualConfirmPayment);
composer.callbackQuery(/^close:([a-f0-9]{24})$/, closePool);
composer.callbackQuery(/^open:([a-f0-9]{24})$/, openPool);
composer.callbackQuery(/^pmenu:([a-f0-9]{24}):(\d+)$/, sendPaymentMenu);
composer.callbackQuery(/^pmc:([a-f0-9]{24}):([a-f0-9]{24}):(\d+)$/, confirmPaymentFromMenu);
composer.callbackQuery(/^pmm:([a-f0-9]{24}):([a-f0-9]{24}):(\d+)$/, manualConfirmPaymentFromMenu);
composer.callbackQuery(/^selfpay:([a-f0-9]{24}):(\d+)$/, selfConfirmPayment);
composer.callbackQuery(/^pamount:([a-f0-9]{24}):([a-f0-9]{24}):(\d+):(confirm|manual|c|m)$/, askPaymentAmount);
composer.callbackQuery(/^pafull:([a-f0-9]{24}):([a-f0-9]{24}):(\d+):(confirm|manual|c|m)$/, setFullPaymentAmount);
composer.callbackQuery(/^pacustom:([a-f0-9]{24}):([a-f0-9]{24}):(\d+):(confirm|manual|c|m)$/, requestCustomPaymentAmount);
composer.on("message:text", handlePaymentAmountInput);

export default composer;
