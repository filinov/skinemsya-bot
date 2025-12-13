import Redis from "ioredis";
import env from "./env.js";
import logger from "../utils/logger.js";

const redis = new Redis(env.redisUrl);

redis.on("connect", () => {
  logger.info("✅ Connected to Redis");
});

redis.on("error", (error) => {
  logger.error({ err: error }, "❌ Redis error");
});

export default redis;
