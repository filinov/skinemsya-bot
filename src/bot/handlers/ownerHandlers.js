import { InlineKeyboard } from "grammy";
import {
  confirmParticipantPayment,
  getPoolByIdForOwner,
  getPoolsByOwner,
  manualConfirmParticipantPayment,
  markOwnerSelfPayment,
  deletePoolByOwner,
  setPoolClosed
} from "../../services/poolService.js";
import { ensureUserInContext } from "../../utils/context.js";
import { buildOwnerPoolView } from "../presenters/poolPresenter.js";
import { replyOrEdit } from "../../utils/reply.js";
import { escapeHtml } from "../../utils/text.js";
import { decodeInlineId, encodeInlineId } from "../../utils/idCodec.js";
import logger from "../../utils/logger.js";

const POOLS_PAGE_SIZE = 10;
const PAYMENT_MENU_PAGE_SIZE = 10;

const normalizePaymentMode = (mode) => {
  if (mode === "c" || mode === "confirm") return "confirm";
  if (mode === "m" || mode === "manual") return "manual";
  if (mode === "s" || mode === "self") return "self";
  return mode;
};

const findOwnerParticipant = (pool, owner) => {
  const ownerId = owner?.id;
  if (!ownerId) return null;
  return pool.participants.find((p) => p.userId === ownerId);
};

const findParticipantById = (pool, participantId) =>
  pool.participants.find((participant) => participant.id === participantId);

export const renderOwnerPool = async (ctx, pool) => {
  const { text, shareUrl } = await buildOwnerPoolView(pool, ctx);

  const keyboard = new InlineKeyboard();

  if (!pool.isClosed) {
    keyboard.url("📨 Пригласить участников", shareUrl).row();
    keyboard.text("✍️ Отметить взнос", `pmenu:${encodeInlineId(pool.id)}:1`).row();
  }

  const toggleLabel = pool.isClosed ? "🔓 Открыть сбор" : "⛔️ Закрыть сбор";
  const toggleAction = pool.isClosed ? `open:${encodeInlineId(pool.id)}` : `close_confirm:${encodeInlineId(pool.id)}`;
  keyboard.row().text(toggleLabel, toggleAction);
  if (pool.isClosed) {
    keyboard.row().text("🗑 Удалить сбор", `delete_confirm:${encodeInlineId(pool.id)}`);
  }
  keyboard.row().text("⬅️ К списку", "action:pools");

  const messageOptions = {
    reply_markup: keyboard,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, messageOptions);
  } else {
    await ctx.reply(text, messageOptions);
  }
};

const participantExpectedAmount = (participant, pool) =>
  participant.expectedAmount ?? pool.shareAmount ?? pool.perPersonAmount ?? pool.totalAmount ?? 0;

const extractTargetMessage = (ctx) => {
  const msg = ctx.callbackQuery?.message;
  if (!msg || !ctx.chat) return null;
  return { chatId: ctx.chat.id, messageId: msg.message_id };
};

