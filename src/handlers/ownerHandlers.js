import { InlineKeyboard } from "grammy";
import {
  confirmParticipantPayment,
  getPoolByIdForOwner,
  getPoolsByOwner,
  manualConfirmParticipantPayment,
  markOwnerSelfPayment,
  setPoolClosed
} from "../services/poolService.js";
import { ensureUserInContext } from "../utils/context.js";
import { buildOwnerPoolView } from "../presenters/poolPresenter.js";
import { replyOrEdit } from "../utils/reply.js";
import { escapeHtml, formatAmount } from "../utils/text.js";
import logger from "../utils/logger.js";

const POOLS_PAGE_SIZE = 3;
const PAYMENT_MENU_PAGE_SIZE = 6;

const normalizePaymentMode = (mode) => {
  if (mode === "c" || mode === "confirm") return "confirm";
  if (mode === "m" || mode === "manual") return "manual";
  if (mode === "s" || mode === "self") return "self";
  return mode;
};

const compactPaymentMode = (mode) => {
  const normalized = normalizePaymentMode(mode);
  if (normalized === "confirm") return "c";
  if (normalized === "manual") return "m";
  if (normalized === "self") return "s";
  return normalized || "";
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
    keyboard.url("🔗 Поделиться сбором", shareUrl).row();
    keyboard.text("💸 Отметить взнос", `pmenu:${pool.id}:1`).row();
  }

  const toggleLabel = pool.isClosed ? "🔓 Открыть сбор" : "⛔️ Закрыть сбор";
  keyboard.row().text(toggleLabel, `${pool.isClosed ? "open" : "close"}:${pool.id}`);
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
        const expected = participantExpectedAmount(p, pool);
        const paid =
          p.paidAmount ?? (p.status === "marked_paid" || p.status === "confirmed" ? expected : 0);
        const paidText = formatAmount(paid, pool.currency);
        const expectedText = formatAmount(expected, pool.currency);
        return `${position}. <b>${escapeHtml(p.displayName)}</b> — (${paidText} из ${expectedText})`;
      })
    : ["Пока нет участников. Отправь ссылку, чтобы они присоединились."];

  const keyboard = new InlineKeyboard();
  if (!ownerPaid) {
    keyboard.text("Отметить свой взнос", `selfpay:${pool.id}:${currentPage}`).row();
  }
  items.forEach((p) => {
    if (p.status === "confirmed") {
      return;
    }
    if (p.status === "marked_paid") {
      keyboard.text(`Подтвердить: ${p.displayName}`, `pamount:${pool.id}:${p.id}:${currentPage}:c`).row();
      return;
    }
    keyboard.text(`Отметить взнос: ${p.displayName}`, `pamount:${pool.id}:${p.id}:${currentPage}:m`).row();
  });

  if (totalPages > 1) {
    const hasPrev = currentPage > 1;
    const hasNext = currentPage < totalPages;
    const navRow = new InlineKeyboard();
    if (hasPrev) navRow.text("◀️", `pmenu:${pool.id}:${currentPage - 1}`);
    navRow.text(`Стр. ${currentPage}/${totalPages}`, "noop");
    if (hasNext) navRow.text("▶️", `pmenu:${pool.id}:${currentPage + 1}`);
    keyboard.inline_keyboard.push(navRow.inline_keyboard[0]);
  }

  keyboard.text("⬅️ Назад к сбору", `pool:${pool.id}`);

  return {
    text: `💸 <b>Отметьте кто сделал взнос</b>\n\n${lines.join("\n")}`,
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
      .text("➕ Создать сбор", "action:new")
      .row()
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
    keyboard.text(label, `pool:${pool.id}`).row();
  });

  if (totalPages > 1) {
    const hasPrev = currentPage > 1;
    const hasNext = currentPage < totalPages;
    const navRow = new InlineKeyboard();
    if (hasPrev) navRow.text("◀️ назад", `pools:page:${currentPage - 1}`);
    navRow.text(`Стр. ${currentPage}/${totalPages}`, "noop");
    if (hasNext) navRow.text("▶️ вперёд", `pools:page:${currentPage + 1}`);
    keyboard.inline_keyboard.push(navRow.inline_keyboard[0]);
  }

  keyboard.row().text("⬅️ В меню", "action:menu");

  const pageInfo = totalPages > 1 ? `\n\n(стр. ${currentPage}/${totalPages})` : "";

  await replyOrEdit(ctx, `📂 <b>Выбери сбор, чтобы посмотреть статус</b>:`, {
    reply_markup: keyboard
  });
};

