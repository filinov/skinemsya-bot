import express from "express";
import logger from "../../utils/logger.js";
import { getRecentPools, getRecentUsers, getTimelineStats, getUsageStats, togglePoolState } from "../statsService.js";
import env from "../../config/env.js";
import crypto from "crypto";

// Simple in-memory session token (in production use Redis or signed cookies)
// Since we have single admin, a simple token match is enough.
const SESSION_COOKIE_NAME = "admin_session";
// Generate a random session secret on startup
const SESSION_SECRET = crypto.randomBytes(32).toString("hex");

export const requireAdminAuth = (req, res, next) => {
    if (!env.adminEnabled) {
        return res.status(503).json({ error: "Admin panel is disabled" });
    }

    const sessionToken = req.cookies[SESSION_COOKIE_NAME];

    if (sessionToken === SESSION_SECRET) {
        return next();
    }

    // If it's an API request, return 401
    if (req.originalUrl.startsWith("/dashboard/api")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // Otherwise redirect to login page
    return res.redirect("/dashboard/login");
};

const router = express.Router();
router.use(express.json());

// Auth routes
router.post("/auth/login", (req, res) => {
    const { login, password } = req.body;

    if (login === env.adminLogin && password === env.adminPassword) {
        res.cookie(SESSION_COOKIE_NAME, SESSION_SECRET, {
            httpOnly: true,
            secure: env.isProduction, // Secure in production
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
        return res.json({ ok: true });
    }

    logger.warn({ ip: req.ip }, "Failed login attempt");
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
});

router.post("/auth/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ ok: true });
});

// Protected routes middleware
router.use(requireAdminAuth);

// Get global stats
router.get("/stats", async (req, res) => {
    try {
        const stats = await getUsageStats();
        res.json({ ok: true, stats });
    } catch (error) {
        logger.error({ error }, "Failed to fetch admin stats");
        res.status(500).json({ ok: false, error: "Failed to load stats" });
    }
});

// Get timeline data for charts
router.get("/timeline", async (req, res) => {
    try {
        const days = Number(req.query.days) || 14;
        const timeline = getTimelineStats(days);
        res.json({ ok: true, timeline });
    } catch (error) {
        logger.error({ error }, "Failed to fetch timeline stats");
        res.status(500).json({ ok: false, error: "Failed to load timeline" });
    }
});

// Get recent pools
router.get("/pools", async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 20;
        const pools = getRecentPools(limit);
        res.json({ ok: true, pools });
    } catch (error) {
        logger.error({ error }, "Failed to fetch pools");
        res.status(500).json({ ok: false, error: "Failed to load pools" });
    }
});

// Get recent users
router.get("/users", async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 20;
        const users = getRecentUsers(limit);
        res.json({ ok: true, users });
    } catch (error) {
        logger.error({ error }, "Failed to fetch users");
        res.status(500).json({ ok: false, error: "Failed to load users" });
    }
});

// Toggle pool status
router.post("/pools/:poolId/toggle", async (req, res) => {
    try {
        const poolId = req.params.poolId;
        const pool = await togglePoolState(poolId);
        if (!pool) {
            return res.status(404).json({ ok: false, error: "Pool not found" });
        }
        return res.json({ ok: true, pool: { id: pool.id, isClosed: pool.isClosed, title: pool.title } });
    } catch (error) {
        logger.error({ error }, "Failed to toggle pool state from admin");
        res.status(500).json({ ok: false, error: "Failed to update status" });
    }
});

export default router;
