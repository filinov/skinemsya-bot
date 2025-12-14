import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name) => integer(name, { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  languageCode: text("language_code"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
});

export const pools = sqliteTable("pools", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  amountType: text("amount_type").notNull().default("total"),
  totalAmount: real("total_amount"),
  perPersonAmount: real("per_person_amount"),
  shareAmount: real("share_amount"),
  expectedParticipantsCount: integer("expected_participants_count").notNull().default(1),
  paymentDetails: text("payment_details").notNull(),
  joinCode: text("join_code").notNull().unique(),
  currency: text("currency").notNull().default("RUB"),
  isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
});

export const poolParticipants = sqliteTable("pool_participants", {
  id: text("id").primaryKey(),
  poolId: text("pool_id")
    .notNull()
    .references(() => pools.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("invited"),
  paidAmount: real("paid_amount").notNull().default(0),
  expectedAmount: real("expected_amount").notNull().default(0),
  payMethod: text("pay_method").notNull().default("unknown"),
  note: text("note"),
  joinedAt: timestamp("joined_at"),
  markedAt: timestamp("marked_at"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
});

export const sessions = sqliteTable("sessions", {
  key: text("key").primaryKey(),
  data: text("data").notNull().default("{}"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
});
