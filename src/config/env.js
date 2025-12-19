import dotenv from "dotenv";

const nodeEnv = process.env.NODE_ENV || "development";

const isProduction = nodeEnv === "production";
const isDevelopment = nodeEnv === "development";

dotenv.config();

const parseIntSafe = (value, defaultValue = 0) => {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const env = {
  // Окружение
  nodeEnv,
  isProduction,
  isDevelopment,

  // Бот
  botToken: process.env.BOT_TOKEN,

  // База данных
  databaseUrl: "file:./data/bot.db",

  // Логирование
  logLevel: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  logFile: process.env.LOG_FILE,

  // Вебхуки (для продакшена)
  webhookDomain: process.env.DOMAIN,

  // Настройки приложения
  port: parseIntSafe(process.env.PORT, 3000),
  host: process.env.HOST || "0.0.0.0",

  // Админ ID
  botAdminId: process.env.BOT_ADMIN_ID ? parseIntSafe(process.env.BOT_ADMIN_ID) : null,

  // Админ-панель
  adminLogin: process.env.ADMIN_LOGIN,
  adminPassword: process.env.ADMIN_PASSWORD,
  adminEnabled: Boolean(process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD),
};

const errors = [];

if (!env.botToken) {
  errors.push("BOT_TOKEN обязателен для запуска бота");
}

if (!env.databaseUrl) {
  errors.push("DATABASE_URL обязателен для подключения к базе данных");
}

if (isProduction && !env.webhookDomain) {
  errors.push("DOMAIN обязателен при использовании вебхуков в production");
}

if (errors.length > 0) {
  console.error("❌ Ошибки конфигурации:");
  errors.forEach(error => console.error(`   - ${error}`));
  process.exit(1);
}

Object.freeze(env);

export default env;
