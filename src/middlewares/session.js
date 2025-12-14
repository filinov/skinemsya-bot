import { session } from "grammy";
import { eq } from "drizzle-orm";
import getDb, { sessions } from "../config/db.js";
import logger from "../utils/logger.js";

class DrizzleSessionStorage {
  async read(key) {
    try {
      const db = getDb();
      const record = db.select().from(sessions).where(eq(sessions.key, key)).get();
      return record?.data ? JSON.parse(record.data) : undefined;
    } catch (error) {
      logger.error({ err: error, key }, "Failed to read session from database");
      throw error;
    }
  }

  async write(key, value) {
    try {
      const db = getDb();
      const payload = JSON.stringify(value ?? {});
      const existing = db.select().from(sessions).where(eq(sessions.key, key)).get();
      if (existing) {
        db.update(sessions)
          .set({ data: payload, updatedAt: new Date() })
          .where(eq(sessions.key, key))
          .run();
      } else {
        db.insert(sessions).values({ key, data: payload }).run();
      }
    } catch (error) {
      logger.error({ err: error, key }, "Failed to write session to database");
      throw error;
    }
  }

  async delete(key) {
    try {
      const db = getDb();
      db.delete(sessions).where(eq(sessions.key, key)).run();
    } catch (error) {
      logger.error({ err: error, key }, "Failed to delete session from database");
      throw error;
    }
  }
}

export default () =>
  session({
    initial: () => ({}),
    storage: new DrizzleSessionStorage(),
    getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined)
  });
