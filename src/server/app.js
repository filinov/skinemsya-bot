import express from "express";
import helmet from "helmet";
import { attachAdminPanel } from "../dashboard/panel.js";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import cookieParser from "cookie-parser";

/**
 * Creates and configures an Express application.
 * @returns {express.Application} The configured Express app.
 */
export const createApp = () => {
    const app = express();

    app.use(cookieParser());

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
                    scriptSrcAttr: ["'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://unpkg.com"],
                    imgSrc: ["'self'", "data:"],
                    connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
                },
            },
        })
    );
    app.use(express.json());

    // Request logging middleware (after json parsing)
    app.use((req, res, next) => {
        logger.info({
            method: req.method,
            url: req.url,
            // headers: req.headers, // headers can be verbose
            body: req.body
        }, "Incoming request");
        next();
    });

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