export const sendOwnerPool = async (ctx) => {
  const poolId = ctx.match[1];
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
  const [poolId, pageRaw] = [ctx.match[1], ctx.match[2]];
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

const buildAmountChoiceKeyboard = (pool, participant, page, mode) => {
  const expected = participantExpectedAmount(participant, pool);
  const modeToken = compactPaymentMode(mode) || "m";
  return new InlineKeyboard()
    .text(`💯 Всю сумму (${formatAmount(expected, pool.currency)})`, `pafull:${pool.id}:${participant.id}:${page}:${modeToken}`)
    .row()
    .text("✏️ Ввести сумму", `pacustom:${pool.id}:${participant.id}:${page}:${modeToken}`)
    .row()
    .text("⬅️ Назад", `pmenu:${pool.id}:${page}`);
};

export const askPaymentAmount = async (ctx) => {
  const [poolId, participantId, pageRaw, modeRaw] = [ctx.match[1], ctx.match[2], ctx.match[3], ctx.match[4]];
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
  const kb = buildAmountChoiceKeyboard(pool, participant, Number(pageRaw ?? 1), mode);
  const text = `Сколько внес ${escapeHtml(participant.displayName)}?\nОжидается: <b>${formatAmount(
    expected,
    pool.currency
  )}</b>`;

  await ctx.editMessageText(text, { reply_markup: kb, parse_mode: "HTML", disable_web_page_preview: true });
  await ctx.answerCallbackQuery();
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
  const [poolId, participantId, pageRaw, modeRaw] = [ctx.match[1], ctx.match[2], ctx.match[3], ctx.match[4]];
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

export const requestCustomPaymentAmount = async (ctx) => {
  const [poolId, participantId, pageRaw, modeRaw] = [ctx.match[1], ctx.match[2], ctx.match[3], ctx.match[4]];
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

  const target = extractTargetMessage(ctx);
  ctx.session.pendingPaymentAmount = {
    poolId,
    participantId,
    page: Number(pageRaw ?? 1),
    mode,
    targetMessage: target
  };

  const expected = participantExpectedAmount(participant, pool);
  await ctx.answerCallbackQuery({ text: "Введи сумму цифрой", show_alert: false });
  await ctx.reply(
    `✏️ Напиши сумму взноса для ${escapeHtml(participant.displayName)}. Ожидается: <b>${formatAmount(
      expected,
      pool.currency
    )}</b>`,
    { parse_mode: "HTML" }
  );
};

export const handlePaymentAmountInput = async (ctx, next) => {
  const pending = ctx.session?.pendingPaymentAmount;
  if (!pending) return next();
  const text = ctx.message?.text?.trim();
  if (!text) return next();

  const normalized = text.toLowerCase();
  if (["отмена", "cancel", "stop"].includes(normalized)) {
    ctx.session.pendingPaymentAmount = null;
    await ctx.reply("❌ Ты отменил ввод суммы.");
    return;
  }

  const value = Number(text.replace(",", "."));
  if (Number.isNaN(value) || value <= 0) {
    await ctx.reply("⚠️ Нужно положительное число. Введи сумму еще раз.");
    return;
  }

  const owner = (await ensureUserInContext(ctx))?.user;
  if (!owner) {
    ctx.session.pendingPaymentAmount = null;
    await ctx.reply("Нет доступа.");
    return;
  }

  const { poolId, participantId, mode, page = 1, targetMessage } = pending;
  ctx.session.pendingPaymentAmount = null;

  const pool =
    mode === "self"
      ? await markOwnerSelfPayment({ poolId, owner, amount: value })
      : mode === "confirm"
        ? await confirmParticipantPayment({ poolId, participantId, ownerId: owner.id, amount: value })
        : await manualConfirmParticipantPayment({ poolId, participantId, ownerId: owner.id, amount: value });

  if (!pool) {
    await ctx.reply("Не удалось отметить взнос.");
    return;
  }
  if (pool.isClosed) {
    await ctx.reply("Сбор закрыт, отметки недоступны.");
    return;
  }

  await ctx.reply("Взнос отмечен.");
  await renderPaymentMenu(ctx, pool, Number(page), owner, targetMessage);

  if ((mode === "confirm" || mode === "manual") && participantId) {
    await notifyPaymentConfirmed({ ctx, pool, participantId, owner });
  }
};

export const confirmPayment = async (ctx) => {
  const [poolId, participantId] = [ctx.match[1], ctx.match[2]];
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
  const [poolId, participantId] = [ctx.match[1], ctx.match[2]];
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
  const [poolId, participantId, pageRaw] = [ctx.match[1], ctx.match[2], ctx.match[3]];
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
  const [poolId, participantId, pageRaw] = [ctx.match[1], ctx.match[2], ctx.match[3]];
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
  const [poolId, pageRaw] = [ctx.match[1], ctx.match[2]];
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
  const poolId = ctx.match[1];
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

export const openPool = async (ctx) => {
  const poolId = ctx.match[1];
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
