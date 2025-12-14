import { InlineKeyboard } from "grammy";
import { getBotUsername } from "../utils/botInfo.js";
import { getDisplayName } from "../services/userService.js";
import { escapeHtml, formatAmount, poolHeadline, statusEmoji } from "../utils/text.js";

const participantStatusIcon = (participant) => statusEmoji[participant.status] || statusEmoji.default;

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
    .text("💳 Перевел(а)", `pay:${pool.id}:transfer`)
    .row()
    .text("💵 Отдал(а) лично", `pay:${pool.id}:cash`);

  const organizer = buildOrganizerLink(pool.owner);

  return {
    text: `${poolHeadline(pool)}\n\n👑 Организатор: ${organizer}\n\n⚠️ <b>Важно:</b> Как только переведешь (или отдашь наличкой), отметься внизу, чтобы я передал информацию организатору. 👇`,
    keyboard
  };
};
