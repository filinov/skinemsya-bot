import mongoose from "mongoose";
import logger from "../utils/logger.js";
import env from "./env.js";

mongoose.set("strictQuery", true);

export const connectToMongoDB = async () => {

  const { MongoClient } = require('mongodb');

  MongoClient.connect('mongodb://gen_user:~%3B*%40_4tDtAjFxR@192.168.0.5:27017/default_db?authSource=admin&directConnection=true', function (err, db) {})

  try {
    console.log("🔌 Connecting to MongoDB...", env.mongodbUri);
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
