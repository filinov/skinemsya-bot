import crypto from "crypto";
import prisma from "../config/prisma.js";
import { getDisplayName } from "./userService.js";

const poolInclude = {
  owner: true,
  participants: {
    include: {
      user: true
    }
  }
};

const reloadPool = (poolId) => prisma.pool.findUnique({ where: { id: poolId }, include: poolInclude });

export const generateJoinCode = () => crypto.randomBytes(6).toString("hex");

export const calculateShareAmount = ({ amountType, totalAmount = 0, perPersonAmount = 0, participantCount = 1 }) => {
  if (amountType === "per_person") return perPersonAmount;
  if (participantCount <= 0) return totalAmount;
  return Math.ceil(totalAmount / participantCount);
};

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
  const participantCount = participants.length > 0 ? participants.length : expectedParticipantsCount;
  const shareAmount = calculateShareAmount({
    amountType,
    totalAmount,
    perPersonAmount,
    participantCount
  });

  const participantsData = participants.map((user) => ({
    user: { connect: { id: user.id } },
    displayName: getDisplayName(user),
    expectedAmount: shareAmount,
    status: "invited"
  }));

  const joinCode = generateJoinCode();

  const pool = await prisma.pool.create({
    data: {
      owner: { connect: { id: ownerId } },
      title,
      amountType,
      totalAmount: amountType === "total" ? totalAmount ?? 0 : null,
      perPersonAmount: amountType === "per_person" ? perPersonAmount ?? 0 : null,
      paymentDetails,
      shareAmount,
      expectedParticipantsCount: participantCount,
      participants: { create: participantsData },
      joinCode
    },
    include: poolInclude
  });

  return pool;
};

export const getPoolByJoinCode = (joinCode) =>
  prisma.pool.findFirst({ where: { joinCode, isClosed: false }, include: poolInclude });

export const getPoolsByOwner = async (ownerId, { limit = 10, page = 1 } = {}) => {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safePage = Math.max(1, page);
  const [items, total] = await Promise.all([
    prisma.pool.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit
    }),
    prisma.pool.count({ where: { ownerId } })
  ]);

  return { items, total, page: safePage, limit: safeLimit };
};

export const getPoolByIdForOwner = (poolId, ownerId) =>
  prisma.pool.findFirst({ where: { id: poolId, ownerId }, include: poolInclude });

export const getPoolById = (poolId) => prisma.pool.findUnique({ where: { id: poolId }, include: poolInclude });

export const ensureParticipant = async (pool, user, opts = {}) => {
  const displayName = getDisplayName(user);
  const existing = await prisma.poolParticipant.findFirst({
    where: { poolId: pool.id, userId: user.id }
  });

  if (existing) {
    await prisma.poolParticipant.update({
      where: { id: existing.id },
      data: {
        joinedAt: existing.joinedAt ?? new Date(),
        status: existing.status === "confirmed" ? "confirmed" : "joined"
      }
    });
    return reloadPool(pool.id);
  }

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      participants: {
        create: {
          user: { connect: { id: user.id } },
          displayName,
          status: "joined",
          joinedAt: new Date(),
          expectedAmount: opts.shareAmount ?? pool.shareAmount ?? 0,
          payMethod: "unknown"
        }
      }
    }
  });

  return reloadPool(pool.id);
};

export const markParticipantPaid = async ({ poolId, userId, payMethod = "transfer", note }) => {
  const pool = await getPoolById(poolId);
  if (!pool) return null;

  const participant = pool.participants.find((p) => p.userId === userId);
  if (!participant) return null;
  if (participant.status === "confirmed") return pool;

  const paidAmount = participant.expectedAmount ?? pool.shareAmount ?? 0;

  await prisma.poolParticipant.update({
    where: { id: participant.id },
    data: {
      status: "marked_paid",
      paidAmount,
      payMethod,
      note,
      markedAt: new Date()
    }
  });

  return reloadPool(pool.id);
};

export const confirmParticipantPayment = async ({ poolId, participantId, ownerId, amount }) => {
  const pool = await getPoolByIdForOwner(poolId, ownerId);
  if (!pool) return null;

  const participant = pool.participants.find((p) => p.id === participantId);
  if (!participant) return null;

  const paid = amount ?? participant.paidAmount ?? participant.expectedAmount ?? pool.shareAmount ?? 0;

  await prisma.poolParticipant.update({
    where: { id: participant.id },
    data: {
      status: "confirmed",
      paidAmount: paid,
      confirmedAt: new Date()
    }
  });

  return reloadPool(pool.id);
};

export const manualConfirmParticipantPayment = async ({ poolId, participantId, ownerId, amount }) => {
  const pool = await getPoolByIdForOwner(poolId, ownerId);
  if (!pool) return null;

  const participant = pool.participants.find((p) => p.id === participantId);
  if (!participant) return null;

  const paid = amount ?? participant.paidAmount ?? participant.expectedAmount ?? pool.shareAmount ?? 0;

  await prisma.poolParticipant.update({
    where: { id: participant.id },
    data: {
      status: "confirmed",
      paidAmount: paid,
      joinedAt: participant.joinedAt ?? new Date(),
      markedAt: participant.markedAt ?? new Date(),
      confirmedAt: new Date(),
      payMethod: participant.payMethod || "unknown"
    }
  });

  return reloadPool(pool.id);
};

export const markOwnerSelfPayment = async ({ poolId, owner, amount }) => {
  const pool = await getPoolByIdForOwner(poolId, owner.id);
  if (!pool) return null;

  const expectedAmount = pool.shareAmount ?? pool.perPersonAmount ?? pool.totalAmount ?? 0;
  const ownerParticipant = pool.participants.find((p) => p.userId === owner.id);

  if (ownerParticipant) {
    await prisma.poolParticipant.update({
      where: { id: ownerParticipant.id },
      data: {
        status: "confirmed",
        expectedAmount: ownerParticipant.expectedAmount ?? expectedAmount,
        paidAmount: amount ?? ownerParticipant.paidAmount ?? ownerParticipant.expectedAmount ?? expectedAmount,
        joinedAt: ownerParticipant.joinedAt ?? new Date(),
        markedAt: ownerParticipant.markedAt ?? new Date(),
        confirmedAt: new Date(),
        payMethod: ownerParticipant.payMethod || "unknown"
      }
    });
  } else {
    await prisma.poolParticipant.create({
      data: {
        pool: { connect: { id: pool.id } },
        user: { connect: { id: owner.id } },
        displayName: getDisplayName(owner),
        status: "confirmed",
        expectedAmount,
        paidAmount: amount ?? expectedAmount,
        payMethod: "unknown",
        joinedAt: new Date(),
        markedAt: new Date(),
        confirmedAt: new Date()
      }
    });
  }

  return reloadPool(pool.id);
};

export const getKnownParticipants = async (ownerId) => {
  const pools = await prisma.pool.findMany({
    where: { ownerId },
    include: {
      participants: {
        where: { userId: { not: null } },
        include: { user: true }
      }
    }
  });

  const map = new Map();

  pools.forEach((pool) => {
    pool.participants.forEach((participant) => {
      if (participant.user) {
        map.set(participant.user.id, participant.user);
      }
    });
  });

  return Array.from(map.values());
};

export const setPoolClosed = async ({ poolId, ownerId, isClosed }) => {
  const pool = await getPoolByIdForOwner(poolId, ownerId);
  if (!pool) return null;

  await prisma.pool.update({
    where: { id: pool.id },
    data: { isClosed }
  });

  return reloadPool(pool.id);
};
