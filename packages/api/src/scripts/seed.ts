import 'dotenv/config';
import { db } from '../db/index.js';
import { initDb } from '../db/client.js';
import { teams, matches } from '../db/schema/index.js';
import { calcPredictionLock } from '../lib/match-helpers.js';

/**
 * Seed del Mundial 2026.
 *
 * NOTA sobre la fuente de datos (D2 del PLANNING):
 * - OpenFootball (https://github.com/openfootball/world-cup) historicamente
 *   publica el fixture de cada Mundial en `<year>/cup.txt` y la version JSON
 *   en https://github.com/openfootball/world-cup.json bajo `<year>/worldcup.json`.
 * - El fixture oficial del Mundial 2026 solo quedo definido despues del sorteo
 *   de la FIFA del 5 de diciembre de 2025, por lo que la disponibilidad en
 *   OpenFootball debe re-verificarse manualmente antes de un seed productivo.
 * - Este script genera un fixture PLACEHOLDER: 48 equipos confirmados +
 *   72 partidos de fase de grupos (12 grupos x 6 partidos round-robin).
 *   Las fases de Ronda de 32, R16, QF, SF, 3er puesto y Final NO se generan
 *   todavia porque dependen de la clasificacion real.
 *
 * TODO post-sorteo FIFA:
 *  - Reemplazar TEAMS_DATA con la asignacion real a los 12 grupos (A-L)
 *    seteando el campo `group` en cada team.
 *  - Reemplazar generateGroupStageFixtures() por el calendario oficial
 *    (fechas, sedes y ciudades reales).
 *  - Agregar las 32 llaves de la fase eliminatoria.
 */

type TeamSeed = {
  name: string;
  code: string;
  flag: string;
  confederation: string;
};

