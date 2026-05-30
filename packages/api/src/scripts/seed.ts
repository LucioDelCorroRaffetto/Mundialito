/**
 * Seed script — run with: npm run db:seed
 * Idempotent: safe to run multiple times.
 *
 * Requires env vars:
 *   TURSO_DATABASE_URL=libsql://your-db.turso.io
 *   TURSO_AUTH_TOKEN=your-token
 *
 * For local dev with SQLite:
 *   TURSO_DATABASE_URL=file:local.db (no auth token needed)
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { initDb } from '../db/client.js';
import { teams, matches, players, achievements } from '../db/schema/index.js';
import { calcPredictionLock } from '../lib/match-helpers.js';
import { sql } from 'drizzle-orm';

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
 * Venue data for World Cup 2026.
 * 16 official venues across USA (11), Mexico (3), Canada (2).
 */
const WC2026_VENUES: Array<{ city: string; venue: string }> = [
  { city: 'Ciudad de México', venue: 'Estadio Azteca' },      // 0
  { city: 'Guadalajara',      venue: 'Estadio Akron' },       // 1
  { city: 'Monterrey',        venue: 'Estadio BBVA' },        // 2
  { city: 'New York/NJ',      venue: 'MetLife Stadium' },     // 3
  { city: 'Los Angeles',      venue: 'SoFi Stadium' },        // 4
  { city: 'Dallas',           venue: 'AT&T Stadium' },        // 5
  { city: 'San Francisco',    venue: "Levi's Stadium" },      // 6
  { city: 'Miami',            venue: 'Hard Rock Stadium' },   // 7
  { city: 'Seattle',          venue: 'Lumen Field' },         // 8
  { city: 'Kansas City',      venue: 'Arrowhead Stadium' },   // 9
  { city: 'Boston',           venue: 'Gillette Stadium' },    // 10
  { city: 'Philadelphia',     venue: 'Lincoln Financial Field' }, // 11
  { city: 'Houston',          venue: 'NRG Stadium' },         // 12
  { city: 'Atlanta',          venue: 'Mercedes-Benz Stadium' }, // 13
  { city: 'Vancouver',        venue: 'BC Place' },            // 14
  { city: 'Toronto',          venue: 'BMO Field' },           // 15
];

/**
 * Per-match venue index into WC2026_VENUES (match numbers 1-72).
 * Distribution criteria:
 *   - MEX plays at Mexican venues (azteca/akron) for home-feel games.
 *   - CAN plays at Canadian venues (bc/bmo).
 *   - USA games go to marquee US venues.
 *   - All 16 venues are used.
 *
 * Groups:
 *   A (ARG,BRA,URU,COL)  #1-6   D (ESP,ENG,FRA,GER)  #19-24  G (AUT,SRB,TUR,NOR) #37-42
 *   B (ECU,PAR,MEX,USA)  #7-12  E (POR,ITA,NED,BEL)  #25-30  H (JPN,KOR,AUS,IRN) #43-48
 *   C (CAN,PAN,CRC,JAM)  #13-18 F (CRO,SUI,DEN,POL)  #31-36  I (KSA,QAT,UZB,JOR) #49-54
 *                                                               J (MAR,SEN,EGY,NGA) #55-60
 *                                                               K (ALG,TUN,CMR,CIV) #61-66
 *                                                               L (GHA,NZL,PO1,PO2) #67-72
 */
const MATCH_VENUE_IDX: Record<number, number> = {
  // Group A — South American heavyweights
  1: 3,  2: 4,  3: 5,  4: 7,  5: 10, 6: 13,
  // Group B — MEX & USA (Mexican + US venues)
  7: 0,  8: 4,  9: 1,  10: 5, 11: 2, 12: 0,
  // Group C — CAN (Canadian + US venues)
  13: 14, 14: 8, 15: 15, 16: 9, 17: 12, 18: 11,
  // Group D — European giants
  19: 3, 20: 4, 21: 5, 22: 3, 23: 4, 24: 5,
  // Group E — European sides
  25: 6, 26: 13, 27: 7, 28: 10, 29: 11, 30: 6,
  // Group F — European sides
  31: 9, 32: 12, 33: 8, 34: 13, 35: 15, 36: 9,
  // Group G — European/mixed
  37: 6, 38: 10, 39: 12, 40: 11, 41: 7, 42: 8,
  // Group H — Asian teams
  43: 6, 44: 4, 45: 5, 46: 3, 47: 9, 48: 4,
  // Group I — Middle East / Central Asian
  49: 5, 50: 13, 51: 12, 52: 7, 53: 10, 54: 8,
  // Group J — African teams
  55: 3, 56: 5, 57: 13, 58: 4, 59: 6, 60: 7,
  // Group K — African teams
  61: 11, 62: 10, 63: 15, 64: 9, 65: 8, 66: 12,
  // Group L — Mixed
  67: 14, 68: 15, 69: 1, 70: 2, 71: 0, 72: 1,
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
      const venueData = WC2026_VENUES[MATCH_VENUE_IDX[matchNumber] ?? 3];
      fixtures.push({
        matchNumber: matchNumber++,
        homeCode: teamCodes[pair[0]],
        awayCode: teamCodes[pair[1]],
        kickoffUtc: kickoff,
        venue: venueData.venue,
        city: venueData.city,
        group,
        round: 'group',
        status: 'scheduled',
      });
    }
  }
  return fixtures;
}

type PlayerSeed = {
  name: string;
  position: string;
  shirtNumber: number;
};

type TeamPlayerSeed = {
  code: string;
  players: PlayerSeed[];
};

