import { InlineKeyboard } from "grammy";
import { ensureParticipant, getPoolById, getPoolByJoinCode, markParticipantPaid, markParticipantDeclined } from "../../services/poolService.js";
import { buildParticipantPoolView } from "../presenters/poolPresenter.js";
import { getDisplayName } from "../../services/userService.js";
import { ensureUserInContext } from "../../utils/context.js";
import { encodeInlineId } from "../../utils/idCodec.js";
import logger from "../../utils/logger.js";
import { escapeHtml } from "../../utils/text.js";
import { sendMainMenu } from "./menuHandlers.js";

export const handleStart = async (ctx) => {
  const payload = (ctx.match || "").trim();
  if (payload) {
    await handleJoin(ctx, payload);
    return;
  }

  await ensureUserInContext(ctx);
  await sendMainMenu(ctx);
};

export const handleJoin = async (ctx, joinCode) => {
  const payload = (joinCode ?? ctx.match ?? "").trim();
  const pool = await getPoolByJoinCode(payload);
  if (!pool) {
    await ctx.reply("⚠️ Сбор не найден или закрыт. Проверь ссылку у организатора.", { parse_mode: "HTML" });
    return;
  }

  const { user } = (await ensureUserInContext(ctx)) || {};
  if (!user) {
    await ctx.reply("⚠️ Не удалось загрузить твой профиль. Попробуй снова.", { parse_mode: "HTML" });
    return;
  }

  const updatedPool = await ensureParticipant(pool, user, { shareAmount: pool.shareAmount });

  const { text, keyboard } = buildParticipantPoolView(updatedPool);

  // If call is from a callback button (Invite message), edit it.
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML", disable_web_page_preview: true });
    await ctx.answerCallbackQuery("Вы присоединились к сбору!");
  } else {
    // Deep link join
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML", disable_web_page_preview: true });
  }
};

export const handleDecline = async (ctx, joinCode) => {
  try {
    // If joinCode is passed, use it. Otherwise try to extract from match context if it's a string (though unlikely with regex callback)
    const payload = (joinCode ?? (typeof ctx.match === 'string' ? ctx.match : "")).trim();

    // Note: To decline securely we should verify the user is actually invited to this pool?
    // Using joinCode to find pool is fine.

    const pool = await getPoolByJoinCode(payload);
    if (!pool) {
      await ctx.answerCallbackQuery("Сбор не найден");
      return;
    }

    const { user } = (await ensureUserInContext(ctx)) || {};
    if (!user) {
      await ctx.answerCallbackQuery("Ошибка авторизации");
      return;
    }

    // Call service to mark declined
    // We need to import markParticipantDeclined
    await markParticipantDeclined({ poolId: pool.id, userId: user.id });

    await ctx.editMessageText(`❌ Вы отказались от участия в сборе <b>«${escapeHtml(pool.title)}»</b>.`, {
      parse_mode: "HTML",
      reply_markup: undefined // Remove buttons
    });
    await ctx.answerCallbackQuery("Вы отказались от участия");
  } catch (error) {
    logger.error({ error }, "Error in handleDecline");
    await ctx.answerCallbackQuery("Произошла ошибка при отказе");
  }
};

export const handlePay = async (ctx) => {
  const [poolId, method] = [ctx.match[1], ctx.match[2]];
  const { user } = (await ensureUserInContext(ctx)) || {};
  if (!user) {
    await ctx.answerCallbackQuery({ text: "Не удалось загрузить пользователя", show_alert: true });
    return;
  }

  const pool = await getPoolById(poolId);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт организатором", show_alert: true });
    return;
  }

  await ensureParticipant(pool, user, { shareAmount: pool.shareAmount });
  const updated = await markParticipantPaid({ poolId, userId: user.id, payMethod: method });

  if (!updated) {
    await ctx.answerCallbackQuery({ text: "Не удалось отметить оплату", show_alert: true });
    return;
  }

  const methodText = method === "cash" ? "наличными" : "по реквизитам";

  await ctx.answerCallbackQuery({ text: "Отметил оплату. Ждет подтверждения." });
  try {
    await ctx.editMessageReplyMarkup();
  } catch (error) {
    logger.warn({ error }, "Failed to edit reply markup after payment mark");
  }

  await ctx.reply(`✅ Спасибо! Я сообщил организатору, что ты внес деньги ${methodText}.`, {
    parse_mode: "HTML"
  });

  if (updated.owner?.telegramId && updated.owner.telegramId !== user.telegramId) {
    const displayName = getDisplayName(user);
    const text = `💸 <b>${escapeHtml(displayName)}</b> сообщил о взносе в сбор <b>«${escapeHtml(
      updated.title
    )}»</b> (${methodText}). Подтверди взнос, когда получишь деньги.`;
    const participant = updated.participants.find((p) => p.userId === user.id);
    const keyboard =
      participant && participant.id
        ? new InlineKeyboard().text(
          "Подтвердить взнос",
          `pafull:${encodeInlineId(updated.id)}:${encodeInlineId(participant.id)}:1:c`
        )
        : undefined;
    await ctx.api.sendMessage(updated.owner.telegramId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  }
};
