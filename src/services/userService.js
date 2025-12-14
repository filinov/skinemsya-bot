import crypto from "crypto";
import { eq } from "drizzle-orm";
import getDb, { users } from "../config/db.js";

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
const newId = () => crypto.randomUUID();

export const upsertUserFromTelegram = async (from) => {
  if (!from) return null;
  const db = getDb();

  const update = {
    telegramId: toTelegramId(from.id),
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    languageCode: from.language_code,
    lastSeenAt: new Date()
  };

  const existing = db.select().from(users).where(eq(users.telegramId, update.telegramId)).get();
  if (existing) {
    await db.update(users).set({ ...update, updatedAt: new Date() }).where(eq(users.id, existing.id)).run();
    const user = db.select().from(users).where(eq(users.id, existing.id)).get();
    return { user, displayName: buildDisplayName(from) };
  }

  const id = newId();
  await db.insert(users).values({ id, ...update }).run();
  const user = db.select().from(users).where(eq(users.id, id)).get();

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

export const findUserByTelegramId = async (telegramId) => {
  const db = getDb();
  return db.select().from(users).where(eq(users.telegramId, toTelegramId(telegramId))).get();
};

export const touchUsers = async (fromArray = []) => {
  const promises = fromArray.map((from) => upsertUserFromTelegram(from));
  return Promise.all(promises);
};
