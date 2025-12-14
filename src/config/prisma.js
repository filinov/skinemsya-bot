import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import env from "./env.js";
import logger from "../utils/logger.js";

const ensureSqliteDir = () => {
  if (!env.databaseUrl?.startsWith("file:")) return;
  try {
    const filePath = env.databaseUrl.replace("file:", "");
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    logger.warn({ error }, "Failed to prepare SQLite directory");
  }
};

ensureSqliteDir();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.databaseUrl
    }
  },
  log: env.isDevelopment ? ["query", "info", "warn", "error"] : ["error"]
});

export const connectToDatabase = async () => {
  try {
    logger.info({ url: env.databaseUrl }, "Connecting to SQLite via Prisma");
    await prisma.$connect();
    logger.info("✅ Prisma connected");
  } catch (error) {
    logger.error({ err: error }, "❌ Error connecting to database");
    process.exit(1);
  }
};

export const disconnectFromDatabase = async () => {
  try {
    await prisma.$disconnect();
    logger.info("✅ Prisma disconnected");
  } catch (error) {
    logger.error({ err: error }, "❌ Error disconnecting from database");
  }
};

export default prisma;
