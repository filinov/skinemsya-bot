import env from "../config/env.js";
import logger from "../utils/logger.js";
import { attachAdminPanel } from "./panel.js";

export const startAdminServer = async () => {
  if (!env.adminEnabled) {
    logger.info("Admin panel is disabled; skipping admin server startup");
    return null;
  }

  const { default: express } = await import("express");
  const { default: helmet } = await import("helmet");

  const app = express();
  app.use(helmet());
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({
      status: "OK",
      admin: true,
      environment: env.nodeEnv,
      timestamp: new Date().toISOString()
    });
  });

  attachAdminPanel(app);

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
