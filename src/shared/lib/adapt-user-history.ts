import type { PredictionHistoryEntry } from '@/shared/hooks/use-predictions';
import type { UserPredictionHistoryItem } from '@/shared/hooks/use-user-profile';

/**
 * Adapta el historial de OTRO usuario (shape de `UserPredictionHistoryItem`)
 * al shape que espera `HistoryRow` (`PredictionHistoryEntry`), para poder
 * reusar la misma fila visual que el historial propio. Antes cada perfil
 * tenía su propia fila (`HistoryRow` vs `UserPredictionHistoryRow`) con
 * layouts distintos, y la fila ajena nunca mostraba el estado "en vivo".
 */
export function toHistoryEntry(item: UserPredictionHistoryItem): PredictionHistoryEntry {
  return {
    predictionId: item.predictionId,
    matchId: item.matchId,
    matchNumber: 0,
    kickoffUtc: item.kickoffUtc,
    status: item.matchStatus as PredictionHistoryEntry['status'],
    round: item.round,
    group: null,
    actualHomeScore: item.result?.homeScore ?? null,
    actualAwayScore: item.result?.awayScore ?? null,
    predictedHomeScore: item.prediction.homeScore,
    predictedAwayScore: item.prediction.awayScore,
    points: item.points,
    homeTeamId: null,
    homeTeamName: item.homeTeam.name,
    homeTeamCode: item.homeTeam.code,
    homeTeamFlag: item.homeTeam.flag,
    awayTeamId: null,
    awayTeamName: item.awayTeam.name,
    awayTeamCode: item.awayTeam.code,
    awayTeamFlag: item.awayTeam.flag,
  };
}
