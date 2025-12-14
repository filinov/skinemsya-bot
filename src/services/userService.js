import prisma from "../config/prisma.js";

const buildDisplayName = (from) => {
  const nameParts = [from.first_name, from.last_name].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }
  if (from.username) {
    return `@${from.username}`;
  }
  return `Без имени (${from.id})`;
};

const toTelegramId = (value) => (value == null ? null : String(value));

export const upsertUserFromTelegram = async (from) => {
  if (!from) return null;

  const update = {
    telegramId: toTelegramId(from.id),
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    languageCode: from.language_code,
    lastSeenAt: new Date()
  };

  const user = await prisma.user.upsert({
    where: { telegramId: update.telegramId },
    update,
    create: update
  });

  return { user, displayName: buildDisplayName(from) };
};

export const getDisplayName = (user) => {
  if (!user) return "Неизвестный";
  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  if (user.username) {
    return `@${user.username}`;
  }
  return `Участник ${user.telegramId}`;
};

export const findUserByTelegramId = (telegramId) =>
  prisma.user.findUnique({ where: { telegramId: toTelegramId(telegramId) } });

export const touchUsers = async (fromArray = []) => {
  const promises = fromArray.map((from) => upsertUserFromTelegram(from));
  return Promise.all(promises);
};
