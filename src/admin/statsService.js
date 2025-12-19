import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import getDb, { pools, poolParticipants, users } from "../config/db.js";
import { getPoolById, setPoolClosed } from "../services/poolService.js";

const toNumber = (value) => {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
};

const countRows = (query) => toNumber(query?.count ?? query?.value ?? 0);
const sumRows = (query) => toNumber(query?.sum ?? query?.value ?? 0);

export const getUsageStats = () => {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const usersTotal = countRows(db.select({ count: sql`count(*)`.as("count") }).from(users).get());
  const usersActive24h = countRows(
    db.select({ count: sql`count(*)`.as("count") }).from(users).where(gte(users.lastSeenAt, since24h)).get()
  );

  const poolsTotal = countRows(db.select({ count: sql`count(*)`.as("count") }).from(pools).get());
  const poolsOpen = countRows(db.select({ count: sql`count(*)`.as("count") }).from(pools).where(eq(pools.isClosed, 0)).get());
  const poolsClosed = countRows(
    db.select({ count: sql`count(*)`.as("count") }).from(pools).where(eq(pools.isClosed, 1)).get()
  );

  const participantsTotal = countRows(db.select({ count: sql`count(*)`.as("count") }).from(poolParticipants).get());
  const participantsConfirmed = countRows(
    db.select({ count: sql`count(*)`.as("count") }).from(poolParticipants).where(eq(poolParticipants.status, "confirmed")).get()
  );
  const participantsMarked = countRows(
    db.select({ count: sql`count(*)`.as("count") }).from(poolParticipants).where(eq(poolParticipants.status, "marked_paid")).get()
  );

  const paidTotal = sumRows(
    db
      .select({ sum: sql`COALESCE(sum(${poolParticipants.paidAmount}), 0)`.as("sum") })
      .from(poolParticipants)
      .get()
  );

  const expectedTotal = sumRows(
    db
      .select({ sum: sql`COALESCE(sum(${poolParticipants.expectedAmount}), 0)`.as("sum") })
      .from(poolParticipants)
      .get()
  );

  const targetTotal = sumRows(
    db
      .select({
        sum: sql`
          COALESCE(sum(
            CASE 
              WHEN ${pools.amountType} = 'per_person' THEN ${pools.perPersonAmount} * ${pools.expectedParticipantsCount}
              ELSE ${pools.totalAmount}
            END
          ), 0)
        `.as("sum")
      })
      .from(pools)
      .get()
  );

  const completionPercent = targetTotal > 0 ? Math.min(100, Math.round((paidTotal / targetTotal) * 100)) : 0;

  return {
    users: {
      total: usersTotal,
      active24h: usersActive24h
    },
    pools: {
      total: poolsTotal,
      open: poolsOpen,
      closed: poolsClosed
    },
    participants: {
      total: participantsTotal,
      confirmed: participantsConfirmed,
      marked: participantsMarked
    },
    money: {
      paidTotal,
      expectedTotal,
      targetTotal,
      completionPercent
    },
    lastUpdated: new Date().toISOString()
  };
};

export const getRecentPools = (limit = 8) => {
  const db = getDb();
  return db
    .select({
      id: pools.id,
      title: pools.title,
      ownerId: pools.ownerId,
      isClosed: pools.isClosed,
      amountType: pools.amountType,
      totalAmount: pools.totalAmount,
      perPersonAmount: pools.perPersonAmount,
      expectedParticipantsCount: pools.expectedParticipantsCount,
      currency: pools.currency,
      createdAt: pools.createdAt
    })
    .from(pools)
    .orderBy(desc(pools.createdAt))
    .limit(limit)
    .all()
    .map((pool) => ({
      ...pool,
      isClosed: !!pool.isClosed
    }));
};

export const getRecentUsers = (limit = 8) => {
  const db = getDb();
  return db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt
    })
    .from(users)
    .orderBy(desc(users.lastSeenAt))
    .limit(limit)
    .all();
};

export const togglePoolState = async (poolId) => {
  const pool = await getPoolById(poolId);
  if (!pool) return null;
  return setPoolClosed({ poolId, ownerId: pool.ownerId, isClosed: !pool.isClosed });
};

const buildTimelineBuckets = (days) => {
  const buckets = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    buckets.push({ key, label: date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }), value: 0 });
  }
  return buckets;
};

const fillCounts = (buckets, timestamps) => {
  const map = new Map(buckets.map((b) => [b.key, b]));
  timestamps.forEach((ts) => {
    if (!ts) return;
    const date = new Date(ts);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    const bucket = map.get(key);
    if (bucket) bucket.value += 1;
  });
  return buckets;
};

const fillSums = (buckets, entries) => {
  const map = new Map(buckets.map((b) => [b.key, b]));
  entries.forEach(({ ts, amount }) => {
    if (!ts || amount == null) return;
    const date = new Date(ts);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    const bucket = map.get(key);
    if (bucket) bucket.value += Number(amount) || 0;
  });
  return buckets;
};

export const getTimelineStats = (days = 14) => {
  const db = getDb();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  const poolsRows = db
    .select({ createdAt: pools.createdAt })
    .from(pools)
    .where(gte(pools.createdAt, from))
    .all();

  const userRows = db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(gte(users.createdAt, from))
    .all();

  const paidRows = db
    .select({
      paidAmount: poolParticipants.paidAmount,
      status: poolParticipants.status,
      confirmedAt: poolParticipants.confirmedAt,
      markedAt: poolParticipants.markedAt,
      createdAt: poolParticipants.createdAt
    })
    .from(poolParticipants)
    .where(inArray(poolParticipants.status, ["confirmed", "marked_paid"]))
    .all();

  const poolBuckets = fillCounts(buildTimelineBuckets(days), poolsRows.map((r) => r.createdAt));
  const userBuckets = fillCounts(buildTimelineBuckets(days), userRows.map((r) => r.createdAt));
  const paidBuckets = fillSums(
    buildTimelineBuckets(days),
    paidRows.map((row) => ({ ts: row.confirmedAt || row.markedAt || row.createdAt, amount: row.paidAmount }))
  );

  return {
    labels: poolBuckets.map((b) => b.label),
    pools: poolBuckets.map((b) => b.value),
    users: userBuckets.map((b) => b.value),
    paid: paidBuckets.map((b) => Number(b.value.toFixed(2)))
  };
};
