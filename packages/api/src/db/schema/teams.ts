import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),      // 'ARG', 'BRA', etc.
  flag: text('flag').notNull(),               // emoji de bandera
  group: text('group'),                       // 'A'–'H', null en eliminatorias
  confederation: text('confederation'),       // 'CONMEBOL', 'UEFA', etc.
  fifaRank: integer('fifa_rank'),             // FIFA World Ranking (lower = better); null for placeholders
});

export type Team = typeof teams.$inferSelect;
