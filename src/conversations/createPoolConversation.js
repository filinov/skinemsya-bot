import { InlineKeyboard } from "grammy";
import { createPool, ensureParticipant, getKnownParticipants } from "../services/poolService.js";
import { upsertUserFromTelegram, getDisplayName } from "../services/userService.js";
import { escapeHtml, formatAmount } from "../utils/text.js";
import logger from "../utils/logger.js";
import { sendMainMenu } from "../handlers/menuHandlers.js";
import { buildOwnerPoolView, buildParticipantPoolView } from "../presenters/poolPresenter.js";

const askForTitle = async (conversation, ctx) => {
  await ctx.reply("🎯 <b>На что собираем?</b>\nНапример, «День рождения Виктора».", { parse_mode: "HTML" });

  while (true) {
    const { message } = await conversation.waitFor("message:text");
    const title = message.text.trim();
    if (title.length >= 3) {
      return title.slice(0, 150);
    }
    await ctx.reply("⚠️ Название слишком короткое. Попробуй еще раз, не меньше 3 символов.", { parse_mode: "HTML" });
  }
};

const askAmountType = async (conversation, ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Всего", "amount_total")
    .row()
    .text("С каждого", "amount_per_person");

  await ctx.reply("💰 <b>Нужно собрать</b>", {
    reply_markup: keyboard,
    parse_mode: "HTML"
  });

  const query = await conversation.waitForCallbackQuery(/amount_(total|per_person)/);
  await query.answerCallbackQuery();

  const data = query.callbackQuery.data;
  return data === "amount_total" ? "total" : "per_person";
};

const askAmountValue = async (conversation, ctx, amountType) => {
  const hint =
    amountType === "total"
      ? `<b>Общая сумма сбора в рублях?</b>\nОтправь число, можно с копейками через точку.`
      : `<b>Сколько должен внести каждый участник в рублях?</b>\nОтправь число, можно с копейками через точку.`;

  await ctx.reply(`💵 ${hint}`, { parse_mode: "HTML" });

  while (true) {
    const { message } = await conversation.waitFor("message:text");
    const raw = message.text.replace(",", ".").trim();
    const value = Number(raw);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
    await ctx.reply("⚠️ Нужно положительное число. Введи сумму еще раз.", { parse_mode: "HTML" });
  }
};

const askPaymentDetails = async (conversation, ctx) => {
  await ctx.reply("🏦 <b>Укажи реквизиты</b>\nКуда переводить деньги (номер карты, телефон, ссылка и т.п.).", {
    parse_mode: "HTML"
  });

  while (true) {
    const { message } = await conversation.waitFor("message:text");
    const details = message.text.trim();
    if (details.length >= 4) {
      return details.slice(0, 500);
    }
    await ctx.reply("⚠️ Реквизиты выглядят слишком короткими. Попробуй еще раз.", { parse_mode: "HTML" });
  }
};

const askParticipants = async (conversation, ctx, knownParticipants, owner) => {
  if (!knownParticipants.length) {
    return [];
  }

  const ownerId = owner?.id;
  const list = knownParticipants
    .map((user, idx) => {
      const baseName = getDisplayName(user);
      const isOwner = ownerId && user.id === ownerId;
      const nameWithTag = isOwner ? `${baseName} (вы)` : baseName;
      return `${idx + 1}. ${nameWithTag}${user.username && !isOwner ? ` (@${user.username})` : ""}`;
    })
    .join("\n");

  const skipKeyboard = new InlineKeyboard().text("Пропустить", "skip_known_participants");

  await ctx.reply(
    `👥 <b>Кого из участников прошлых сборов позвать?</b>\nОтправь порядковые номера через запятую.\n\n${escapeHtml(
      list
    )}`,
    { parse_mode: "HTML", reply_markup: skipKeyboard }
  );

  while (true) {
    const incoming = await conversation.wait();
    const { message, callbackQuery } = incoming;

    if (callbackQuery?.data === "skip_known_participants") {
      await ctx.api.answerCallbackQuery(callbackQuery.id);
      return [];
    }

    if (!message?.text) continue;

    const text = message.text.trim();
    if (text === "-" || text === "—") return [];

    const numbers = text
      .split(/[,\s]+/)
      .map((token) => Number(token))
      .filter((n) => !Number.isNaN(n) && n > 0);

    const unique = Array.from(new Set(numbers));
    const selected = unique
      .map((n) => knownParticipants[n - 1])
      .filter(Boolean);

    if (selected.length) return selected;

    await ctx.reply("⚠️ Не нашел таких номеров. Попробуй еще раз или напиши «-», чтобы пропустить.", {
      parse_mode: "HTML"
    });
  }
};

