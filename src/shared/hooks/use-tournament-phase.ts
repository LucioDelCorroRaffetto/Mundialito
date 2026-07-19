import { useMemo } from 'react';
import type { Match } from '@/shared/types/api';
import { ROUND_LABELS } from '@/shared/data/mock';

const KNOCKOUT_ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'] as const;
type KnockoutRound = (typeof KNOCKOUT_ROUND_ORDER)[number];

const ROUND_ACCENT: Record<KnockoutRound, string> = {
  r32:   '#64748b',
  r16:   '#3b82f6',
  qf:    '#8b5cf6',
  sf:    '#f97316',
  final: '#eab308',
};

export type TournamentPhase =
  | { kind: 'loading' }
  | { kind: 'pre_tournament' }
  | { kind: 'group_stage' }
  | {
      kind: 'knockout';
      round: KnockoutRound;
      label: string;
      accentColor: string;
      liveCount: number;
      matchesLeft: number;
      total: number;
    }
  | { kind: 'completed' };

export function useTournamentPhase(matches: Match[]): TournamentPhase {
  return useMemo((): TournamentPhase => {
    if (matches.length === 0) return { kind: 'loading' };

    // 'third' (tercer puesto) corre en paralelo a la final — excluirlo evita
    // que distorsione la detección de fase cuando solo queda ese partido.
    const knockoutMatches = matches.filter(
      (m) => m.round !== 'group' && m.round !== 'third',
    );

    // Iterar en reversa (final → r32) para retornar la fase más avanzada
    // con partidos pendientes. Esto maneja el caso de mezcla grupos + R32
    // activos devolviendo R32, que es lo correcto.
    for (const round of [...KNOCKOUT_ROUND_ORDER].reverse()) {
      const roundMatches = knockoutMatches.filter((m) => m.round === round);
      if (roundMatches.length === 0) continue;

      const pending = roundMatches.filter((m) => m.status !== 'finished');
      if (pending.length === 0) continue;

      const liveCount = pending.filter((m) => m.status === 'live').length;
      return {
        kind: 'knockout',
        round,
        label: ROUND_LABELS[round] ?? round,
        accentColor: ROUND_ACCENT[round],
        liveCount,
        matchesLeft: pending.length,
        total: roundMatches.length,
      };
    }

    if (knockoutMatches.length > 0) return { kind: 'completed' };

    const groupPending = matches.filter(
      (m) => m.round === 'group' && m.status !== 'finished',
    );
    if (groupPending.length > 0) return { kind: 'group_stage' };

    return { kind: 'pre_tournament' };
  }, [matches]);
}
