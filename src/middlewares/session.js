import { session } from "grammy";
import SessionModel from "../models/Session.js";
import logger from "../utils/logger.js";

class MongoSessionStorage {
  async read(key) {
    try {
      const record = await SessionModel.findOne({ key }).lean();
      return record?.data;
    } catch (error) {
      logger.error({ err: error, key }, "Failed to read session from MongoDB");
      throw error;
    }
  }

  async write(key, value) {
    try {
      await SessionModel.findOneAndUpdate(
        { key },
        { data: value },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      logger.error({ err: error, key }, "Failed to write session to MongoDB");
      throw error;
    }
  }

  async delete(key) {
    try {
      await SessionModel.deleteOne({ key });
    } catch (error) {
      logger.error({ err: error, key }, "Failed to delete session from MongoDB");
      throw error;
    }
  }
}

export default () =>
  session({
    initial: () => ({}),
    storage: new MongoSessionStorage(),
    getSessionKey: (ctx) => (ctx.from ? String(ctx.from.id) : undefined)
  });
