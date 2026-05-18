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
import { teams, matches, players } from '../db/schema/index.js';
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

async function seed(): Promise<void> {
  console.log('🏆 Seeding Mundialito DB...');
  await initDb();

  // Check if already seeded.
  const existingTeams = await db.select().from(teams).limit(1);
  if (existingTeams.length > 0) {
    console.log('Teams already seeded, skipping teams & matches.');
    await seedPlayers();
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

  // 3. Seed players
  await seedPlayers();

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
