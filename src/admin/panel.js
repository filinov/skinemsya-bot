import express from "express";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import { getRecentPools, getRecentUsers, getUsageStats, togglePoolState } from "./statsService.js";
import { escapeHtml, formatAmount } from "../utils/text.js";

const parseBasicAuth = (header) => {
  if (!header || !header.startsWith("Basic ")) return null;
  const base64 = header.replace("Basic ", "");
  const decoded = Buffer.from(base64, "base64").toString();
  const [username, password] = decoded.split(":");
  if (!username || password === undefined) return null;
  return { username, password };
};

const requireAdminAuth = (req, res, next) => {
  if (!env.adminEnabled) {
    return res.status(503).send("Admin panel is disabled");
  }
  if (!env.adminLogin || !env.adminPassword) {
    logger.warn("Admin panel requested but credentials are not set");
    return res.status(503).send("Admin credentials are not configured");
  }

  const credentials = parseBasicAuth(req.headers.authorization);
  if (!credentials || credentials.username !== env.adminLogin || credentials.password !== env.adminPassword) {
    res.set("WWW-Authenticate", 'Basic realm="bot-admin"');
    return res.status(401).send("Authentication required");
  }

  return next();
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  return date.toLocaleString("ru-RU");
};

const renderCard = (title, value, accent = false, hint = "") => `
  <div class="card ${accent ? "card--accent" : ""}">
    <div class="card__title">${title}</div>
    <div class="card__value">${value}</div>
    ${hint ? `<div class="card__hint">${hint}</div>` : ""}
  </div>
`;

