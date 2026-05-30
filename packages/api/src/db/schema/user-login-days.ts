import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

/**
 * One row per user per UTC calendar day they made an authenticated request.
 * Used to evaluate the `loyal` logro (≥7 distinct days). Cheap to maintain
 * with an `INSERT OR IGNORE` from middleware on every authed call.
 */
export const userLoginDays = sqliteTable('user_login_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day: text('day').notNull(), // 'YYYY-MM-DD' in UTC
}, (t) => ({
  uniqUserDay: uniqueIndex('user_login_days_user_day_idx').on(t.userId, t.day),
}));

export type UserLoginDay = typeof userLoginDays.$inferSelect;
export type NewUserLoginDay = typeof userLoginDays.$inferInsert;
