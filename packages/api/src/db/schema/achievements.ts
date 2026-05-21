import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const achievements = sqliteTable('achievements', {
  slug: text('slug').primaryKey(),           // 'first_prediction', 'hot_streak', etc.
  name: text('name').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull(),              // emoji
  pointsBonus: integer('points_bonus').notNull().default(0),
  tier: text('tier').notNull().default('bronze'), // 'bronze' | 'silver' | 'gold' | 'platinum'
});

export const userAchievements = sqliteTable('user_achievements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementSlug: text('achievement_slug').notNull().references(() => achievements.slug),
  leagueId: integer('league_id'),   // nullable — some achievements are per-league
  earnedAt: text('earned_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  uniqUserAchievement: uniqueIndex('user_achievements_user_slug_idx').on(t.userId, t.achievementSlug),
}));

export type Achievement = typeof achievements.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
