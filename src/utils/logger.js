import pino from "pino";
import fs from "fs";
import path from "path";
import env from "../config/env.js";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const pinoOptions = {
  name: "skinemsya-bot",
  level: env.logLevel,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || "localhost",
    nodeEnv: env.nodeEnv,
    appVersion: process.env.npm_package_version || "1.0.0",
  },
  
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    
    ctx: (ctx) => {
      if (!ctx) return ctx;
      return {
        updateId: ctx.update?.update_id,
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        messageId: ctx.message?.message_id,
        chatType: ctx.chat?.type,
        text: ctx.message?.text?.substring(0, 100),
        callbackData: ctx.callbackQuery?.data,
      };
    },
  },
  
  transport: env.isDevelopment ? {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname,nodeEnv,appVersion",
      messageFormat: "{msg} {if ctx}{ctx}{end}",
      customColors: "info:blue,warn:yellow,error:red,debug:green",
    },
  } : undefined,
  
  redact: {
    paths: [
      "token",
      "password",
      "*.token",
      "*.password",
      "*.secret",
      "botToken",
      "*.botToken",
    ],
    censor: "***SECRET***",
  },
};

const createTransports = () => {
  const transports = [];

  if (env.isDevelopment) {
    return pinoOptions.transport;
  }
  
  if (env.logFile !== "false") {
    const logFilePath = env.logFile || path.join(logDir, "bot.log");
    const errorLogPath = path.join(logDir, "error.log");
    
    transports.push({
      target: "pino/file",
      options: { destination: logFilePath },
      level: "info",
    });
    
    transports.push({
      target: "pino/file",
      options: { destination: errorLogPath },
      level: "error",
    });
    
    transports.push({
      target: "pino/file",
      options: { destination: 1 },
    });
    
    return { targets: transports };
  }
  
  return undefined;
};

const logger = pino({
  ...pinoOptions,
  transport: createTransports(),
});

export default logger;