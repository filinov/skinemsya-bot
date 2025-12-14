import crypto from "crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import getDb, { poolParticipants, pools, users } from "../config/db.js";
import { getDisplayName } from "./userService.js";

const newId = () => crypto.randomUUID();

export const generateJoinCode = () => crypto.randomBytes(6).toString("hex");

export const calculateShareAmount = ({ amountType, totalAmount = 0, perPersonAmount = 0, participantCount = 1 }) => {
  if (amountType === "per_person") return perPersonAmount;
  if (participantCount <= 0) return totalAmount;
  return Math.ceil(totalAmount / participantCount);
};

const normalizePool = (poolRow, owner, participants) => ({
  ...poolRow,
  isClosed: !!poolRow.isClosed,
  owner,
  participants: participants.map((p) => ({
    ...p.participant,
    user: p.user || null
  }))
});

const loadPool = (whereClause) => {
  const db = getDb();
  const poolRow = db.select().from(pools).where(whereClause).get();
  if (!poolRow) return null;
  const owner = db.select().from(users).where(eq(users.id, poolRow.ownerId)).get();
  const participantRows = db
    .select({
      participant: poolParticipants,
      user: users
    })
    .from(poolParticipants)
    .leftJoin(users, eq(poolParticipants.userId, users.id))
    .where(eq(poolParticipants.poolId, poolRow.id))
    .all();
  return normalizePool(poolRow, owner, participantRows);
};

const loadPoolById = (poolId) => loadPool(eq(pools.id, poolId));

export const createPool = async ({
  ownerId,
  title,
  amountType,
  totalAmount,
  perPersonAmount,
  paymentDetails,
  participants = [],
  expectedParticipantsCount = 1
}) => {
  const db = getDb();
  const participantCount = participants.length > 0 ? participants.length : expectedParticipantsCount;
  const shareAmount = calculateShareAmount({
    amountType,
    totalAmount,
    perPersonAmount,
    participantCount
  });

  const joinCode = generateJoinCode();
  const poolId = newId();

  db.transaction((tx) => {
    tx.insert(pools).values({
      id: poolId,
      ownerId,
      title,
      amountType,
      totalAmount: amountType === "total" ? totalAmount ?? 0 : null,
      perPersonAmount: amountType === "per_person" ? perPersonAmount ?? 0 : null,
      shareAmount,
      expectedParticipantsCount: participantCount,
      paymentDetails,
      joinCode
    }).run();

    if (participants.length) {
      const values = participants.map((user) => ({
        id: newId(),
        poolId,
        userId: user.id,
        displayName: getDisplayName(user),
        status: "invited",
        expectedAmount: shareAmount
      }));
      tx.insert(poolParticipants).values(values).run();
    }
  });

  return loadPoolById(poolId);
};

export const getPoolByJoinCode = (joinCode) => loadPool(and(eq(pools.joinCode, joinCode), eq(pools.isClosed, false)));

export const getPoolsByOwner = async (ownerId, { limit = 10, page = 1 } = {}) => {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safePage = Math.max(1, page);
  const items = db
    .select()
    .from(pools)
    .where(eq(pools.ownerId, ownerId))
    .orderBy(desc(pools.createdAt))
    .offset((safePage - 1) * safeLimit)
    .limit(safeLimit)
    .all();
  const totalRow = db.select({ count: sql`count(*)`.as("count") }).from(pools).where(eq(pools.ownerId, ownerId)).get();
  const total = Number(totalRow?.count ?? 0);
  return { items, total, page: safePage, limit: safeLimit };
};

export const getPoolByIdForOwner = (poolId, ownerId) => loadPool(and(eq(pools.id, poolId), eq(pools.ownerId, ownerId)));

export const getPoolById = (poolId) => loadPool(eq(pools.id, poolId));

export const ensureParticipant = async (pool, user, opts = {}) => {
  const db = getDb();
  const existing = db
    .select()
    .from(poolParticipants)
    .where(and(eq(poolParticipants.poolId, pool.id), eq(poolParticipants.userId, user.id)))
    .get();

  if (existing) {
    db.update(poolParticipants)
      .set({
        joinedAt: existing.joinedAt ?? new Date(),
        status: existing.status === "confirmed" ? "confirmed" : "joined",
        updatedAt: new Date()
      })
      .where(eq(poolParticipants.id, existing.id))
      .run();
    return loadPoolById(pool.id);
  }

  db.insert(poolParticipants)
    .values({
      id: newId(),
      poolId: pool.id,
      userId: user.id,
      displayName: getDisplayName(user),
      status: "joined",
      joinedAt: new Date(),
      expectedAmount: opts.shareAmount ?? pool.shareAmount ?? 0,
      payMethod: "unknown"
    })
    .run();

  return loadPoolById(pool.id);
};