const buildPaymentMenu = (pool, page = 1, owner) => {
  const sortedParticipants = [...pool.participants].sort((a, b) => {
    const weight = (p) => (p.status === "confirmed" ? 1 : 0);
    return weight(a) - weight(b);
  });
  const ownerParticipant = findOwnerParticipant(pool, owner);
  const ownerPaid = ownerParticipant && (ownerParticipant.status === "confirmed" || ownerParticipant.paidAmount > 0);
  const safePageSize = PAYMENT_MENU_PAGE_SIZE;
  const total = sortedParticipants.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safePageSize;
  const items = sortedParticipants.slice(start, start + safePageSize);

  const lines = items.length
    ? items.map((p, idx) => {
        const position = start + idx + 1;
        const icon = p.status === "confirmed" ? "✅" : p.status === "marked_paid" ? "⏳" : "❌";
        return `${position}. ${icon} <b>${escapeHtml(p.displayName)}</b>`;
      })
    : ["Пока нет участников. Отправь ссылку, чтобы они присоединились."];

  const keyboard = new InlineKeyboard();
  if (!ownerPaid) {
    keyboard.text("Отметить свой взнос", `selfpay:${encodeInlineId(pool.id)}:${currentPage}`).row();
  }
  items.forEach((p) => {
    if (p.status === "confirmed") {
      return;
    }
    if (p.status === "marked_paid") {
      keyboard
        .text(
          `Подтвердить: ${p.displayName}`,
          `pafull:${encodeInlineId(pool.id)}:${encodeInlineId(p.id)}:${currentPage}:c`
        )
        .row();
      return;
    }
    keyboard
      .text(
        `Отметить взнос: ${p.displayName}`,
        `pafull:${encodeInlineId(pool.id)}:${encodeInlineId(p.id)}:${currentPage}:m`
      )
      .row();
  });

  if (totalPages > 1) {
    const hasPrev = currentPage > 1;
    const hasNext = currentPage < totalPages;
    const navRow = new InlineKeyboard();
    navRow.text("◀️", hasPrev ? `pmenu:${encodeInlineId(pool.id)}:${currentPage - 1}` : "noop");
    navRow.text(`${currentPage} из ${totalPages}`, "noop");
    navRow.text("▶️", hasNext ? `pmenu:${encodeInlineId(pool.id)}:${currentPage + 1}` : "noop");
    keyboard.inline_keyboard.push(navRow.inline_keyboard[0]);
  }

  keyboard.text("⬅️ Назад к сбору", `pool:${encodeInlineId(pool.id)}`);

  return {
    text: `💸 <b>Отметьте кто сделал взнос</b>\nИспользуй кнопки ниже для отметки или подтверждения.\n\n${lines.join("\n")}`,
    keyboard,
    currentPage,
    totalPages
  };
};

const renderPaymentMenu = async (ctx, pool, page = 1, owner, targetMessage) => {
  const { text, keyboard } = buildPaymentMenu(pool, page, owner);
  const options = {
    reply_markup: keyboard,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (targetMessage?.chatId && targetMessage?.messageId) {
    await ctx.api.editMessageText(targetMessage.chatId, targetMessage.messageId, text, options);
    return;
  }

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, options);
  } else {
    await ctx.reply(text, options);
  }
};

export const sendOwnerPools = async (ctx, page = 1) => {
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.reply("⚠️ Не удалось загрузить данные пользователя.", { parse_mode: "HTML" });
    return;
  }

  let { items: pools, total, limit, page: currentPage } = await getPoolsByOwner(owner.id, {
    limit: POOLS_PAGE_SIZE,
    page
  });
  let totalPages = Math.max(1, Math.ceil(total / limit));

  if (total > 0 && pools.length === 0 && currentPage > totalPages) {
    ({ items: pools, total, limit, page: currentPage } = await getPoolsByOwner(owner.id, {
      limit: POOLS_PAGE_SIZE,
      page: totalPages
    }));
    totalPages = Math.max(1, Math.ceil(total / limit));
  }

  if (!pools.length) {
    const keyboard = new InlineKeyboard()
      .text("➕ Создать сбор", "action:new").row()
      .text("⬅️ В меню", "action:menu");

    await replyOrEdit(
      ctx,
      "📭 У тебя пока нет сборов. Нажми «➕ Создать сбор», чтобы начать.",
      { reply_markup: keyboard }
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  pools.forEach((pool) => {
    const title = pool.title.slice(0, 36);
    const label = pool.isClosed ? `🔒 ${title}` : title;
    keyboard.text(label, `pool:${encodeInlineId(pool.id)}`).row();
  });

  if (totalPages > 1) {
    const hasPrev = currentPage > 1;
    const hasNext = currentPage < totalPages;
    const navRow = new InlineKeyboard();
    navRow.text("◀️", hasPrev ? `pools:page:${currentPage - 1}` : "noop");
    navRow.text(`${currentPage} из ${totalPages}`, "noop");
    navRow.text("▶️", hasNext ? `pools:page:${currentPage + 1}` : "noop");
    keyboard.inline_keyboard.push(navRow.inline_keyboard[0]);
  }

  keyboard.row().text("⬅️ В меню", "action:menu");

  await replyOrEdit(ctx, `📂 <b>Мои сборы</b>\nВыбери нужный, чтобы посмотреть детали.`, {
    reply_markup: keyboard
  });
};

export const sendOwnerPool = async (ctx) => {
  const poolId = decodeInlineId(ctx.match[1]);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }

  await renderOwnerPool(ctx, pool);
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
};