// 7 players per team: 1 GK, 2 DEF, 2 MID, 2 FWD
// Note: teams not present in TEAMS_DATA will be silently skipped.
// SAU is mapped from the player data code 'SAU' to the seed code 'KSA'.
const PLAYERS_BY_TEAM: TeamPlayerSeed[] = [
  { code: 'ARG', players: [
    { name: 'Emiliano Martínez', position: 'GK', shirtNumber: 23 },
    { name: 'Nicolás Otamendi', position: 'DEF', shirtNumber: 19 },
    { name: 'Lisandro Martínez', position: 'DEF', shirtNumber: 25 },
    { name: 'Rodrigo De Paul', position: 'MID', shirtNumber: 7 },
    { name: 'Alexis Mac Allister', position: 'MID', shirtNumber: 20 },
    { name: 'Lionel Messi', position: 'FWD', shirtNumber: 10 },
    { name: 'Julián Álvarez', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'BRA', players: [
    { name: 'Alisson', position: 'GK', shirtNumber: 1 },
    { name: 'Marquinhos', position: 'DEF', shirtNumber: 4 },
    { name: 'Danilo', position: 'DEF', shirtNumber: 2 },
    { name: 'Bruno Guimarães', position: 'MID', shirtNumber: 14 },
    { name: 'Casemiro', position: 'MID', shirtNumber: 5 },
    { name: 'Vinicius Jr', position: 'FWD', shirtNumber: 7 },
    { name: 'Rodrygo', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'FRA', players: [
    { name: 'Mike Maignan', position: 'GK', shirtNumber: 1 },
    { name: 'William Saliba', position: 'DEF', shirtNumber: 17 },
    { name: 'Theo Hernández', position: 'DEF', shirtNumber: 22 },
    { name: 'Aurélien Tchouaméni', position: 'MID', shirtNumber: 8 },
    { name: 'Antoine Griezmann', position: 'MID', shirtNumber: 7 },
    { name: 'Kylian Mbappé', position: 'FWD', shirtNumber: 10 },
    { name: 'Ousmane Dembélé', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'ENG', players: [
    { name: 'Jordan Pickford', position: 'GK', shirtNumber: 1 },
    { name: 'John Stones', position: 'DEF', shirtNumber: 5 },
    { name: 'Kyle Walker', position: 'DEF', shirtNumber: 2 },
    { name: 'Jude Bellingham', position: 'MID', shirtNumber: 10 },
    { name: 'Declan Rice', position: 'MID', shirtNumber: 4 },
    { name: 'Harry Kane', position: 'FWD', shirtNumber: 9 },
    { name: 'Phil Foden', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'ESP', players: [
    { name: 'Unai Simón', position: 'GK', shirtNumber: 1 },
    { name: 'Dani Carvajal', position: 'DEF', shirtNumber: 2 },
    { name: 'Aymeric Laporte', position: 'DEF', shirtNumber: 14 },
    { name: 'Pedri', position: 'MID', shirtNumber: 26 },
    { name: 'Rodri', position: 'MID', shirtNumber: 16 },
    { name: 'Álvaro Morata', position: 'FWD', shirtNumber: 7 },
    { name: 'Lamine Yamal', position: 'FWD', shirtNumber: 19 },
  ]},
  { code: 'GER', players: [
    { name: 'Manuel Neuer', position: 'GK', shirtNumber: 1 },
    { name: 'Antonio Rüdiger', position: 'DEF', shirtNumber: 16 },
    { name: 'Joshua Kimmich', position: 'DEF', shirtNumber: 6 },
    { name: 'Florian Wirtz', position: 'MID', shirtNumber: 10 },
    { name: 'Jamal Musiala', position: 'MID', shirtNumber: 14 },
    { name: 'Kai Havertz', position: 'FWD', shirtNumber: 7 },
    { name: 'Leroy Sané', position: 'FWD', shirtNumber: 19 },
  ]},
  { code: 'POR', players: [
    { name: 'Diogo Costa', position: 'GK', shirtNumber: 1 },
    { name: 'Rúben Dias', position: 'DEF', shirtNumber: 6 },
    { name: 'Nuno Mendes', position: 'DEF', shirtNumber: 19 },
    { name: 'Bruno Fernandes', position: 'MID', shirtNumber: 8 },
    { name: 'Bernardo Silva', position: 'MID', shirtNumber: 10 },
    { name: 'Cristiano Ronaldo', position: 'FWD', shirtNumber: 7 },
    { name: 'Rafael Leão', position: 'FWD', shirtNumber: 17 },
  ]},
  { code: 'NED', players: [
    { name: 'Bart Verbruggen', position: 'GK', shirtNumber: 1 },
    { name: 'Virgil van Dijk', position: 'DEF', shirtNumber: 4 },
    { name: 'Matthijs de Ligt', position: 'DEF', shirtNumber: 3 },
    { name: 'Frenkie de Jong', position: 'MID', shirtNumber: 21 },
    { name: 'Tijjani Reijnders', position: 'MID', shirtNumber: 14 },
    { name: 'Cody Gakpo', position: 'FWD', shirtNumber: 11 },
    { name: 'Donyell Malen', position: 'FWD', shirtNumber: 18 },
  ]},
  { code: 'BEL', players: [
    { name: 'Koen Casteels', position: 'GK', shirtNumber: 1 },
    { name: 'Toby Alderweireld', position: 'DEF', shirtNumber: 4 },
    { name: 'Timothy Castagne', position: 'DEF', shirtNumber: 2 },
    { name: 'Kevin De Bruyne', position: 'MID', shirtNumber: 7 },
    { name: 'Youri Tielemans', position: 'MID', shirtNumber: 8 },
    { name: 'Romelu Lukaku', position: 'FWD', shirtNumber: 9 },
    { name: 'Dodi Lukebakio', position: 'FWD', shirtNumber: 14 },
  ]},
  { code: 'CRO', players: [
    { name: 'Dominik Livaković', position: 'GK', shirtNumber: 1 },
    { name: 'Joško Gvardiol', position: 'DEF', shirtNumber: 24 },
    { name: 'Dejan Lovren', position: 'DEF', shirtNumber: 6 },
    { name: 'Luka Modrić', position: 'MID', shirtNumber: 10 },
    { name: 'Marcelo Brozović', position: 'MID', shirtNumber: 11 },
    { name: 'Andrej Kramarić', position: 'FWD', shirtNumber: 9 },
    { name: 'Ivan Perišić', position: 'FWD', shirtNumber: 4 },
  ]},
  { code: 'DEN', players: [
    { name: 'Kasper Schmeichel', position: 'GK', shirtNumber: 1 },
    { name: 'Simon Kjær', position: 'DEF', shirtNumber: 4 },
    { name: 'Joachim Andersen', position: 'DEF', shirtNumber: 6 },
    { name: 'Christian Eriksen', position: 'MID', shirtNumber: 10 },
    { name: 'Pierre-Emile Højbjerg', position: 'MID', shirtNumber: 23 },
    { name: 'Rasmus Højlund', position: 'FWD', shirtNumber: 11 },
    { name: 'Andreas Cornelius', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'SUI', players: [
    { name: 'Yann Sommer', position: 'GK', shirtNumber: 1 },
    { name: 'Manuel Akanji', position: 'DEF', shirtNumber: 5 },
    { name: 'Ricardo Rodríguez', position: 'DEF', shirtNumber: 13 },
    { name: 'Granit Xhaka', position: 'MID', shirtNumber: 10 },
    { name: 'Remo Freuler', position: 'MID', shirtNumber: 8 },
    { name: 'Breel Embolo', position: 'FWD', shirtNumber: 7 },
    { name: 'Noah Okafor', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'POL', players: [
    { name: 'Wojciech Szczęsny', position: 'GK', shirtNumber: 1 },
    { name: 'Jan Bednarek', position: 'DEF', shirtNumber: 5 },
    { name: 'Bartosz Bereszyński', position: 'DEF', shirtNumber: 2 },
    { name: 'Piotr Zieliński', position: 'MID', shirtNumber: 14 },
    { name: 'Mateusz Klich', position: 'MID', shirtNumber: 16 },
    { name: 'Robert Lewandowski', position: 'FWD', shirtNumber: 9 },
    { name: 'Arkadiusz Milik', position: 'FWD', shirtNumber: 23 },
  ]},
  { code: 'SRB', players: [
    { name: 'Vanja Milinković-Savić', position: 'GK', shirtNumber: 1 },
    { name: 'Nikola Milenkovic', position: 'DEF', shirtNumber: 4 },
    { name: 'Strahinja Pavlović', position: 'DEF', shirtNumber: 6 },
    { name: 'Sergej Milinković-Savić', position: 'MID', shirtNumber: 11 },
    { name: 'Filip Kostić', position: 'MID', shirtNumber: 13 },
    { name: 'Aleksandar Mitrović', position: 'FWD', shirtNumber: 9 },
    { name: 'Luka Jović', position: 'FWD', shirtNumber: 18 },
  ]},
  { code: 'AUT', players: [
    { name: 'Patrick Pentz', position: 'GK', shirtNumber: 1 },
    { name: 'David Alaba', position: 'DEF', shirtNumber: 8 },
    { name: 'Philipp Lienhart', position: 'DEF', shirtNumber: 14 },
    { name: 'Marcel Sabitzer', position: 'MID', shirtNumber: 7 },
    { name: 'Konrad Laimer', position: 'MID', shirtNumber: 22 },
    { name: 'Marko Arnautović', position: 'FWD', shirtNumber: 9 },
    { name: 'Michael Gregoritsch', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'TUR', players: [
    { name: 'Mert Günok', position: 'GK', shirtNumber: 1 },
    { name: 'Samet Akaydin', position: 'DEF', shirtNumber: 5 },
    { name: 'Ferdi Kadıoğlu', position: 'DEF', shirtNumber: 13 },
    { name: 'Hakan Çalhanoğlu', position: 'MID', shirtNumber: 10 },
    { name: 'Arda Güler', position: 'MID', shirtNumber: 17 },
    { name: 'Kerem Aktürkoğlu', position: 'FWD', shirtNumber: 11 },
    { name: 'Baris Yilmaz', position: 'FWD', shirtNumber: 9 },
  ]},
  // CONMEBOL
  { code: 'URU', players: [
    { name: 'Sergio Rochet', position: 'GK', shirtNumber: 1 },
    { name: 'Diego Godín', position: 'DEF', shirtNumber: 3 },
    { name: 'Ronald Araújo', position: 'DEF', shirtNumber: 4 },
    { name: 'Federico Valverde', position: 'MID', shirtNumber: 14 },
    { name: 'Rodrigo Bentancur', position: 'MID', shirtNumber: 17 },
    { name: 'Darwin Núñez', position: 'FWD', shirtNumber: 11 },
    { name: 'Facundo Torres', position: 'FWD', shirtNumber: 22 },
  ]},
  { code: 'COL', players: [
    { name: 'Camilo Vargas', position: 'GK', shirtNumber: 1 },
    { name: 'Dávinson Sánchez', position: 'DEF', shirtNumber: 2 },
    { name: 'Jhon Lucumí', position: 'DEF', shirtNumber: 3 },
    { name: 'James Rodríguez', position: 'MID', shirtNumber: 10 },
    { name: 'Richard Ríos', position: 'MID', shirtNumber: 8 },
    { name: 'Luis Díaz', position: 'FWD', shirtNumber: 7 },
    { name: 'Jhon Duran', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'ECU', players: [
    { name: 'Hernán Galíndez', position: 'GK', shirtNumber: 1 },
    { name: 'Piero Hincapié', position: 'DEF', shirtNumber: 3 },
    { name: 'Angelo Preciado', position: 'DEF', shirtNumber: 2 },
    { name: 'Moisés Caicedo', position: 'MID', shirtNumber: 10 },
    { name: 'Carlos Gruezo', position: 'MID', shirtNumber: 8 },
    { name: 'Enner Valencia', position: 'FWD', shirtNumber: 13 },
    { name: 'Gonzalo Plata', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'PAR', players: [
    { name: 'Antony Silva', position: 'GK', shirtNumber: 1 },
    { name: 'Gustavo Gómez', position: 'DEF', shirtNumber: 3 },
    { name: 'Fabián Balbuena', position: 'DEF', shirtNumber: 4 },
    { name: 'Miguel Almirón', position: 'MID', shirtNumber: 10 },
    { name: 'Mathías Villasanti', position: 'MID', shirtNumber: 14 },
    { name: 'Antonio Sanabria', position: 'FWD', shirtNumber: 9 },
    { name: 'Romero', position: 'FWD', shirtNumber: 11 },
  ]},
  // CONCACAF
  { code: 'USA', players: [
    { name: 'Matt Turner', position: 'GK', shirtNumber: 1 },
    { name: 'Miles Robinson', position: 'DEF', shirtNumber: 12 },
    { name: 'Antonee Robinson', position: 'DEF', shirtNumber: 5 },
    { name: 'Tyler Adams', position: 'MID', shirtNumber: 4 },
    { name: 'Weston McKennie', position: 'MID', shirtNumber: 8 },
    { name: 'Christian Pulisic', position: 'FWD', shirtNumber: 10 },
    { name: 'Folarin Balogun', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'MEX', players: [
    { name: 'Guillermo Ochoa', position: 'GK', shirtNumber: 13 },
    { name: 'César Montes', position: 'DEF', shirtNumber: 3 },
    { name: 'Jesús Gallardo', position: 'DEF', shirtNumber: 23 },
    { name: 'Edson Álvarez', position: 'MID', shirtNumber: 18 },
    { name: 'Héctor Herrera', position: 'MID', shirtNumber: 16 },
    { name: 'Hirving Lozano', position: 'FWD', shirtNumber: 22 },
    { name: 'Raúl Jiménez', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'CAN', players: [
    { name: 'Maxime Crépeau', position: 'GK', shirtNumber: 1 },
    { name: 'Kamal Miller', position: 'DEF', shirtNumber: 3 },
    { name: 'Alistair Johnston', position: 'DEF', shirtNumber: 2 },
    { name: 'Alphonso Davies', position: 'MID', shirtNumber: 19 },
    { name: 'Jonathan David', position: 'FWD', shirtNumber: 9 },
    { name: 'Cyle Larin', position: 'FWD', shirtNumber: 17 },
    { name: 'Tajon Buchanan', position: 'MID', shirtNumber: 11 },
  ]},
  { code: 'CRC', players: [
    { name: 'Keylor Navas', position: 'GK', shirtNumber: 1 },
    { name: 'Oscar Duarte', position: 'DEF', shirtNumber: 3 },
    { name: 'Ronald Matarrita', position: 'DEF', shirtNumber: 17 },
    { name: 'Celso Borges', position: 'MID', shirtNumber: 5 },
    { name: 'Bryan Ruiz', position: 'MID', shirtNumber: 10 },
    { name: 'Joel Campbell', position: 'FWD', shirtNumber: 12 },
    { name: 'Johan Venegas', position: 'FWD', shirtNumber: 7 },
  ]},
  { code: 'JAM', players: [
    { name: 'Andre Blake', position: 'GK', shirtNumber: 1 },
    { name: 'Damion Lowe', position: 'DEF', shirtNumber: 4 },
    { name: 'Adrian Mariappa', position: 'DEF', shirtNumber: 6 },
    { name: 'Bobby Decordova-Reid', position: 'MID', shirtNumber: 7 },
    { name: 'Ravel Morrison', position: 'MID', shirtNumber: 10 },
    { name: 'Michail Antonio', position: 'FWD', shirtNumber: 9 },
    { name: 'Leon Bailey', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'PAN', players: [
    { name: 'Luis Mejía', position: 'GK', shirtNumber: 1 },
    { name: 'Fidel Escobar', position: 'DEF', shirtNumber: 4 },
    { name: 'Harold Cummings', position: 'DEF', shirtNumber: 6 },
    { name: 'Adalberto Carrasquilla', position: 'MID', shirtNumber: 10 },
    { name: 'Aníbal Godoy', position: 'MID', shirtNumber: 15 },
    { name: 'Ismael Díaz', position: 'FWD', shirtNumber: 7 },
    { name: 'Cecilio Waterman', position: 'FWD', shirtNumber: 9 },
  ]},
  // AFC
  { code: 'JPN', players: [
    { name: 'Shuichi Gonda', position: 'GK', shirtNumber: 1 },
    { name: 'Takehiro Tomiyasu', position: 'DEF', shirtNumber: 5 },
    { name: 'Ko Itakura', position: 'DEF', shirtNumber: 22 },
    { name: 'Wataru Endo', position: 'MID', shirtNumber: 10 },
    { name: 'Daichi Kamada', position: 'MID', shirtNumber: 9 },
    { name: 'Ritsu Doan', position: 'FWD', shirtNumber: 8 },
    { name: 'Takumi Minamino', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'IRN', players: [
    { name: 'Alireza Beiranvand', position: 'GK', shirtNumber: 1 },
    { name: 'Ehsan Hajsafi', position: 'DEF', shirtNumber: 3 },
    { name: 'Milad Mohammadi', position: 'DEF', shirtNumber: 6 },
    { name: 'Alireza Jahanbakhsh', position: 'MID', shirtNumber: 11 },
    { name: 'Saeid Ezatolahi', position: 'MID', shirtNumber: 8 },
    { name: 'Sardar Azmoun', position: 'FWD', shirtNumber: 9 },
    { name: 'Mehdi Taremi', position: 'FWD', shirtNumber: 20 },
  ]},
  { code: 'KOR', players: [
    { name: 'Kim Seung-gyu', position: 'GK', shirtNumber: 1 },
    { name: 'Kim Min-jae', position: 'DEF', shirtNumber: 3 },
    { name: 'Lee Yong', position: 'DEF', shirtNumber: 2 },
    { name: 'Lee Jae-sung', position: 'MID', shirtNumber: 7 },
    { name: 'Jung Woo-young', position: 'MID', shirtNumber: 16 },
    { name: 'Son Heung-min', position: 'FWD', shirtNumber: 7 },
    { name: 'Hwang Hee-chan', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'AUS', players: [
    { name: 'Mat Ryan', position: 'GK', shirtNumber: 1 },
    { name: 'Harry Souttar', position: 'DEF', shirtNumber: 3 },
    { name: 'Milos Degenek', position: 'DEF', shirtNumber: 5 },
    { name: 'Aaron Mooy', position: 'MID', shirtNumber: 13 },
    { name: 'Riley McGree', position: 'MID', shirtNumber: 8 },
    { name: 'Mitchell Duke', position: 'FWD', shirtNumber: 9 },
    { name: 'Mathew Leckie', position: 'FWD', shirtNumber: 7 },
  ]},
  { code: 'KSA', players: [
    { name: 'Mohammed Al-Owais', position: 'GK', shirtNumber: 1 },
    { name: 'Ali Al-Bulayhi', position: 'DEF', shirtNumber: 13 },
    { name: 'Yasser Al-Shahrani', position: 'DEF', shirtNumber: 3 },
    { name: 'Saleh Al-Shehri', position: 'MID', shirtNumber: 10 },
    { name: 'Salem Al-Dawsari', position: 'MID', shirtNumber: 11 },
    { name: 'Firas Al-Buraikan', position: 'FWD', shirtNumber: 9 },
    { name: 'Hattan Bahebri', position: 'FWD', shirtNumber: 7 },
  ]},
  { code: 'QAT', players: [
    { name: 'Meshaal Barsham', position: 'GK', shirtNumber: 1 },
    { name: 'Pedro Miguel', position: 'DEF', shirtNumber: 3 },
    { name: 'Abdelkarim Hassan', position: 'DEF', shirtNumber: 6 },
    { name: 'Karim Boudiaf', position: 'MID', shirtNumber: 10 },
    { name: 'Hassan Al-Haydos', position: 'MID', shirtNumber: 11 },
    { name: 'Almoez Ali', position: 'FWD', shirtNumber: 19 },
    { name: 'Akram Afif', position: 'FWD', shirtNumber: 7 },
  ]},
  // CAF
  { code: 'MAR', players: [
    { name: 'Yassine Bounou', position: 'GK', shirtNumber: 1 },
    { name: 'Nayef Aguerd', position: 'DEF', shirtNumber: 5 },
    { name: 'Achraf Hakimi', position: 'DEF', shirtNumber: 2 },
    { name: 'Azzedine Ounahi', position: 'MID', shirtNumber: 8 },
    { name: 'Selim Amallah', position: 'MID', shirtNumber: 7 },
    { name: 'Youssef En-Nesyri', position: 'FWD', shirtNumber: 19 },
    { name: 'Sofiane Boufal', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'SEN', players: [
    { name: 'Edouard Mendy', position: 'GK', shirtNumber: 1 },
    { name: 'Kalidou Koulibaly', position: 'DEF', shirtNumber: 3 },
    { name: 'Youssouf Sabaly', position: 'DEF', shirtNumber: 2 },
    { name: 'Nampalys Mendy', position: 'MID', shirtNumber: 17 },
    { name: 'Idrissa Gueye', position: 'MID', shirtNumber: 6 },
    { name: 'Sadio Mané', position: 'FWD', shirtNumber: 10 },
    { name: 'Ismaila Sarr', position: 'FWD', shirtNumber: 23 },
  ]},
  { code: 'CMR', players: [
    { name: 'André Onana', position: 'GK', shirtNumber: 1 },
    { name: 'Michael Ngadeu', position: 'DEF', shirtNumber: 5 },
    { name: 'Collins Fai', position: 'DEF', shirtNumber: 2 },
    { name: 'André-Frank Zambo Anguissa', position: 'MID', shirtNumber: 8 },
    { name: 'Jean-Charles Castelletto', position: 'MID', shirtNumber: 6 },
    { name: 'Karl Toko Ekambi', position: 'FWD', shirtNumber: 9 },
    { name: 'Bryan Mbeumo', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'GHA', players: [
    { name: 'Lawrence Ati-Zigi', position: 'GK', shirtNumber: 1 },
    { name: 'Daniel Amartey', position: 'DEF', shirtNumber: 5 },
    { name: 'Tariq Lamptey', position: 'DEF', shirtNumber: 2 },
    { name: 'Thomas Partey', position: 'MID', shirtNumber: 5 },
    { name: 'Mohammed Kudus', position: 'MID', shirtNumber: 11 },
    { name: 'Jordan Ayew', position: 'FWD', shirtNumber: 9 },
    { name: 'Antoine Semenyo', position: 'FWD', shirtNumber: 17 },
  ]},
  { code: 'EGY', players: [
    { name: 'Mohamed El-Shenawy', position: 'GK', shirtNumber: 1 },
    { name: 'Ahmed Hegazy', position: 'DEF', shirtNumber: 5 },
    { name: 'Omar Kamal', position: 'DEF', shirtNumber: 3 },
    { name: 'Tarek Hamed', position: 'MID', shirtNumber: 8 },
    { name: 'Amr El Sulaya', position: 'MID', shirtNumber: 16 },
    { name: 'Mohamed Salah', position: 'FWD', shirtNumber: 10 },
    { name: 'Mostafa Mohamed', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'NGA', players: [
    { name: 'Francis Uzoho', position: 'GK', shirtNumber: 1 },
    { name: 'William Troost-Ekong', position: 'DEF', shirtNumber: 5 },
    { name: 'Zaidu Sanusi', position: 'DEF', shirtNumber: 3 },
    { name: 'Wilfred Ndidi', position: 'MID', shirtNumber: 4 },
    { name: 'Alex Iwobi', position: 'MID', shirtNumber: 17 },
    { name: 'Victor Osimhen', position: 'FWD', shirtNumber: 9 },
    { name: 'Samuel Chukwueze', position: 'FWD', shirtNumber: 7 },
  ]},
  { code: 'ALG', players: [
    { name: "Raïs M'Bolhi", position: 'GK', shirtNumber: 1 },
    { name: 'Djamel Benlamri', position: 'DEF', shirtNumber: 3 },
    { name: 'Ramy Bensebaini', position: 'DEF', shirtNumber: 6 },
    { name: 'Ismaël Bennacer', position: 'MID', shirtNumber: 8 },
    { name: 'Youcef Atal', position: 'MID', shirtNumber: 7 },
    { name: 'Riyad Mahrez', position: 'FWD', shirtNumber: 10 },
    { name: 'Andy Delort', position: 'FWD', shirtNumber: 9 },
  ]},
  { code: 'TUN', players: [
    { name: 'Aymen Dahmen', position: 'GK', shirtNumber: 1 },
    { name: 'Montassar Talbi', position: 'DEF', shirtNumber: 5 },
    { name: 'Dylan Bronn', position: 'DEF', shirtNumber: 6 },
    { name: 'Ellyes Skhiri', position: 'MID', shirtNumber: 8 },
    { name: 'Anis Slimane', position: 'MID', shirtNumber: 10 },
    { name: 'Wahbi Khazri', position: 'FWD', shirtNumber: 9 },
    { name: 'Sayfallah Ltaief', position: 'FWD', shirtNumber: 11 },
  ]},
  { code: 'CIV', players: [
    { name: 'Yahia Fofana', position: 'GK', shirtNumber: 1 },
    { name: 'Simon Deli', position: 'DEF', shirtNumber: 5 },
    { name: 'Willy Boly', position: 'DEF', shirtNumber: 3 },
    { name: 'Franck Kessié', position: 'MID', shirtNumber: 4 },
    { name: 'Ibrahim Sangaré', position: 'MID', shirtNumber: 14 },
    { name: 'Nicolas Pépé', position: 'FWD', shirtNumber: 19 },
    { name: 'Sébastien Haller', position: 'FWD', shirtNumber: 9 },
  ]},
  // OFC
  { code: 'NZL', players: [
    { name: 'Oliver Sail', position: 'GK', shirtNumber: 1 },
    { name: 'Winston Reid', position: 'DEF', shirtNumber: 5 },
    { name: 'Michael Boxall', position: 'DEF', shirtNumber: 3 },
    { name: 'Ryan Thomas', position: 'MID', shirtNumber: 8 },
    { name: 'Liberato Cacace', position: 'MID', shirtNumber: 14 },
    { name: 'Chris Wood', position: 'FWD', shirtNumber: 9 },
    { name: 'Myer Bevan', position: 'FWD', shirtNumber: 11 },
  ]},
];

async function seedPlayers(): Promise<void> {
  // Check if players already exist
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .get();
  if (existingCount && existingCount.count > 0) {
    console.log('Players already seeded, skipping.');
    return;
  }

  // Build code → id map from all teams in DB
  const allTeams = await db.select().from(teams);
  const teamByCode = new Map(allTeams.map((t) => [t.code, t]));

  let totalInserted = 0;
  for (const { code, players: teamPlayers } of PLAYERS_BY_TEAM) {
    const team = teamByCode.get(code);
    if (!team) {
      console.warn(`Team with code '${code}' not found in DB, skipping ${teamPlayers.length} players.`);
      continue;
    }
    await db
      .insert(players)
      .values(teamPlayers.map((p) => ({ teamId: team.id, ...p })))
      .onConflictDoNothing();
    totalInserted += teamPlayers.length;
  }

  console.log(`✅ Players seeded: ${totalInserted} players inserted.`);
}

// Point policy: bonuses are intentionally smaller than what a pure-prediction
// run can score (104 finished matches × 5 pts = 520 pts max). Sum of every
// logro is ~230 pts — meaningful but does not overpower actual prediction
// skill on the leaderboard.
const ACHIEVEMENTS_DATA = [
  { slug: 'first_prediction', name: 'Primer Pronóstico', description: 'Guardaste tu primer pronóstico', icon: '🎯', pointsBonus: 2 },
  { slug: 'first_league', name: 'Primera Liga', description: 'Te uniste a tu primera liga', icon: '🏟️', pointsBonus: 2 },
  { slug: 'league_founder', name: 'Fundador', description: 'Creaste una liga', icon: '👑', pointsBonus: 3 },
  { slug: 'invite_5', name: 'El Organizador', description: 'Tu liga tiene 5 o más miembros', icon: '🎉', pointsBonus: 5 },
  { slug: 'exact_score', name: 'Ojo de Halcón', description: 'Acertaste el resultado exacto', icon: '🔥', pointsBonus: 3 },
  { slug: 'triple_exact', name: 'Hat-trick Profético', description: 'Tres resultados exactos en una fecha', icon: '🎩', pointsBonus: 15 },
  { slug: 'hot_streak_3', name: 'Racha Caliente', description: 'Acertaste 3 ganadores seguidos', icon: '🌶️', pointsBonus: 5 },
  { slug: 'hot_streak_5', name: 'En Llamas', description: 'Acertaste 5 ganadores seguidos', icon: '🔥', pointsBonus: 8 },
  { slug: 'prophet', name: 'Profeta', description: 'Acertaste el campeón del Mundial', icon: '🏆', pointsBonus: 30 },
  { slug: 'top_scorer_prophet', name: 'Ojeador', description: 'Acertaste el goleador del torneo', icon: '⚽', pointsBonus: 25 },
  { slug: 'early_bird', name: 'Madrugador', description: 'Completaste todos los pronósticos de grupos antes del partido inaugural', icon: '🌅', pointsBonus: 6 },
  { slug: 'social_butterfly', name: 'Social', description: 'Participás en 3 o más ligas', icon: '🦋', pointsBonus: 3 },
  { slug: 'comeback_king', name: 'Remontada', description: 'Pasaste de último a top 3 en una liga', icon: '📈', pointsBonus: 10 },
  { slug: 'perfect_group', name: 'Grupo Perfecto', description: 'Acertaste todos los resultados (ganador) de un grupo', icon: '✨', pointsBonus: 12 },
  { slug: 'upset_hunter', name: 'Cazador de Sorpresas', description: 'Acertaste 3 sorpresas (favorito perdió)', icon: '🐉', pointsBonus: 6 },
  { slug: 'loyal', name: 'Fiel Seguidor', description: 'Ingresaste a la app 7 días durante el torneo', icon: '💎', pointsBonus: 3 },
  { slug: 'share_master', name: 'Influencer', description: 'Compartiste 5 pronósticos como imagen', icon: '📸', pointsBonus: 3 },
  { slug: 'fantasy_legend', name: 'Leyenda del Fantasy', description: 'Fuiste el mejor en fantasy de tu liga', icon: '🌟', pointsBonus: 15 },
  { slug: 'perfect_knockout', name: 'Adivino de Octavos', description: 'Acertaste todos los resultados de octavos de final', icon: '🎰', pointsBonus: 20 },
  { slug: 'underdog', name: 'El Underdog', description: 'Ganaste la liga sin haber estado en top 3 antes de cuartos', icon: '🐺', pointsBonus: 25 },
  // Small fun logros — short feedback loops to keep users engaged.
  { slug: 'predictor_10', name: 'Tomando Confianza', description: 'Pronosticaste 10 partidos', icon: '🪙', pointsBonus: 1 },
  { slug: 'predictor_30', name: 'Quinielero Serio', description: 'Pronosticaste 30 partidos', icon: '📝', pointsBonus: 3 },
  { slug: 'group_completionist', name: 'No Te Falta Ninguno', description: 'Pronosticaste los 72 partidos de fase de grupos', icon: '🧩', pointsBonus: 5 },
  { slug: 'group_sampler', name: 'Recorrido Mundial', description: 'Pronosticaste al menos un partido de cada grupo', icon: '🌍', pointsBonus: 3 },
  { slug: 'night_owl', name: 'Hora Bruja', description: 'Guardaste un pronóstico entre las 0 y las 5 de la mañana', icon: '🌙', pointsBonus: 2 },
  // In-tournament chiquitos — fire only after matches start being scored.
  { slug: 'bullseye_zero', name: 'Cero a Cero', description: 'Acertaste el resultado exacto en un 0-0', icon: '🎯', pointsBonus: 4 },
  { slug: 'goalfest', name: 'Festival de Goles', description: 'Acertaste un partido con 4 o más goles totales', icon: '🎆', pointsBonus: 5 },
  { slug: 'survivor', name: 'Sobreviviente', description: 'Sumaste puntos después de 3 pronósticos fallados al hilo', icon: '🩹', pointsBonus: 2 },
  { slug: 'weekend_perfect', name: 'Día Mágico', description: 'Sumaste puntos en todos los partidos de un mismo día', icon: '🌞', pointsBonus: 6 },
  { slug: 'marathon', name: 'Maratonista', description: 'Sumaste puntos en partidos de 5 días distintos', icon: '🏃', pointsBonus: 3 },
];

async function seedAchievements(): Promise<void> {
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(achievements)
    .get();
  if (existingCount && existingCount.count > 0) {
    console.log('Achievements already seeded, skipping.');
    return;
  }

  await db.insert(achievements).values(ACHIEVEMENTS_DATA).onConflictDoNothing();
  console.log(`✅ Achievements seeded: ${ACHIEVEMENTS_DATA.length} achievements inserted.`);
}

/**
 * Knockout stage venue rotation for the 32 elimination matches.
 * Venues indices into WC2026_VENUES (same array used above).
 * Distribution follows FIFA's stated intent:
 *  - R32 (matches 73-88): spread across all 16 venues
 *  - R16 (matches 89-96): premium US venues + Canada/Mexico marquee
 *  - QF  (matches 97-100): top 4 US venues
 *  - SF  (matches 101-102): MetLife + SoFi
 *  - Third (match 103): Hard Rock Stadium Miami
 *  - Final (match 104): MetLife Stadium
 */
const KNOCKOUT_VENUE_IDX: Record<number, number> = {
  // R32 — all 16 venues
  73: 3,  74: 4,  75: 5,  76: 7,
  77: 0,  78: 1,  79: 2,  80: 6,
  81: 8,  82: 9,  83: 10, 84: 11,
  85: 12, 86: 13, 87: 14, 88: 15,
  // R16
  89: 3,  90: 4,  91: 5,  92: 7,
  93: 0,  94: 6,  95: 13, 96: 8,
  // QF
  97: 3,  98: 4,  99: 5,  100: 13,
  // SF
  101: 3, 102: 4,
  // Third place / Final
  103: 7, 104: 3,
};

type KnockoutRound = 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';

type KnockoutSpec = {
  round: KnockoutRound;
  count: number;
  /** ISO date string for the first match of this round */
  startDate: string;
  /** Hours between consecutive matches in this round */
  hoursStep: number;
};

/**
 * R32 starts ~July 4 2026, Final ~July 19 2026.
 * Dates are approximate placeholders consistent with FIFA's compressed 2026 schedule.
 */
const KNOCKOUT_ROUNDS: KnockoutSpec[] = [
  { round: 'r32',   count: 16, startDate: '2026-07-04T18:00:00Z', hoursStep: 12 },
  { round: 'r16',   count:  8, startDate: '2026-07-10T18:00:00Z', hoursStep: 12 },
  { round: 'qf',    count:  4, startDate: '2026-07-14T18:00:00Z', hoursStep: 24 },
  { round: 'sf',    count:  2, startDate: '2026-07-17T18:00:00Z', hoursStep: 24 },
  { round: 'third', count:  1, startDate: '2026-07-19T15:00:00Z', hoursStep: 0  },
  { round: 'final', count:  1, startDate: '2026-07-19T20:00:00Z', hoursStep: 0  },
];

/**
 * Seeds 32 placeholder knockout matches (matchNumbers 73-104).
 * Idempotent: skips if any match with matchNumber > 72 already exists.
 * homeTeamId / awayTeamId use the first team in the DB as a placeholder
 * (will be updated via admin panel once group stage results are known).
 */
async function seedKnockoutStage(): Promise<void> {
  // Check for existing knockout matches
  const existingKnockout = await db
    .select({ count: sql<number>`count(*)` })
    .from(matches)
    .where(sql`${matches.matchNumber} > 72`)
    .get();

  if (existingKnockout && existingKnockout.count > 0) {
    console.log('Knockout matches already seeded, skipping.');
    return;
  }

  // Get a placeholder team id (first team in DB)
  const placeholderTeam = await db.select({ id: teams.id }).from(teams).limit(1).get();
  if (!placeholderTeam) {
    console.warn('No teams found in DB — cannot seed knockout matches.');
    return;
  }
  const placeholderId = placeholderTeam.id;

  let matchNumber = 73;
  let inserted = 0;

  for (const spec of KNOCKOUT_ROUNDS) {
    const roundStart = new Date(spec.startDate);
    for (let i = 0; i < spec.count; i++) {
      const kickoff = new Date(roundStart.getTime() + i * spec.hoursStep * 60 * 60 * 1000);
      const kickoffUtc = kickoff.toISOString();
      const venueData = WC2026_VENUES[KNOCKOUT_VENUE_IDX[matchNumber] ?? 3];

      await db
        .insert(matches)
        .values({
          matchNumber,
          homeTeamId: placeholderId,
          awayTeamId: placeholderId,
          kickoffUtc,
          predictionLockUtc: calcPredictionLock(kickoffUtc),
          venue: venueData.venue,
          city: venueData.city,
          group: null,
          round: spec.round,
          status: 'scheduled',
        })
        .onConflictDoNothing();

      matchNumber++;
      inserted++;
    }
  }

  console.log(`✅ Knockout stage seeded: ${inserted} matches inserted (matches 73–104).`);
}

async function seed(): Promise<void> {
  console.log('🏆 Seeding Mundialito DB...');
  await initDb();

  // Check if teams already seeded.
  const existingTeams = await db.select().from(teams).limit(1);
  if (existingTeams.length > 0) {
    console.log('Teams already seeded, skipping team insert.');
  } else {
    // 1. Insertar teams
    console.log(`Inserting ${TEAMS_DATA.length} teams...`);
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const teamsWithGroup = TEAMS_DATA.map((t, i) => ({
      ...t,
      group: groups[Math.floor(i / 4)] ?? null,
    }));
    await db.insert(teams).values(teamsWithGroup).onConflictDoNothing();
    console.log('✅ Teams inserted.');
  }

  // Check if matches already seeded.
  const existingMatches = await db.select().from(matches).limit(1);
  if (existingMatches.length > 0) {
    console.log('Matches already seeded, skipping match insert.');
    await seedPlayers();
    await seedAchievements();
    await seedKnockoutStage();
    process.exit(0);
  }

  // Build map from all teams in DB.
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

  // 3. Seed players
  await seedPlayers();

  // 4. Seed achievements
  await seedAchievements();

  // 5. Seed knockout stage placeholder matches
  await seedKnockoutStage();

  console.log('✅ Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