export const markParticipantPaid = async ({ poolId, userId, payMethod = "transfer", note }) => {
  const db = getDb();
  const pool = await getPoolById(poolId);
  if (!pool) return null;

  const participant = pool.participants.find((p) => p.userId === userId);
  if (!participant) return null;
  if (participant.status === "confirmed") return pool;

  const paidAmount = participant.expectedAmount ?? pool.shareAmount ?? 0;

  db.update(poolParticipants)
    .set({
      status: "marked_paid",
      paidAmount,
      payMethod,
      note,
      markedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(poolParticipants.id, participant.id))
    .run();

  return loadPoolById(pool.id);
};

const updateParticipantPayment = async ({ poolId, ownerId, participantId, amount, mode }) => {
  const pool = await getPoolByIdForOwner(poolId, ownerId);
  if (!pool) return null;
  const participant = pool.participants.find((p) => p.id === participantId);
  if (!participant) return null;

  const paid = amount ?? participant.paidAmount ?? participant.expectedAmount ?? pool.shareAmount ?? 0;
  const db = getDb();

  db.update(poolParticipants)
    .set({
      status: "confirmed",
      paidAmount: paid,
      joinedAt: participant.joinedAt ?? new Date(),
      markedAt: participant.markedAt ?? new Date(),
      confirmedAt: new Date(),
      payMethod: participant.payMethod || "unknown",
      updatedAt: new Date()
    })
    .where(eq(poolParticipants.id, participant.id))
    .run();

  return loadPoolById(pool.id);
};

export const confirmParticipantPayment = async ({ poolId, participantId, ownerId, amount }) =>
  updateParticipantPayment({ poolId, participantId, ownerId, amount, mode: "confirm" });

export const manualConfirmParticipantPayment = async ({ poolId, participantId, ownerId, amount }) =>
  updateParticipantPayment({ poolId, participantId, ownerId, amount, mode: "manual" });

export const markOwnerSelfPayment = async ({ poolId, owner, amount }) => {
  const db = getDb();
  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) return null;

  const expectedAmount = pool.shareAmount ?? pool.perPersonAmount ?? pool.totalAmount ?? 0;
  const ownerParticipant = pool.participants.find((p) => p.userId === owner.id);

  if (ownerParticipant) {
    db.update(poolParticipants)
      .set({
        status: "confirmed",
        expectedAmount: ownerParticipant.expectedAmount ?? expectedAmount,
        paidAmount: amount ?? ownerParticipant.paidAmount ?? ownerParticipant.expectedAmount ?? expectedAmount,
        joinedAt: ownerParticipant.joinedAt ?? new Date(),
        markedAt: ownerParticipant.markedAt ?? new Date(),
        confirmedAt: new Date(),
        payMethod: ownerParticipant.payMethod || "unknown",
        updatedAt: new Date()
      })
      .where(eq(poolParticipants.id, ownerParticipant.id))
      .run();
  } else {
    db.insert(poolParticipants)
      .values({
        id: newId(),
        poolId: pool.id,
        userId: owner.id,
        displayName: getDisplayName(owner),
        status: "confirmed",
        expectedAmount,
        paidAmount: amount ?? expectedAmount,
        payMethod: "unknown",
        joinedAt: new Date(),
        markedAt: new Date(),
        confirmedAt: new Date()
      })
      .run();
  }

  return loadPoolById(pool.id);
};

export const getKnownParticipants = async (ownerId) => {
  const db = getDb();
  const ownerPools = db.select({ id: pools.id }).from(pools).where(eq(pools.ownerId, ownerId)).all();
  const poolIds = ownerPools.map((p) => p.id);
  if (!poolIds.length) return [];

  const participantRows = db
    .select({
      participant: poolParticipants,
      user: users
    })
    .from(poolParticipants)
    .leftJoin(users, eq(poolParticipants.userId, users.id))
    .where(and(inArray(poolParticipants.poolId, poolIds), isNotNull(poolParticipants.userId)))
    .all();

  const map = new Map();
  participantRows.forEach(({ user }) => {
    if (user) map.set(user.id, user);
  });

  return Array.from(map.values());
};

export const setPoolClosed = async ({ poolId, ownerId, isClosed }) => {
  const db = getDb();
  const pool = await getPoolByIdForOwner(poolId, ownerId);
  if (!pool) return null;

  db.update(pools).set({ isClosed: isClosed ? 1 : 0, updatedAt: new Date() }).where(eq(pools.id, pool.id)).run();

  return loadPoolById(pool.id);
};
