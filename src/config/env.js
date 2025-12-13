import dotenv from 'dotenv';

dotenv.config();

const env = {
  botToken: process.env.BOT_TOKEN,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/skinemsya-bot',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  logLevel: process.env.LOG_LEVEL || 'info'
};

if (!env.botToken) {
  throw new Error('BOT_TOKEN обязателен для запуска бота');
}

export default env;