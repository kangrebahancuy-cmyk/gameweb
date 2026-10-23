import { sql } from 'drizzle-orm';
import {
  bigint, bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, unique, uuid,
} from 'drizzle-orm/pg-core';

/** Source of truth for typed queries. SQL lives in ../../migrations (kept in sync, verified by test/store.test.ts). */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  role: text('role').notNull().default('player'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull().default(0),
  name: text('name').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  hp: integer('hp').notNull(),
  coins: bigint('coins', { mode: 'number' }).notNull().default(0),
  farmRows: integer('farm_rows').notNull().default(2),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.accountId, t.slot),
  uniqueIndex('characters_name_lower_uq').on(sql`lower(${t.name})`),
  check('hp_positive', sql`${t.hp} > 0`),
]);

export const characterSkills = pgTable('character_skills', {
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  skill: text('skill').notNull(),
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.characterId, t.skill] })]);

export const inventoryItems = pgTable('inventory_items', {
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  slot: integer('slot').notNull(),
  itemId: text('item_id').notNull(),
  qty: bigint('qty', { mode: 'number' }).notNull(),
}, (t) => [primaryKey({ columns: [t.characterId, t.slot] })]);

export const farmPlots = pgTable('farm_plots', {
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  state: text('state').notNull(),
  cropId: text('crop_id'),
  plantedAt: bigint('planted_at', { mode: 'number' }),
}, (t) => [primaryKey({ columns: [t.characterId, t.x, t.y] })]);

export const questProgress = pgTable('quest_progress', {
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  questId: text('quest_id').notNull(),
  step: integer('step').notNull().default(0),
  progress: integer('progress').notNull().default(0),
  done: boolean('done').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.characterId, t.questId] })]);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  accountId: uuid('account_id'),
  characterId: uuid('character_id'),
  action: text('action').notNull(),
  detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
}, (t) => [index('audit_log_account_idx').on(t.accountId, t.at)]);
