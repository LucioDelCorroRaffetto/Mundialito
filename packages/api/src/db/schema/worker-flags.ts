import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workerFlags = sqliteTable('worker_flags', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type WorkerFlag = typeof workerFlags.$inferSelect;
