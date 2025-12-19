import express from "express";
import logger from "../../utils/logger.js";
import { getRecentPools, getRecentUsers, getTimelineStats, getUsageStats, togglePoolState } from "../statsService.js";
import env from "../../config/env.js";

const parseBasicAuth = (header) => {
    if (!header || !header.startsWith("Basic ")) return null;
    const base64 = header.replace("Basic ", "");
    const decoded = Buffer.from(base64, "base64").toString();
    const [username, password] = decoded.split(":");
    if (!username || password === undefined) return null;
    return { username, password };
};

export const requireAdminAuth = (req, res, next) => {
    if (!env.adminEnabled) {
        return res.status(503).json({ error: "Admin panel is disabled" });
    }
    if (!env.adminLogin || !env.adminPassword) {
        logger.warn("Admin panel requested but credentials are not set");
        return res.status(503).json({ error: "Admin credentials are not configured" });
    }

    const credentials = parseBasicAuth(req.headers.authorization);
    if (!credentials || credentials.username !== env.adminLogin || credentials.password !== env.adminPassword) {
        res.set("WWW-Authenticate", 'Basic realm="bot-admin"');
        return res.status(401).json({ error: "Authentication required" });
    }

    return next();
};

const router = express.Router();
router.use(express.json());
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
