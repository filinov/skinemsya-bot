import crypto from "crypto";
import Pool from "../models/Pool.js";
import { getDisplayName } from "./userService.js";

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
    user: user._id,
    displayName: getDisplayName(user),
    expectedAmount: shareAmount,
    status: "invited"
  }));

  const joinCode = generateJoinCode();

  const pool = await Pool.create({
    owner: ownerId,
    title,
    amountType,
    totalAmount: amountType === "total" ? totalAmount : undefined,
    perPersonAmount: amountType === "per_person" ? perPersonAmount : undefined,
    paymentDetails,
    shareAmount,
    expectedParticipantsCount: participantCount,
    participants: participantsData,
    joinCode
  });

  return pool;
};

export const getPoolByJoinCode = (joinCode) =>
  Pool.findOne({ joinCode, isClosed: false }).populate("owner").populate("participants.user");

export const getPoolsByOwner = async (ownerId, { limit = 10, page = 1 } = {}) => {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safePage = Math.max(1, page);
  const [items, total] = await Promise.all([
    Pool.find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("participants.user"),
    Pool.countDocuments({ owner: ownerId })
  ]);

  return { items, total, page: safePage, limit: safeLimit };
};

export const getPoolByIdForOwner = (poolId, ownerId) =>
  Pool.findOne({ _id: poolId, owner: ownerId }).populate("participants.user");

export const getPoolById = (poolId) => Pool.findById(poolId).populate("participants.user").populate("owner");

export const ensureParticipant = async (pool, user, opts = {}) => {
  const displayName = getDisplayName(user);
  const participant = pool.participants.find((p) => p.user && p.user.equals(user._id));

  if (participant) {
    if (!participant.joinedAt) participant.joinedAt = new Date();
    participant.status = participant.status === "confirmed" ? "confirmed" : "joined";
  } else {
    pool.participants.push({
      user: user._id,
      displayName,
      status: "joined",
      joinedAt: new Date(),
      expectedAmount: opts.shareAmount ?? pool.shareAmount ?? 0,
      payMethod: "unknown"
    });
  }

  await pool.save();
  await pool.populate("participants.user");

  return pool;
};

export const markParticipantPaid = async ({ poolId, userId, payMethod = "transfer", note }) => {
  const pool = await Pool.findById(poolId).populate("participants.user").populate("owner");
  if (!pool) return null;

  const participant = pool.participants.find((p) => p.user && p.user._id.equals(userId));
  if (!participant) return null;

  if (participant.status === "confirmed") return pool;

  participant.status = "marked_paid";
  participant.paidAmount = participant.expectedAmount ?? pool.shareAmount ?? 0;
  participant.payMethod = payMethod;
  participant.note = note;
  participant.markedAt = new Date();

  await pool.save();
  await pool.populate("participants.user");
  return pool;
};

export const confirmParticipantPayment = async ({ poolId, participantId, ownerId, amount }) => {
  const pool = await Pool.findOne({ _id: poolId, owner: ownerId }).populate("participants.user");
  if (!pool) return null;

  const participant = pool.participants.id(participantId);
  if (!participant) return null;

  participant.status = "confirmed";
  const paid = amount ?? participant.paidAmount ?? participant.expectedAmount ?? pool.shareAmount ?? 0;
  participant.paidAmount = paid;
  participant.confirmedAt = new Date();

  await pool.save();
  await pool.populate("participants.user");
  return pool;
};

export const manualConfirmParticipantPayment = async ({ poolId, participantId, ownerId, amount }) => {
  const pool = await Pool.findOne({ _id: poolId, owner: ownerId }).populate("participants.user");
  if (!pool) return null;

  const participant = pool.participants.id(participantId);
  if (!participant) return null;

  participant.status = "confirmed";
  const paid = amount ?? participant.paidAmount ?? participant.expectedAmount ?? pool.shareAmount ?? 0;
  participant.paidAmount = paid;
  participant.joinedAt = participant.joinedAt ?? new Date();
  participant.markedAt = participant.markedAt ?? new Date();
  participant.confirmedAt = new Date();
  participant.payMethod = participant.payMethod || "unknown";

  await pool.save();
  await pool.populate("participants.user");
  return pool;
};

export const markOwnerSelfPayment = async ({ poolId, owner, amount }) => {
  const pool = await Pool.findOne({ _id: poolId, owner: owner._id }).populate("participants.user").populate("owner");
  if (!pool) return null;

  const expectedAmount = pool.shareAmount ?? pool.perPersonAmount ?? pool.totalAmount ?? 0;
  const ownerId = owner._id?.toString();
  let participant = pool.participants.find((p) => {
    const id = p.user?._id?.toString?.() ?? p.user?.toString?.();
    return id === ownerId;
  });

  if (!participant) {
    participant = pool.participants.create({
      user: owner._id,
      displayName: getDisplayName(owner),
      status: "confirmed",
      expectedAmount,
      paidAmount: amount ?? expectedAmount,
      payMethod: "unknown",
      joinedAt: new Date(),
      markedAt: new Date(),
      confirmedAt: new Date()
    });
    pool.participants.push(participant);
  } else {
    participant.status = "confirmed";
    participant.expectedAmount = participant.expectedAmount ?? expectedAmount;
    participant.paidAmount = amount ?? participant.paidAmount ?? participant.expectedAmount ?? expectedAmount;
    participant.joinedAt = participant.joinedAt ?? new Date();
    participant.markedAt = participant.markedAt ?? new Date();
    participant.confirmedAt = new Date();
    participant.payMethod = participant.payMethod || "unknown";
  }

  await pool.save();
  await pool.populate("participants.user");
  return pool;
};

export const getKnownParticipants = async (ownerId) => {
  const pools = await Pool.find({ owner: ownerId }).populate("participants.user");
  const map = new Map();

  pools.forEach((pool) => {
    pool.participants.forEach((participant) => {
      if (participant.user) {
        map.set(participant.user._id.toString(), participant.user);
      }
    });
  });

  return Array.from(map.values());
};

export const setPoolClosed = async ({ poolId, ownerId, isClosed }) => {
  const pool = await Pool.findOne({ _id: poolId, owner: ownerId }).populate("participants.user");
  if (!pool) return null;

  pool.isClosed = isClosed;
  await pool.save();
  await pool.populate("participants.user");

  return pool;
};
