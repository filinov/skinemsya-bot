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

  // 1. Mount API Router (Auth included inside)
  app.use("/admin/api", apiRouter);

  // 2. Serve Static Frontend (Protected)
  // We use a separate router for static assets to ensure auth checks run before serving files
  const staticRouter = express.Router();
  staticRouter.use(requireAdminAuth);
  staticRouter.use(express.static(path.join(__dirname, "public")));

  app.use("/admin", staticRouter);

  logger.info("Admin panel mounted at /admin");
};
