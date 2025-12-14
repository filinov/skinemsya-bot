const base64UrlEncode = (buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
};

const insertUuidHyphens = (hex) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export const encodeInlineId = (id) => {
  if (!id) return "";
  const compact = String(id).replace(/-/g, "");
  if (compact.length !== 32) return String(id);
  try {
    const buf = Buffer.from(compact, "hex");
    return base64UrlEncode(buf);
  } catch {
    return String(id);
  }
};

export const decodeInlineId = (value) => {
  if (!value) return "";
  const raw = String(value);
  if (raw.includes("-") && raw.length === 36) return raw;
  if (raw.length < 20 || raw.length > 30) return raw;
  try {
    const buf = base64UrlDecode(raw);
    const hex = buf.toString("hex");
    if (hex.length !== 32) return raw;
    return insertUuidHyphens(hex);
  } catch {
    return raw;
  }
};
