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

const PHONE_REGEX = /(?:\+7|8)\s*\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;

export const formatPaymentDetails = (details) => {
  if (!details) return "—";
  const source = String(details);
  let lastIndex = 0;
  let hasPhone = false;
  const parts = [];

  for (const match of source.matchAll(PHONE_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push(escapeHtml(source.slice(lastIndex, start)));
    }
    const phone = match[0];
    parts.push(`<code>${escapeHtml(phone)}</code>`);
    lastIndex = start + phone.length;
    hasPhone = true;
  }

  if (lastIndex < source.length) {
    parts.push(escapeHtml(source.slice(lastIndex)));
  }

  if (!hasPhone) {
    return `<code>${escapeHtml(source)}</code>`;
  }

  return parts.join("");
};

export const poolHeadline = (pool) => {
  if (!pool) return "Сбор не найден";
  const amountText =
    pool.amountType === "per_person"
      ? `💰 Скидываемся по: <b>${formatAmount(pool.perPersonAmount, pool.currency)}</b>`
      : `🎯 Общая сумма: <b>${formatAmount(pool.totalAmount, pool.currency)}</b>\n💰 Взнос с человека: <b>${formatAmount(
          pool.shareAmount,
          pool.currency
        )}</b>`;
  return `🎉 <b>${escapeHtml(pool.title)}</b>\n\n${amountText}\n💳 Переводим: ${formatPaymentDetails(
    pool.paymentDetails
  )}`;
};
