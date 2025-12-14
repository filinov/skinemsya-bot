export const statusEmoji = {
  invited: "📨",
  joined: "👋",
  marked_paid: "💸",
  confirmed: "✅",
  default: "•"
};

export const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const formatAmount = (amount, currency = "₽") => {
  if (Number.isNaN(amount) || amount === undefined || amount === null) return "—";
  const value = Number(amount);
  return `${value.toLocaleString("ru-RU")} ${currency}`;
};

export const participantStatusLine = (participant) => {
  const emoji = statusEmoji[participant.status] || statusEmoji.default;
  const amountText = participant.expectedAmount ? ` · ${formatAmount(participant.expectedAmount)}` : "";
  return `${emoji} <b>${escapeHtml(participant.displayName)}</b>${amountText}`;
};

export const poolHeadline = (pool) => {
  if (!pool) return "Сбор не найден";
  const amountText =
    pool.amountType === "per_person"
      ? `💰Скидываемся по: <b>${formatAmount(pool.perPersonAmount, pool.currency)}</b>`
      : `Общая сумма: <b>${formatAmount(pool.totalAmount, pool.currency)}</b>\nВзнос с человека: <b>${formatAmount(
          pool.shareAmount,
          pool.currency
        )}</b>`;
  return `🎉 <b>${escapeHtml(pool.title)}</b>\n\n${amountText}\nРеквизиты для перевода: <code>${escapeHtml(pool.paymentDetails)}</code>`;
};