// 48 equipos del Mundial 2026 (placeholder mientras no este el sorteo cargado).
const TEAMS_DATA: TeamSeed[] = [
  // CONMEBOL (6)
  { name: 'Argentina', code: 'ARG', flag: '🇦🇷', confederation: 'CONMEBOL' },
  { name: 'Brasil', code: 'BRA', flag: '🇧🇷', confederation: 'CONMEBOL' },
  { name: 'Uruguay', code: 'URU', flag: '🇺🇾', confederation: 'CONMEBOL' },
  { name: 'Colombia', code: 'COL', flag: '🇨🇴', confederation: 'CONMEBOL' },
  { name: 'Ecuador', code: 'ECU', flag: '🇪🇨', confederation: 'CONMEBOL' },
  { name: 'Paraguay', code: 'PAR', flag: '🇵🇾', confederation: 'CONMEBOL' },
  // CONCACAF (6: 3 anfitriones + clasificados)
  { name: 'México', code: 'MEX', flag: '🇲🇽', confederation: 'CONCACAF' },
  { name: 'Estados Unidos', code: 'USA', flag: '🇺🇸', confederation: 'CONCACAF' },
  { name: 'Canadá', code: 'CAN', flag: '🇨🇦', confederation: 'CONCACAF' },
  { name: 'Panamá', code: 'PAN', flag: '🇵🇦', confederation: 'CONCACAF' },
  { name: 'Costa Rica', code: 'CRC', flag: '🇨🇷', confederation: 'CONCACAF' },
  { name: 'Jamaica', code: 'JAM', flag: '🇯🇲', confederation: 'CONCACAF' },
  // UEFA (16)
  { name: 'España', code: 'ESP', flag: '🇪🇸', confederation: 'UEFA' },
  { name: 'Inglaterra', code: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', confederation: 'UEFA' },
  { name: 'Francia', code: 'FRA', flag: '🇫🇷', confederation: 'UEFA' },
  { name: 'Alemania', code: 'GER', flag: '🇩🇪', confederation: 'UEFA' },
  { name: 'Portugal', code: 'POR', flag: '🇵🇹', confederation: 'UEFA' },
  { name: 'Italia', code: 'ITA', flag: '🇮🇹', confederation: 'UEFA' },
  { name: 'Países Bajos', code: 'NED', flag: '🇳🇱', confederation: 'UEFA' },
  { name: 'Bélgica', code: 'BEL', flag: '🇧🇪', confederation: 'UEFA' },
  { name: 'Croacia', code: 'CRO', flag: '🇭🇷', confederation: 'UEFA' },
  { name: 'Suiza', code: 'SUI', flag: '🇨🇭', confederation: 'UEFA' },
  { name: 'Dinamarca', code: 'DEN', flag: '🇩🇰', confederation: 'UEFA' },
  { name: 'Polonia', code: 'POL', flag: '🇵🇱', confederation: 'UEFA' },
  { name: 'Austria', code: 'AUT', flag: '🇦🇹', confederation: 'UEFA' },
  { name: 'Serbia', code: 'SRB', flag: '🇷🇸', confederation: 'UEFA' },
  { name: 'Turquía', code: 'TUR', flag: '🇹🇷', confederation: 'UEFA' },
  { name: 'Noruega', code: 'NOR', flag: '🇳🇴', confederation: 'UEFA' },
  // AFC (8)
  { name: 'Japón', code: 'JPN', flag: '🇯🇵', confederation: 'AFC' },
  { name: 'Corea del Sur', code: 'KOR', flag: '🇰🇷', confederation: 'AFC' },
  { name: 'Australia', code: 'AUS', flag: '🇦🇺', confederation: 'AFC' },
  { name: 'Irán', code: 'IRN', flag: '🇮🇷', confederation: 'AFC' },
  { name: 'Arabia Saudita', code: 'KSA', flag: '🇸🇦', confederation: 'AFC' },
  { name: 'Qatar', code: 'QAT', flag: '🇶🇦', confederation: 'AFC' },
  { name: 'Uzbekistán', code: 'UZB', flag: '🇺🇿', confederation: 'AFC' },
  { name: 'Jordania', code: 'JOR', flag: '🇯🇴', confederation: 'AFC' },
  // CAF (9)
  { name: 'Marruecos', code: 'MAR', flag: '🇲🇦', confederation: 'CAF' },
  { name: 'Senegal', code: 'SEN', flag: '🇸🇳', confederation: 'CAF' },
  { name: 'Egipto', code: 'EGY', flag: '🇪🇬', confederation: 'CAF' },
  { name: 'Nigeria', code: 'NGA', flag: '🇳🇬', confederation: 'CAF' },
  { name: 'Argelia', code: 'ALG', flag: '🇩🇿', confederation: 'CAF' },
  { name: 'Túnez', code: 'TUN', flag: '🇹🇳', confederation: 'CAF' },
  { name: 'Camerún', code: 'CMR', flag: '🇨🇲', confederation: 'CAF' },
  { name: 'Costa de Marfil', code: 'CIV', flag: '🇨🇮', confederation: 'CAF' },
  { name: 'Ghana', code: 'GHA', flag: '🇬🇭', confederation: 'CAF' },
  // OFC (1)
  { name: 'Nueva Zelanda', code: 'NZL', flag: '🇳🇿', confederation: 'OFC' },
  // Playoffs intercontinentales (placeholders, 2 cupos)
  { name: 'Playoff TBD 1', code: 'PO1', flag: '🏳️', confederation: 'PLAYOFF' },
  { name: 'Playoff TBD 2', code: 'PO2', flag: '🏳️', confederation: 'PLAYOFF' },
];

type GroupFixture = {
  matchNumber: number;
  homeCode: string;
  awayCode: string;
  kickoffUtc: string;
  venue: string;
  city: string;
  group: string;
  round: 'group';
  status: 'scheduled';
};

/**
 * Genera fixture de fase de grupos: 12 grupos (A-L) x 6 partidos round-robin
 * = 72 partidos. Equipos asignados secuencialmente desde TEAMS_DATA.
 *
 * Round robin: 1v2, 3v4, 1v3, 2v4, 1v4, 2v3 (orden estandar de OpenFootball).
 *
 * Fechas: arrancan el 11/06/2026 19:00 UTC y se escalonan cada 12hs (placeholder).
 */
function generateGroupStageFixtures(): GroupFixture[] {
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const fixtures: GroupFixture[] = [];
  let matchNumber = 1;
  let teamIndex = 0;
  const baseDate = new Date('2026-06-11T19:00:00Z');

  for (const group of groups) {
    const teamCodes = TEAMS_DATA.slice(teamIndex, teamIndex + 4).map((t) => t.code);
    teamIndex += 4;

    const pairings: Array<[number, number]> = [
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
      [0, 3],
      [1, 2],
    ];

    for (const pair of pairings) {
      const kickoff = new Date(
        baseDate.getTime() + matchNumber * 12 * 60 * 60 * 1000,
      ).toISOString();
      fixtures.push({
        matchNumber: matchNumber++,
        homeCode: teamCodes[pair[0]],
        awayCode: teamCodes[pair[1]],
        kickoffUtc: kickoff,
        venue: 'TBD',
        city: 'TBD',
        group,
        round: 'group',
        status: 'scheduled',
      });
    }
  }
  return fixtures;
}

async function seed(): Promise<void> {
  console.log('🏆 Seeding Mundialito DB...');
  await initDb();

  // Check if already seeded.
  const existingTeams = await db.select().from(teams).limit(1);
  if (existingTeams.length > 0) {
    console.log('Already seeded, skipping.');
    process.exit(0);
  }

  // 1. Insertar teams (asigna `group` segun el orden secuencial A-L).
  console.log(`Inserting ${TEAMS_DATA.length} teams...`);
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const teamsWithGroup = TEAMS_DATA.map((t, i) => ({
    ...t,
    group: groups[Math.floor(i / 4)] ?? null,
  }));
  await db.insert(teams).values(teamsWithGroup).onConflictDoNothing();
  // Build map from all teams in DB (in case some already existed and were skipped).
  const allTeams = await db.select().from(teams);
  const teamByCode = new Map(allTeams.map((t) => [t.code, t]));

  // 2. Insertar matches de fase de grupos.
  const groupFixtures = generateGroupStageFixtures();
  console.log(`Inserting ${groupFixtures.length} group stage matches...`);

  for (const m of groupFixtures) {
    const home = teamByCode.get(m.homeCode);
    const away = teamByCode.get(m.awayCode);
    if (!home || !away) {
      console.warn(`Skipping match ${m.matchNumber}: missing team`);
      continue;
    }
    await db
      .insert(matches)
      .values({
        matchNumber: m.matchNumber,
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffUtc: m.kickoffUtc,
        predictionLockUtc: calcPredictionLock(m.kickoffUtc),
        venue: m.venue,
        city: m.city,
        group: m.group,
        round: m.round,
        status: m.status,
      })
      .onConflictDoNothing();
  }

  console.log('✅ Seed complete.');
  console.log(
    '⚠️  Pendiente: fases R32, R16, QF, SF, 3er puesto y Final (requieren clasificacion).',
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
