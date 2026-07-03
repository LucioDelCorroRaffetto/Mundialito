const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Fecha (YYYY-MM-DD) del día AR (UTC-3, sin DST) en que cae un kickoff UTC. */
export function arDateOf(kickoffUtc: string): string {
  return new Date(new Date(kickoffUtc).getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

export interface StandingsHistoryRow {
  userId: number;
  points: number;
  kickoffUtc: string;
}

export interface StandingsHistoryMember {
  userId: number;
  username: string;
  avatarUrl: string | null;
}

export interface StandingsHistorySeries {
  userId: number;
  username: string;
  avatarUrl: string | null;
  cumulativePoints: number[];
}

/**
 * Agrupa filas de predictions (ya resueltas) por día AR del kickoff y arma
 * una serie de puntos acumulados por día para cada miembro de la liga.
 * Miembros sin pronósticos entran con ceros en todos los días.
 */
export function buildStandingsHistory(
  members: StandingsHistoryMember[],
  rows: StandingsHistoryRow[],
): { days: string[]; series: StandingsHistorySeries[] } {
  const days = [...new Set(rows.map((r) => arDateOf(r.kickoffUtc)))].sort();

  const pointsByUserAndDay = new Map<number, Map<string, number>>();
  for (const row of rows) {
    const day = arDateOf(row.kickoffUtc);
    const byDay = pointsByUserAndDay.get(row.userId) ?? new Map<string, number>();
    byDay.set(day, (byDay.get(day) ?? 0) + row.points);
    pointsByUserAndDay.set(row.userId, byDay);
  }

  const series = members.map((m) => {
    const byDay = pointsByUserAndDay.get(m.userId);
    let running = 0;
    const cumulativePoints = days.map((day) => {
      running += byDay?.get(day) ?? 0;
      return running;
    });
    return { userId: m.userId, username: m.username, avatarUrl: m.avatarUrl, cumulativePoints };
  });

  return { days, series };
}
