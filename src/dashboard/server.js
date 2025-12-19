import env from "../config/env.js";
import logger from "../utils/logger.js";
import { createApp } from "../server/app.js";

export const startAdminServer = async () => {
  if (!env.adminEnabled) {
    logger.info("Admin panel is disabled; skipping admin server startup");
    return null;
  }

  const app = createApp();

  app.get("/", (req, res) => res.redirect("/dashboard"));
  app.get("/admin", (req, res) => res.redirect("/dashboard"));

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const port = env.adminPort || env.port || 3000;
  const host = env.host || "0.0.0.0";

  const server = app.listen(port, host, () => {
    logger.info({ port, host }, "Admin panel server is listening");
  });

  return server;
};

export default startAdminServer;
