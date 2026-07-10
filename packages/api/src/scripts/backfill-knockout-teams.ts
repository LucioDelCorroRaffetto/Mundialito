/**
 * backfill-knockout-teams.ts
 *
 * Escribe los home/away_team_id REALES de los cruces de eliminación que hoy
 * apuntan al placeholder TBD. Sin esto el resolver de predicciones de Copa
 * (services/tournament-resolver.ts) no puede computar campeón, profundidad
 * alcanzada, revelación ni decepción: lee matches.home/away_team_id directo.
 *
 * Fuente: el endpoint FIFA-live de cada partido (fifa_id_stage/fifa_id_match),
 * el mismo del que sync-fifa-stats toma el score. La orientación home/away de
 * FIFA es la del fixture oficial — idéntica a la de la projection del bracket
 * del front y a la de los scores ya guardados, así que NO hay que tocar
 * pronósticos (la orientación que vio el usuario no cambia).
 *
 * Solo actualiza team_ids (nunca scores) y solo en filas donde el slot sigue
 * en TBD. Partidos cuyos equipos FIFA todavía no definió ("To Be Determined")
 * se saltean. Idempotente: re-correrlo no cambia nada ya backfilleado.
 *
 * Run (dry-run):  cd packages/api && npx tsx src/scripts/backfill-knockout-teams.ts
 * Aplicar:        npx tsx src/scripts/backfill-knockout-teams.ts --apply
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { normName } from '../lib/fifa-parse.js';
import { FIFA_NAME_TO_CODE } from '../services/sync-fifa-stats.js';
dotenv.config();

const FIFA_BASE = 'https://api.fifa.com/api/v3';
const FIFA_COMPETITION_ID = '17';
const FIFA_SEASON_ID = '285023';

const APPLY = process.argv.includes('--apply');

interface FifaLiveTeamFull {
  IdTeam?: string | null;
  Abbreviation?: string | null;
  ShortClubName?: string | null;
  IdCountry?: string | null;
  TeamName?: Array<{ Locale: string; Description: string }> | null;
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/** Resuelve un lado del feed FIFA a nuestro team_id probando nombre → alias → code. */
function resolveTeamId(
  t: FifaLiveTeamFull | null | undefined,
  teamIdByNorm: Map<string, number>,
): number | null {
  if (!t) return null;
  const candidates = [
    t.TeamName?.[0]?.Description,
    t.ShortClubName,
    t.Abbreviation,
    t.IdCountry,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const id = teamIdByNorm.get(normName(c));
    if (id != null) return id;
  }
  return null;
}

async function run() {
  console.log(`Backfill knockout team_ids — modo ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const teamRows = (await client.execute('SELECT id, code, name FROM teams')).rows as unknown as
    Array<{ id: number; code: string; name: string }>;
  const teamIdByCode = new Map(teamRows.map((t) => [t.code.toUpperCase(), t.id]));
  const teamIdByNorm = new Map<string, number>();
  for (const t of teamRows) {
    if (t.code === 'TBD' || t.code === '???') continue; // nunca resolver AL placeholder
    teamIdByNorm.set(normName(t.name), t.id);
    teamIdByNorm.set(t.code.toLowerCase(), t.id);
  }
  for (const [alias, code] of Object.entries(FIFA_NAME_TO_CODE)) {
    const id = teamIdByCode.get(code);
    if (id != null) teamIdByNorm.set(normName(alias), id);
  }
  const nameById = new Map(teamRows.map((t) => [t.id, `${t.name} (${t.code})`]));
  const tbdId = teamIdByCode.get('TBD');
  if (tbdId == null) throw new Error('No existe el equipo TBD — nada que backfillear.');

  const kos = (await client.execute({
    sql: `SELECT id, match_number, round, status, fifa_id_stage, fifa_id_match,
                 home_team_id, away_team_id
          FROM matches
          WHERE [group] IS NULL AND (home_team_id = ? OR away_team_id = ?)
          ORDER BY match_number`,
    args: [tbdId, tbdId],
  })).rows as unknown as Array<{
    id: number; match_number: number; round: string; status: string;
    fifa_id_stage: string | null; fifa_id_match: string | null;
    home_team_id: number; away_team_id: number;
  }>;

  console.log(`${kos.length} cruces con placeholder TBD.\n`);
  let updated = 0;
  let skipped = 0;

  for (const m of kos) {
    const tag = `M${m.match_number} (${m.round}, ${m.status})`;
    if (!m.fifa_id_stage || !m.fifa_id_match) {
      console.log(`  ${tag}: sin FIFA ids — skip`);
      skipped++;
      continue;
    }
    const url = `${FIFA_BASE}/live/football/${FIFA_COMPETITION_ID}/${FIFA_SEASON_ID}/${m.fifa_id_stage}/${m.fifa_id_match}?language=en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      console.log(`  ${tag}: FIFA live devolvió ${res.status} — skip`);
      skipped++;
      continue;
    }
    const live = (await res.json()) as { HomeTeam?: FifaLiveTeamFull | null; AwayTeam?: FifaLiveTeamFull | null } | null;
    if (!live) {
      console.log(`  ${tag}: FIFA live sin datos todavía — skip`);
      skipped++;
      continue;
    }
    const homeId = resolveTeamId(live.HomeTeam, teamIdByNorm);
    const awayId = resolveTeamId(live.AwayTeam, teamIdByNorm);
    if (homeId == null || awayId == null) {
      console.log(`  ${tag}: equipos aún no definidos por FIFA — skip`);
      skipped++;
      continue;
    }
    console.log(`  ${tag}: ${nameById.get(homeId)} vs ${nameById.get(awayId)}${APPLY ? '' : ' [dry-run]'}`);
    if (APPLY) {
      await client.execute({
        sql: 'UPDATE matches SET home_team_id = ?, away_team_id = ? WHERE id = ?',
        args: [homeId, awayId, m.id],
      });
      updated++;
    }
  }

  console.log(`\n${APPLY ? `Actualizados: ${updated}` : 'Dry-run — nada escrito'} · Salteados: ${skipped}`);
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
