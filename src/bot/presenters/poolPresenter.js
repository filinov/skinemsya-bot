import { InlineKeyboard } from "grammy";
import { getBotUsername } from "../../utils/botInfo.js";
import { getDisplayName } from "../../services/userService.js";
import { escapeHtml, formatAmount, formatPaymentDetails, poolHeadline } from "../../utils/text.js";

const participantStatusIcon = (participant) => {
  if (participant.status === "confirmed") return "✅";
  if (participant.status === "marked_paid") return "⏳";
  return "❌";
};

const buildOrganizerLink = (owner) => {
  const displayName = escapeHtml(getDisplayName(owner));
  if (owner?.username) {
    return `<a href="https://t.me/${owner.username}">${displayName}</a>`;
  }
  const numericId = owner?.telegramId ? String(owner.telegramId).replace(/\\D/g, "") : "";
  if (numericId) {
    return `<a href="tg://user?id=${numericId}">${displayName}</a>`;
  }
  return displayName;
};

const formatParticipantContribution = (participant, pool, index) => {
  const icon = participantStatusIcon(participant);

  return `${index + 1}. ${icon} <b>${escapeHtml(participant.displayName)}</b>`;
};

const participantHeadline = (pool) => {
  const share =
    pool.shareAmount ??
    pool.perPersonAmount ??
    (pool.totalAmount && pool.expectedParticipantsCount
      ? Math.ceil(pool.totalAmount / Math.max(1, pool.expectedParticipantsCount))
      : pool.totalAmount);

  const perPersonText = `💰 Скидываемся по: <b>${formatAmount(share, pool.currency)}</b>`;

  return `🎉 <b>${escapeHtml(pool.title)}</b>\n\n${perPersonText}\n💳 Переводим: ${formatPaymentDetails(
    pool.paymentDetails
  )}`;
};

export const buildOwnerPoolView = async (pool, ctx) => {
  const username = await getBotUsername(ctx);
  const link = `https://t.me/${username}?start=${pool.joinCode}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    `Приглашаю поучаствовать в сборе «${pool.title}»`
  )}`;

  const collectedAmount = pool.participants.reduce((total, participant) => {
    const paid = Number(participant.paidAmount ?? 0);
    return total + (Number.isFinite(paid) ? paid : 0);
  }, 0);

  const sortedParticipants = [...pool.participants].sort((a, b) => {
    const weight = (p) => (p.status === "confirmed" ? 2 : p.status === "marked_paid" ? 1 : 0);
    return weight(a) - weight(b);
  });

  const participantsText = sortedParticipants.length
    ? sortedParticipants.map((participant, idx) => formatParticipantContribution(participant, pool, idx)).join("\n")
    : "Пока нет участников. Отправь ссылку, чтобы они присоединились.";

  const statusText = pool.isClosed ? "⛔️ Сбор закрыт. Новые участники не смогут присоединиться." : "";

  let participantsHeader = "👥 Участники:";
  if (pool.amountType === "total" && pool.expectedParticipantsCount > 0) {
    participantsHeader = `👥 Участники (${pool.participants.length} из ${pool.expectedParticipantsCount}):`;
  }

  return {
    text: `${poolHeadline(pool)}\n\n💰 Собрано: <b>${formatAmount(collectedAmount, pool.currency)}</b>\n\n${participantsHeader}\n${participantsText}\n\n${statusText}`,
    shareUrl
  };
};

export const buildParticipantPoolView = (pool) => {
  const keyboard = new InlineKeyboard()
    .text("💳 Перевел(а)", `pay:${pool.id}:transfer`)
    .row()
    .text("💵 Отдал(а) лично", `pay:${pool.id}:cash`);

  const organizer = buildOrganizerLink(pool.owner);

  return {
    text: `${participantHeadline(pool)}\n\n👑 Организатор: ${organizer}\n\n⚠️ <b>Важно:</b> Как только переведешь (или отдашь наличкой), отметься внизу, чтобы я передал информацию организатору. 👇`,
    keyboard
  };
};