export const sendPaymentMenu = async (ctx) => {
  const [poolId, pageRaw] = [decodeInlineId(ctx.match[1]), ctx.match[2]];
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }

  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  const page = Number(pageRaw ?? 1);
  await renderPaymentMenu(ctx, pool, page, owner);
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
  }
};

export const askPaymentAmount = async (ctx) => {
  const [poolId, participantId, pageRaw, modeRaw] = [
    decodeInlineId(ctx.match[1]),
    decodeInlineId(ctx.match[2]),
    ctx.match[3],
    ctx.match[4]
  ];
  const mode = normalizePaymentMode(modeRaw);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  const participant = findParticipantById(pool, participantId);
  if (!participant) {
    await ctx.answerCallbackQuery({ text: "Участник не найден", show_alert: true });
    await renderPaymentMenu(ctx, pool, Number(pageRaw ?? 1), owner);
    return;
  }

  const expected = participantExpectedAmount(participant, pool);
  const page = Number(pageRaw ?? 1);
  const target = extractTargetMessage(ctx);
  const updatedPool = await applyOwnerAmountUpdate({
    ctx,
    poolId,
    participantId,
    owner,
    amount: expected,
    page,
    mode,
    targetMessage: target
  });
  if (!updatedPool) return;
  await ctx.answerCallbackQuery({ text: "Взнос отмечен" });
  if (mode === "confirm" || mode === "manual") {
    await notifyPaymentConfirmed({ ctx, pool: updatedPool, participantId, owner });
  }
};

const applyOwnerAmountUpdate = async ({ ctx, poolId, participantId, owner, amount, page, mode, targetMessage }) => {
  const normalizedMode = normalizePaymentMode(mode);
  let updatedPool = null;
  if (normalizedMode === "confirm") {
    updatedPool = await confirmParticipantPayment({ poolId, participantId, ownerId: owner.id, amount });
  } else if (normalizedMode === "manual") {
    updatedPool = await manualConfirmParticipantPayment({ poolId, participantId, ownerId: owner.id, amount });
  } else if (normalizedMode === "self") {
    updatedPool = await markOwnerSelfPayment({ poolId, owner, amount });
  }
  if (!updatedPool) {
    await ctx.answerCallbackQuery({ text: "Не удалось отметить взнос", show_alert: true });
    return null;
  }
  await renderPaymentMenu(ctx, updatedPool, page, owner, targetMessage);
  return updatedPool;
};

const notifyPaymentConfirmed = async ({ ctx, pool, participantId, owner }) => {
  const participant = findParticipantById(pool, participantId);
  if (participant?.user?.telegramId && participant.user.telegramId !== owner.telegramId) {
    const text = `✅ Организатор подтвердил твой взнос в сборе <b>«${escapeHtml(pool.title)}»</b>. Спасибо!`;
    await ctx.api.sendMessage(participant.user.telegramId, text, { parse_mode: "HTML" });
  }
};

