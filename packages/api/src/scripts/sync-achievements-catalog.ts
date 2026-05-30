/**
 * Inserts any achievement defined in the seed catalog that isn't already in
 * the DB, and updates name/description/icon/pointsBonus when they drift.
 * Run after adding logros to ACHIEVEMENTS_DATA in seed.ts.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/sync-achievements-catalog.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { achievements } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

const CATALOG = [
  { slug: 'first_prediction', name: 'Primer Pronóstico', description: 'Guardaste tu primer pronóstico', icon: '🎯', pointsBonus: 5, tier: 'bronze' },
  { slug: 'first_league', name: 'Primera Liga', description: 'Te uniste a tu primera liga', icon: '🏟️', pointsBonus: 5, tier: 'bronze' },
  { slug: 'league_founder', name: 'Fundador', description: 'Creaste una liga', icon: '👑', pointsBonus: 10, tier: 'silver' },
  { slug: 'invite_5', name: 'El Organizador', description: 'Tu liga tiene 5 o más miembros', icon: '🎉', pointsBonus: 15, tier: 'silver' },
  { slug: 'exact_score', name: 'Ojo de Halcón', description: 'Acertaste el resultado exacto', icon: '🔥', pointsBonus: 10, tier: 'bronze' },
  { slug: 'triple_exact', name: 'Hat-trick Profético', description: 'Tres resultados exactos en una fecha', icon: '🎩', pointsBonus: 50, tier: 'gold' },
  { slug: 'hot_streak_3', name: 'Racha Caliente', description: 'Acertaste 3 ganadores seguidos', icon: '🌶️', pointsBonus: 15, tier: 'silver' },
  { slug: 'hot_streak_5', name: 'En Llamas', description: 'Acertaste 5 ganadores seguidos', icon: '🔥', pointsBonus: 25, tier: 'gold' },
  { slug: 'prophet', name: 'Profeta', description: 'Acertaste el campeón del Mundial', icon: '🏆', pointsBonus: 100, tier: 'platinum' },
  { slug: 'top_scorer_prophet', name: 'Ojeador', description: 'Acertaste el goleador del torneo', icon: '⚽', pointsBonus: 75, tier: 'platinum' },
  { slug: 'early_bird', name: 'Madrugador', description: 'Completaste todos los pronósticos de grupos antes del partido inaugural', icon: '🌅', pointsBonus: 20, tier: 'silver' },
  { slug: 'social_butterfly', name: 'Social', description: 'Participás en 3 o más ligas', icon: '🦋', pointsBonus: 10, tier: 'silver' },
  { slug: 'comeback_king', name: 'Remontada', description: 'Pasaste de último a top 3 en una liga', icon: '📈', pointsBonus: 30, tier: 'gold' },
  { slug: 'perfect_group', name: 'Grupo Perfecto', description: 'Acertaste todos los resultados (ganador) de un grupo', icon: '✨', pointsBonus: 40, tier: 'gold' },
  { slug: 'upset_hunter', name: 'Cazador de Sorpresas', description: 'Acertaste 3 sorpresas (favorito perdió)', icon: '🐉', pointsBonus: 20, tier: 'silver' },
  { slug: 'loyal', name: 'Fiel Seguidor', description: 'Ingresaste a la app 7 días durante el torneo', icon: '💎', pointsBonus: 10, tier: 'silver' },
  { slug: 'share_master', name: 'Influencer', description: 'Compartiste 5 pronósticos como imagen', icon: '📸', pointsBonus: 10, tier: 'silver' },
  { slug: 'fantasy_legend', name: 'Leyenda del Fantasy', description: 'Fuiste el mejor en fantasy de tu liga', icon: '🌟', pointsBonus: 50, tier: 'gold' },
  { slug: 'perfect_knockout', name: 'Adivino de Octavos', description: 'Acertaste todos los resultados de octavos de final', icon: '🎰', pointsBonus: 60, tier: 'gold' },
  { slug: 'underdog', name: 'El Underdog', description: 'Ganaste la liga sin haber estado en top 3 antes de cuartos', icon: '🐺', pointsBonus: 80, tier: 'platinum' },
  // Small fun logros
  { slug: 'predictor_10', name: 'Tomando Confianza', description: 'Pronosticaste 10 partidos', icon: '🪙', pointsBonus: 3, tier: 'bronze' },
  { slug: 'predictor_30', name: 'Quinielero Serio', description: 'Pronosticaste 30 partidos', icon: '📝', pointsBonus: 8, tier: 'bronze' },
  { slug: 'group_completionist', name: 'No Te Falta Ninguno', description: 'Pronosticaste los 72 partidos de fase de grupos', icon: '🧩', pointsBonus: 15, tier: 'silver' },
  { slug: 'group_sampler', name: 'Recorrido Mundial', description: 'Pronosticaste al menos un partido de cada grupo', icon: '🌍', pointsBonus: 8, tier: 'bronze' },
  { slug: 'night_owl', name: 'Hora Bruja', description: 'Guardaste un pronóstico entre las 0 y las 5 de la mañana', icon: '🌙', pointsBonus: 5, tier: 'bronze' },
];

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const a of CATALOG) {
    const existing = await db.select().from(achievements).where(eq(achievements.slug, a.slug)).get();
    if (!existing) {
      await db.insert(achievements).values(a);
      inserted++;
      console.log(`  + ${a.slug}`);
    } else {
      const drift =
        existing.name !== a.name ||
        existing.description !== a.description ||
        existing.icon !== a.icon ||
        existing.pointsBonus !== a.pointsBonus ||
        existing.tier !== a.tier;
      if (drift) {
        await db
          .update(achievements)
          .set({
            name: a.name,
            description: a.description,
            icon: a.icon,
            pointsBonus: a.pointsBonus,
            tier: a.tier,
          })
          .where(eq(achievements.slug, a.slug));
        updated++;
        console.log(`  ~ ${a.slug}`);
      }
    }
  }
  console.log(`[catalog] ${inserted} inserted, ${updated} updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
