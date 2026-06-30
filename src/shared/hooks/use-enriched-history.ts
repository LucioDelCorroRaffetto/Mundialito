import { useCallback, useMemo } from 'react';
import {
  useMyPredictionHistory,
  type PredictionHistoryEntry,
} from '@/shared/hooks/use-predictions';
import {
  useUserPredictionHistory,
  type UserPredictionHistoryItem,
} from '@/shared/hooks/use-user-profile';
import { useMatches } from '@/shared/hooks/use-matches';
import { useTeamMap } from '@/shared/hooks/use-teams';
import { useBracketProjection } from '@/shared/hooks/use-bracket-projection';
import { resolveAdvancingSlot, type SlotContext } from '@/shared/lib/bracket-projection';
import type { Team } from '@/shared/types/api';

/** Códigos que indican un slot todavía sin equipo real asignado. */
function isPlaceholderCode(code: string | null | undefined): boolean {
  return code == null || code === 'TBD' || code === '???' || code === '?';
}

/**
 * Resolutor de equipos para el historial: en los cruces de eliminación la DB
 * guarda el placeholder TBD en home/awayTeamId, así que las filas del historial
 * llegan con "TBD". Acá resolvemos la identidad real con la MISMA proyección del
 * cuadro que usa el resto de la app (grupos en R32 + ganador del cruce hijo en
 * rondas siguientes), derivada de matches+teams cacheados (sin red extra).
 *
 * Expone `resolveTeam(matchNumber, side)` y un mapa matchId→matchNumber, porque
 * el historial ajeno trae sólo matchId (sin matchNumber).
 */
function useHistorySlotResolver() {
  const projection = useBracketProjection();
  const { data: allMatches } = useMatches({ limit: 200 });
  const { data: teamMap } = useTeamMap();

  const matchByNum = useMemo(
    () => new Map((allMatches?.data ?? []).map((m) => [m.matchNumber, m])),
    [allMatches],
  );
  const matchNumberById = useMemo(
    () => new Map((allMatches?.data ?? []).map((m) => [m.id, m.matchNumber])),
    [allMatches],
  );
  const slotCtx: SlotContext = useMemo(
    () => ({ matchByNum, teamMap, projection }),
    [matchByNum, teamMap, projection],
  );

  const resolveTeam = useCallback(
    (matchNumber: number | undefined, side: 'home' | 'away'): Team | null => {
      if (matchNumber == null) return null;
      return resolveAdvancingSlot(matchNumber, side, slotCtx);
    },
    [slotCtx],
  );

  return { resolveTeam, matchNumberById };
}

/**
 * Historial PROPIO enriquecido. Reemplazo directo de useMyPredictionHistory:
 * misma forma de retorno, pero con los equipos de los cruces de eliminación
 * resueltos (banderas y nombres reales en vez de "TBD").
 */
export function useEnrichedPredictionHistory() {
  const query = useMyPredictionHistory();
  const { resolveTeam } = useHistorySlotResolver();

  const data = useMemo(() => {
    if (!query.data) return query.data;
    const rows = query.data.data.map((entry): PredictionHistoryEntry => {
      const homeMissing = isPlaceholderCode(entry.homeTeamCode);
      const awayMissing = isPlaceholderCode(entry.awayTeamCode);
      if (!homeMissing && !awayMissing) return entry;

      const next = { ...entry };
      if (homeMissing) {
        const t = resolveTeam(entry.matchNumber, 'home');
        if (t) {
          next.homeTeamId = t.id;
          next.homeTeamName = t.name;
          next.homeTeamCode = t.code;
          next.homeTeamFlag = t.flag;
        }
      }
      if (awayMissing) {
        const t = resolveTeam(entry.matchNumber, 'away');
        if (t) {
          next.awayTeamId = t.id;
          next.awayTeamName = t.name;
          next.awayTeamCode = t.code;
          next.awayTeamFlag = t.flag;
        }
      }
      return next;
    });
    return { ...query.data, data: rows };
  }, [query.data, resolveTeam]);

  return { ...query, data };
}

/**
 * Historial de OTRO usuario enriquecido. Reemplazo directo de
 * useUserPredictionHistory: el item ajeno trae sólo matchId, así que resolvemos
 * el matchNumber por el mapa y luego la identidad del equipo por proyección.
 */
export function useEnrichedUserPredictionHistory(userId: number | undefined) {
  const query = useUserPredictionHistory(userId);
  const { resolveTeam, matchNumberById } = useHistorySlotResolver();

  const data = useMemo(() => {
    if (!query.data) return query.data;
    return query.data.map((item): UserPredictionHistoryItem => {
      const homeMissing = isPlaceholderCode(item.homeTeam.code);
      const awayMissing = isPlaceholderCode(item.awayTeam.code);
      if (!homeMissing && !awayMissing) return item;

      const matchNumber = matchNumberById.get(item.matchId);
      const next: UserPredictionHistoryItem = {
        ...item,
        homeTeam: { ...item.homeTeam },
        awayTeam: { ...item.awayTeam },
      };
      if (homeMissing) {
        const t = resolveTeam(matchNumber, 'home');
        if (t) next.homeTeam = { name: t.name, code: t.code, flag: t.flag };
      }
      if (awayMissing) {
        const t = resolveTeam(matchNumber, 'away');
        if (t) next.awayTeam = { name: t.name, code: t.code, flag: t.flag };
      }
      return next;
    });
  }, [query.data, resolveTeam, matchNumberById]);

  return { ...query, data };
}
