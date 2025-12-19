import express from "express";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import apiRouter, { requireAdminAuth } from "./api/router.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const attachAdminPanel = (app) => {
  if (!env.adminEnabled) {
    logger.info("Admin panel is disabled (set ADMIN_LOGIN and ADMIN_PASSWORD to enable)");
    return;
  }

  app.use("/dashboard/api", apiRouter);

  const staticRouter = express.Router();
  staticRouter.use(requireAdminAuth);
  staticRouter.use(express.static(path.join(__dirname, "public")));

  app.use("/dashboard", staticRouter);

  logger.info("Dashboard mounted at /dashboard");
};
