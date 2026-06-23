import { useMemo } from 'react';
import { useMatches } from '@/shared/hooks/use-matches';
import { useTeams } from '@/shared/hooks/use-teams';
import { computeBracketProjection, type BracketProjection } from '@/shared/lib/bracket-projection';

/**
 * Proyección del cuadro (1°/2° de grupo + mejores terceros) lista para resolver
 * slots de la R32. Reusa los queries cacheados de matches/teams, así que en
 * páginas que ya los pidieron (Partidos) no agrega red.
 */
export function useBracketProjection(): BracketProjection {
  const { data: matchesResp } = useMatches({ limit: 200 });
  const { data: teamsData } = useTeams();
  return useMemo(
    () => computeBracketProjection(teamsData ?? [], matchesResp?.data ?? []),
    [teamsData, matchesResp],
  );
}