const askExpectedCount = async (conversation, ctx) => {
  await ctx.reply("👥 Сколько участников планируешь пригласить? Отправь число.", { parse_mode: "HTML" });
  while (true) {
    const { message } = await conversation.waitFor("message:text");
    const value = Number(message.text.trim());
    if (!Number.isNaN(value) && value > 0) {
      return Math.round(value);
    }
    await ctx.reply("⚠️ Нужно указать целое число больше нуля. Попробуй еще раз.", { parse_mode: "HTML" });
  }
};

const askConfirmation = async (conversation, ctx, summary) => {
  const keyboard = new InlineKeyboard().text("Создать", "confirm_create").text("Отмена", "cancel_create");
  await ctx.reply(summary, { reply_markup: keyboard, parse_mode: "HTML", disable_web_page_preview: true });
  const query = await conversation.waitForCallbackQuery(/confirm_create|cancel_create/);
  await query.answerCallbackQuery();
  const data = query.callbackQuery.data;
  return data === "confirm_create";
};

export const createPoolConversation = async (conversation, ctx) => {
  const upsertResult = await upsertUserFromTelegram(ctx.from);
  const owner = upsertResult?.user;
  if (!owner) {
    await ctx.reply("Не могу получить данные пользователя. Попробуй еще раз.");
    return;
  }

  const title = await askForTitle(conversation, ctx);
  const amountType = await askAmountType(conversation, ctx);
  const amountValue = await askAmountValue(conversation, ctx, amountType);
  const paymentDetails = await askPaymentDetails(conversation, ctx);
  const knownParticipants = await getKnownParticipants(owner.id);
  const selectedParticipants = await askParticipants(conversation, ctx, knownParticipants, owner);
  const expectedParticipantsCount =
    amountType === "total" && selectedParticipants.length === 0
      ? await askExpectedCount(conversation, ctx)
      : selectedParticipants.length || 1;

  const shareText =
    amountType === "per_person"
      ? `💳 <b>С каждого:</b> ${formatAmount(amountValue)}`
      : `💰 <b>Общая сумма:</b> ${formatAmount(amountValue)}\n🧮 <b>Взнос с человека:</b> ${formatAmount(
          Math.ceil(amountValue / expectedParticipantsCount)
        )}`;

  const summary = `🧾 <b>Проверим детали сбора</b>\n\n📛 <b>Название:</b> ${escapeHtml(
    title
  )}\n${shareText}\n🏦 <b>Реквизиты:</b> <code>${escapeHtml(paymentDetails)}</code>\n👥 <b>Участников сейчас:</b> ${selectedParticipants.length}`;

  const confirmed = await askConfirmation(conversation, ctx, summary);
  if (!confirmed) {
    await ctx.reply("❌ Ты отменил создание сбора.", { parse_mode: "HTML" });
    await sendMainMenu(ctx);
    return;
  }

  let pool = await createPool({
    ownerId: owner.id,
    title,
    amountType,
    totalAmount: amountType === "total" ? amountValue : undefined,
    perPersonAmount: amountType === "per_person" ? amountValue : undefined,
    paymentDetails,
    participants: selectedParticipants,
    expectedParticipantsCount
  });

  const { text, shareUrl } = await buildOwnerPoolView(pool, ctx);

  if (selectedParticipants.length) {
    const shareAmount =
      pool.amountType === "per_person"
        ? pool.perPersonAmount
        : pool.shareAmount ?? Math.ceil((pool.totalAmount ?? 0) / Math.max(1, pool.expectedParticipantsCount));
    const ownerId = owner.id;

    for (const user of selectedParticipants) {
      const participantId = user?.id;
      const isOwner = ownerId && participantId === ownerId;
      if (!user.telegramId && !isOwner) continue;
      try {
        pool = await ensureParticipant(pool, user, { shareAmount });
        if (isOwner || !user.telegramId) continue;
        const participantView = buildParticipantPoolView(pool);
        await ctx.api.sendMessage(user.telegramId, participantView.text, {
          parse_mode: "HTML",
          reply_markup: participantView.keyboard
        });
      } catch (error) {
        logger.warn(
          { error, participantId: user?.id, isOwner },
          "Failed to notify selected participant"
        );
      }
    }
  }

  const keyboard = new InlineKeyboard()
    .url("🔗 Поделиться сбором", shareUrl)
    .row()
    .text("💸 Отметить взнос", `pmenu:${pool.id}:1`)
    .row()
    .text("⬅️ К списку", "action:pools");

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard, disable_web_page_preview: true });
};
