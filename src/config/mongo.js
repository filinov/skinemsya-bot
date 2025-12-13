import mongoose from "mongoose";
import logger from "../utils/logger.js";
import env from "./env.js";

mongoose.set("strictQuery", true);

export const connectToMongoDB = async () => {
  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000
    });
    logger.info("✅ Connected to MongoDB");
  } catch (error) {
    logger.error({ err: error }, "❌ Error connecting to MongoDB");
    process.exit(1);
  }
};

export const disconnectFromMongoDB = async () => {
  try {
    await mongoose.disconnect();
    logger.info("✅ Disconnected from MongoDB");
  } catch (error) {
    logger.error({ err: error }, "❌ Error disconnecting from MongoDB");
  }
};

export default mongoose;