const renderAdminPage = ({ stats, pools, users }) => `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Админка бота</title>
  <style>
    :root {
      --bg: linear-gradient(135deg, #0f172a 0%, #1f2937 100%);
      --panel: rgba(255, 255, 255, 0.04);
      --border: rgba(255, 255, 255, 0.08);
      --text: #e5e7eb;
      --muted: #9ca3af;
      --accent: #60a5fa;
      --danger: #f87171;
      --success: #34d399;
      --shadow: 0 15px 50px rgba(0, 0, 0, 0.25);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Manrope", "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 32px 24px 48px;
    }
    .page {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .badge {
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 14px;
      box-shadow: var(--shadow);
    }
    .card--accent {
      border-color: rgba(96, 165, 250, 0.5);
      background: linear-gradient(145deg, rgba(96,165,250,0.12), rgba(59,130,246,0.05));
    }
    .card__title {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .card__value {
      font-size: 24px;
      font-weight: 700;
    }
    .card__hint {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    .section {
      margin-top: 28px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 16px;
    }
    .section__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .section__title {
      font-size: 18px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 8px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 13px;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .chip {
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .chip--success { background: rgba(52, 211, 153, 0.12); border-color: rgba(52, 211, 153, 0.4); }
    .chip--danger { background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.4); }
    button {
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease;
    }
    button:hover { background: rgba(255, 255, 255, 0.12); transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .muted { color: var(--muted); }
    .pill {
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 12px;
    }
    .grid-two {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 12px;
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div>
        <div class="title">Админка бота</div>
        <div class="muted">Управление и статистика использования</div>
      </div>
      <div class="pill">Обновлено: ${formatDate(stats.lastUpdated)}</div>
    </header>

    <div class="cards">
      ${renderCard("Пользователи", stats.users.total)}
      ${renderCard("Активно за 24ч", stats.users.active24h)}
      ${renderCard("Сборов активно", stats.pools.open)}
      ${renderCard("Сборов закрыто", stats.pools.closed)}
      ${renderCard("Участников всего", stats.participants.total)}
      ${renderCard("Оплат подтверждено", stats.participants.confirmed)}
      ${renderCard("Отмечено к проверке", stats.participants.marked)}
      ${renderCard(
        "Собрано",
        formatAmount(stats.money.paidTotal),
        true,
        \`Цель: \${formatAmount(stats.money.targetTotal)} · Прогресс: \${stats.money.completionPercent}%\`
      )}
    </div>

    <div class="grid-two section">
      <div>
        <div class="section__header">
          <div class="section__title">Последние сборы</div>
          <div class="pill">до ${pools.length} шт.</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${
              pools.length
                ? pools
                    .map(
                      (p) => `
                <tr>
                  <td>${escapeHtml(p.title)}</td>
                  <td>${p.amountType === "per_person" ? formatAmount(p.perPersonAmount, p.currency) : formatAmount(p.totalAmount, p.currency)}</td>
                  <td>
                    <span class="chip ${p.isClosed ? "chip--danger" : "chip--success"}" data-chip="${p.id}">
                      ${p.isClosed ? "Закрыт" : "Открыт"}
                    </span>
                  </td>
                  <td>
                    <button data-pool="${p.id}" onclick="togglePool('${p.id}')" data-state="${p.isClosed ? "closed" : "open"}">
                      ${p.isClosed ? "Открыть" : "Закрыть"}
                    </button>
                  </td>
                </tr>`
                    )
                    .join("")
                : `<tr><td colspan="4" class="muted">Нет созданных сборов</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div>
        <div class="section__header">
          <div class="section__title">Последние пользователи</div>
          <div class="pill">до ${users.length} шт.</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Username</th>
              <th>Активность</th>
            </tr>
          </thead>
          <tbody>
            ${
              users.length
                ? users
                    .map(
                      (u) => `
              <tr>
                <td>${escapeHtml([u.firstName, u.lastName].filter(Boolean).join(" ") || "—")}</td>
                <td class="muted">${u.username ? "@" + escapeHtml(u.username) : "—"}</td>
                <td>${formatDate(u.lastSeenAt)}</td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="3" class="muted">Пока нет пользователей</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    async function togglePool(id) {
      const btn = document.querySelector(\`button[data-pool="\${id}"]\`);
      const chip = document.querySelector(\`[data-chip="\${id}"]\`);
      if (!btn) return;
      btn.disabled = true;
      const currentState = btn.dataset.state;
      try {
        const res = await fetch(\`/admin/api/pools/\${id}/toggle\`, { method: "POST" });
        const data = await res.json();
        if (data?.ok && data.pool) {
          const closed = !!data.pool.isClosed;
          btn.textContent = closed ? "Открыть" : "Закрыть";
          btn.dataset.state = closed ? "closed" : "open";
          if (chip) {
            chip.textContent = closed ? "Закрыт" : "Открыт";
            chip.className = "chip " + (closed ? "chip--danger" : "chip--success");
          }
        } else {
          alert(data?.error || "Не удалось изменить состояние сбора");
        }
      } catch (e) {
        alert("Ошибка запроса к серверу администратора");
      } finally {
        if (btn) {
          btn.disabled = false;
        }
      }
    }
  </script>
</body>
</html>
`;

export const createAdminRouter = () => {
  const router = express.Router();
  router.use(express.json());
  router.use(requireAdminAuth);

  router.get("/", async (req, res) => {
    try {
      const [stats, pools, users] = await Promise.all([getUsageStats(), getRecentPools(), getRecentUsers()]);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderAdminPage({ stats, pools, users }));
    } catch (error) {
      logger.error({ error }, "Failed to render admin panel");
      res.status(500).send("Internal server error");
    }
  });

  router.get("/api/stats", async (req, res) => {
    try {
      const stats = await getUsageStats();
      res.json({ ok: true, stats });
    } catch (error) {
      logger.error({ error }, "Failed to fetch admin stats");
      res.status(500).json({ ok: false, error: "Failed to load stats" });
    }
  });

  router.post("/api/pools/:poolId/toggle", async (req, res) => {
    try {
      const poolId = req.params.poolId;
      const pool = await togglePoolState(poolId);
      if (!pool) {
        return res.status(404).json({ ok: false, error: "Сбор не найден" });
      }
      return res.json({ ok: true, pool: { id: pool.id, isClosed: pool.isClosed, title: pool.title } });
    } catch (error) {
      logger.error({ error }, "Failed to toggle pool state from admin");
      res.status(500).json({ ok: false, error: "Не удалось обновить статус" });
    }
  });

  return router;
};

export const attachAdminPanel = (app) => {
  if (!env.adminEnabled) {
    logger.info("Admin panel is disabled (set ADMIN_LOGIN and ADMIN_PASSWORD to enable)");
    return;
  }
  app.use("/admin", createAdminRouter());
  logger.info("Admin panel mounted at /admin");
};
