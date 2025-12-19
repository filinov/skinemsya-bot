import express from "express";
import helmet from "helmet";
import { attachAdminPanel } from "../dashboard/panel.js";
import env from "../config/env.js";
import logger from "../utils/logger.js";

/**
 * Creates and configures an Express application.
 * @returns {express.Application} The configured Express app.
 */
export const createApp = () => {
    const app = express();

    // Request logging middleware
    app.use((req, res, next) => {
        logger.info({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body // Body might be empty here if processed later, but express.json() is below
        }, "Incoming request");
        next();
    });

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
                    styleSrc: ["'self'", "https://fonts.googleapis.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:"],
                    connectSrc: ["'self'"],
                },
            },
        })
    );
    app.use(express.json());

    app.get("/health", (req, res) => {
        res.json({
            status: "OK",
            environment: env.nodeEnv,
            timestamp: new Date().toISOString(),
        });
    });

    // Attach admin panel routes
    attachAdminPanel(app);

    return app;
};
