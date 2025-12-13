import { MemorySessionStorage, session } from "grammy";
import { RedisAdapter } from "@grammyjs/storage-redis";
import logger from "../utils/logger.js";

export default (redis) => {
  const memoryStorage = new MemorySessionStorage();
  let redisStorage =
    redis &&
    new RedisAdapter({
      instance: redis,
      prefix: "tg:sess:"
    });

  let redisHealthy = Boolean(redisStorage);

  const fallbackToMemory = (error, action) => {
    if (redisHealthy) {
      logger.warn({ err: error }, `Redis session ${action} failed, fallback to memory session`);
    }
    redisHealthy = false;
  };

  const storage = {
    read: async (key) => {
      if (redisHealthy) {
        try {
          return await redisStorage.read(key);
        } catch (error) {
          fallbackToMemory(error, "read");
        }
      }
      return memoryStorage.read(key);
    },
    write: async (key, value) => {
      if (redisHealthy) {
        try {
          return await redisStorage.write(key, value);
        } catch (error) {
          fallbackToMemory(error, "write");
        }
      }
      return memoryStorage.write(key, value);
    },
    delete: async (key) => {
      if (redisHealthy) {
        try {
          return await redisStorage.delete(key);
        } catch (error) {
          fallbackToMemory(error, "delete");
        }
      }
      return memoryStorage.delete(key);
    }
  };

  return session({
    initial: () => ({}),
    storage,
    getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined)
  });
};