const notifyParticipantsPoolClosed = async (ctx, pool, owner) => {
  const notified = new Set();
  const text = `⛔️ Сбор <b>«${escapeHtml(pool.title)}»</b> закрыт организатором. Спасибо за участие!`;

  const tasks = pool.participants
    .map((participant) => {
      const user = participant.user;
      const tgId = user?.telegramId;
      if (!tgId || tgId === owner.telegramId || notified.has(tgId)) return null;
      notified.add(tgId);
      return ctx.api.sendMessage(tgId, text, { parse_mode: "HTML" });
    })
    .filter(Boolean);

  if (!tasks.length) return;

  try {
    await Promise.allSettled(tasks);
  } catch (error) {
    logger.warn({ error }, "Failed to notify participants about closed pool");
  }
};

export const setFullPaymentAmount = async (ctx) => {
  const [poolId, participantId, pageRaw, modeRaw] = [
    decodeInlineId(ctx.match[1]),
    decodeInlineId(ctx.match[2]),
    ctx.match[3],
    ctx.match[4]
  ];
  const mode = normalizePaymentMode(modeRaw);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  const participant = participantId ? findParticipantById(pool, participantId) : null;
  const expected = participant ? participantExpectedAmount(participant, pool) : pool.shareAmount ?? 0;
  const page = Number(pageRaw ?? 1);
  const target = extractTargetMessage(ctx);

  const updatedPool = await applyOwnerAmountUpdate({
    ctx,
    poolId,
    participantId,
    owner,
    amount: expected,
    page,
    mode,
    targetMessage: target
  });

  if (!updatedPool) return;
  await ctx.answerCallbackQuery({ text: "Взнос отмечен" });
  if (mode === "confirm" || mode === "manual") {
    await notifyPaymentConfirmed({ ctx, pool: updatedPool, participantId, owner });
  }
};

export const confirmPayment = async (ctx) => {
  const [poolId, participantId] = [decodeInlineId(ctx.match[1]), decodeInlineId(ctx.match[2])];
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await confirmParticipantPayment({ poolId, participantId, ownerId: owner.id });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось подтвердить", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Платеж подтвержден" });

  await renderOwnerPool(ctx, pool);

  const participant = findParticipantById(pool, participantId);
  if (participant?.user?.telegramId && participant.user.telegramId !== owner.telegramId) {
    await ctx.api.sendMessage(
      participant.user.telegramId,
      `✅ Организатор подтвердил твой взнос в сборе <b>«${escapeHtml(pool.title)}»</b>. Спасибо!`
    );
  }
};

export const manualConfirmPayment = async (ctx) => {
  const [poolId, participantId] = [decodeInlineId(ctx.match[1]), decodeInlineId(ctx.match[2])];
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await manualConfirmParticipantPayment({ poolId, participantId, ownerId: owner.id });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось отметить взнос", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Взнос отмечен" });
  await renderOwnerPool(ctx, pool);

  const participant = findParticipantById(pool, participantId);
  if (participant?.user?.telegramId && participant.user.telegramId !== owner.telegramId) {
    await ctx.api.sendMessage(
      participant.user.telegramId,
      `✅ Организатор отметил твой взнос в сборе «${escapeHtml(pool.title)}». Спасибо!`
    );
  }
};

export const confirmPaymentFromMenu = async (ctx) => {
  const [poolId, participantId, pageRaw] = [decodeInlineId(ctx.match[1]), decodeInlineId(ctx.match[2]), ctx.match[3]];
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await confirmParticipantPayment({ poolId, participantId, ownerId: owner.id });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось подтвердить", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Платеж подтвержден" });
  const page = Number(pageRaw ?? 1);
  await renderPaymentMenu(ctx, pool, page, owner);

  const participant = findParticipantById(pool, participantId);
  if (participant?.user?.telegramId && participant.user.telegramId !== owner.telegramId) {
    await ctx.api.sendMessage(
      participant.user.telegramId,
      `✅ Организатор подтвердил твой взнос в сборе <b>«${escapeHtml(pool.title)}»</b>. Спасибо!`
    );
  }
};

