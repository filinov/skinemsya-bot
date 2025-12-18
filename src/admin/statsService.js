import { desc, eq, gte, sql } from "drizzle-orm";
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
