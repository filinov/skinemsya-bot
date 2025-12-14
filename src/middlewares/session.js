import { session } from "grammy";
import prisma from "../config/prisma.js";
import logger from "../utils/logger.js";

class PrismaSessionStorage {
  async read(key) {
    try {
      const record = await prisma.session.findUnique({ where: { key } });
      return record?.data;
    } catch (error) {
      logger.error({ err: error, key }, "Failed to read session from database");
      throw error;
    }
  }

  async write(key, value) {
    try {
      await prisma.session.upsert({
        where: { key },
        update: { data: value, updatedAt: new Date() },
        create: { key, data: value }
      });
    } catch (error) {
      logger.error({ err: error, key }, "Failed to write session to database");
      throw error;
    }
  }

  async delete(key) {
    try {
      await prisma.session.delete({ where: { key } });
    } catch (error) {
      // Ignore "record not found"
      if (error.code === "P2025") return;
      logger.error({ err: error, key }, "Failed to delete session from database");
      throw error;
    }
  }
}

export default () =>
  session({
    initial: () => ({}),
    storage: new PrismaSessionStorage(),
    getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined)
  });
