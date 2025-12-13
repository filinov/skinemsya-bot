import pino from "pino";
import env from "../config/env.js";

const logger = pino({
  name: "skinemsya-bot",
  level: env.logLevel
});

export default logger;