export const manualConfirmPaymentFromMenu = async (ctx) => {
  const [poolId, participantId, pageRaw] = [decodeInlineId(ctx.match[1]), decodeInlineId(ctx.match[2]), ctx.match[3]];
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await manualConfirmParticipantPayment({ poolId, participantId, ownerId: owner.id });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось отметить взнос", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Взнос отмечен" });
  const page = Number(pageRaw ?? 1);
  await renderPaymentMenu(ctx, pool, page, owner);

  const participant = findParticipantById(pool, participantId);
  if (participant?.user?.telegramId && participant.user.telegramId !== owner.telegramId) {
    await ctx.api.sendMessage(
      participant.user.telegramId,
      `✅ Организатор отметил твой взнос в сборе «${escapeHtml(pool.title)}». Спасибо!`
    );
  }
};

export const selfConfirmPayment = async (ctx) => {
  const [poolId, pageRaw] = [decodeInlineId(ctx.match[1]), ctx.match[2]];
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const current = await getPoolByIdForOwner(poolId, owner.id);
  if (!current) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }
  if (current.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор закрыт, отметки недоступны", show_alert: true });
    return;
  }

  const pool = await markOwnerSelfPayment({ poolId, owner });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось отметить взнос", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Отметил свой взнос" });
  const page = Number(pageRaw ?? 1);
  await renderPaymentMenu(ctx, pool, page, owner);
};

export const closePool = async (ctx) => {
  const poolId = decodeInlineId(ctx.match[1]);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const current = await getPoolByIdForOwner(poolId, owner.id);
  if (!current) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }

  if (current.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор уже закрыт" });
    await renderOwnerPool(ctx, current);
    return;
  }

  const pool = await setPoolClosed({ poolId, ownerId: owner.id, isClosed: true });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось закрыть", show_alert: true });
    return;
  }

  await notifyParticipantsPoolClosed(ctx, pool, owner);

  await ctx.answerCallbackQuery({ text: "Сбор закрыт" });
  await renderOwnerPool(ctx, pool);
};

export const confirmClosePool = async (ctx) => {
  const poolId = decodeInlineId(ctx.match[1]);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }
  if (pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Сбор уже закрыт" });
    await renderOwnerPool(ctx, pool);
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("✅ Да, закрыть", `close:${encodeInlineId(pool.id)}`)
    .row()
    .text("↩️ Отмена", `pool:${encodeInlineId(pool.id)}`);

  await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  await ctx.answerCallbackQuery({ text: "Подтверди закрытие" });
};

export const openPool = async (ctx) => {
  const poolId = decodeInlineId(ctx.match[1]);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await setPoolClosed({ poolId, ownerId: owner.id, isClosed: false });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Не удалось открыть", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Сбор снова открыт" });
  await renderOwnerPool(ctx, pool);
};

export const confirmDeletePool = async (ctx) => {
  const poolId = decodeInlineId(ctx.match[1]);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Сбор не найден", show_alert: true });
    return;
  }
  if (!pool.isClosed) {
    await ctx.answerCallbackQuery({ text: "Удалять можно только закрытый сбор", show_alert: true });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("✅ Да, удалить", `delete:${encodeInlineId(pool.id)}`)
    .row()
    .text("↩️ Отмена", `pool:${encodeInlineId(pool.id)}`);

  await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  await ctx.answerCallbackQuery({ text: "Подтверди удаление" });
};

export const deletePool = async (ctx) => {
  const poolId = decodeInlineId(ctx.match[1]);
  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    return;
  }

  const pool = await deletePoolByOwner({ poolId, ownerId: owner.id });
  if (!pool) {
    await ctx.answerCallbackQuery({ text: "Можно удалить только закрытый сбор", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Сбор удалён" });
  await replyOrEdit(ctx, "Сбор удалён.");
  await sendOwnerPools(ctx);
};
