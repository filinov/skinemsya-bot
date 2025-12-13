import { InlineKeyboard } from "grammy";
import { getBotUsername } from "../utils/botInfo.js";
import { escapeHtml, formatAmount, poolHeadline, statusEmoji } from "../utils/text.js";

const participantStatusIcon = (participant) => statusEmoji[participant.status] || statusEmoji.default;

const formatParticipantContribution = (participant, pool, index) => {
  const expectedAmount =
    participant.expectedAmount ?? pool.shareAmount ?? pool.perPersonAmount ?? pool.totalAmount ?? 0;
  const paidAmount =
    participant.paidAmount ??
    (participant.status === "marked_paid" || participant.status === "confirmed" ? expectedAmount : 0);

  const paidText = formatAmount(paidAmount, pool.currency);
  const expectedText = formatAmount(expectedAmount, pool.currency);
  const icon = participantStatusIcon(participant);

  return `${icon} ${index + 1}. <b>${escapeHtml(participant.displayName)}</b> — (${paidText} из ${expectedText})`;
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

  const participantsText = pool.participants.length
    ? pool.participants.map((participant, idx) => formatParticipantContribution(participant, pool, idx)).join("\n")
    : "Пока нет участников. Отправь ссылку, чтобы они присоединились.";

  const statusText = pool.isClosed
    ? "⛔️ Сбор закрыт. Новые участники не смогут присоединиться."
    : `🔗 Ссылка для участников:\n${escapeHtml(link)}`;

  return {
    text: `${poolHeadline(pool)}\n\n💰 Собрано: <b>${formatAmount(collectedAmount, pool.currency)}</b>\n\n👥 Участники и взносы:\n${participantsText}\n\n${statusText}`,
    shareUrl
  };
};

export const buildParticipantPoolView = (pool) => {
  const keyboard = new InlineKeyboard()
    .text("Перевел по реквизитам", `pay:${pool.id}:transfer`)
    .row()
    .text("Отдал наличкой", `pay:${pool.id}:cash`);

  return {
    text: `${poolHeadline(pool)}\n\nПодтвердите свой взнос нажав на кнопку ниже, я сообщу об этом организатору.`,
    keyboard
  };
};
