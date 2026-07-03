import { useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Swords } from 'lucide-react';
import { useUserProfile } from '@/shared/hooks/use-user-profile';
import { useEnrichedUserPredictionHistory } from '@/shared/hooks/use-enriched-history';
import { SkeletonList } from '@/shared/components/skeleton';
import { H2hRow, type H2hMatch } from '@/shared/components/h2h-row';
import { staggerContainer, staggerItem, useMotionPrefs, useCountUp } from '@/shared/lib/motion';

function Avatar({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  return (
    <div className="w-14 h-14 rounded-full bg-elevated flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
      {avatarUrl ? (
        <img src={avatarUrl} alt={username} loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span className="text-lg-s font-bold text-text">{username.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

export function HeadToHeadPage() {
  const { userIdA, userIdB } = useParams();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();

  const idA = Number(userIdA);
  const idB = Number(userIdB);
  const validIds = Number.isFinite(idA) && Number.isFinite(idB) && idA > 0 && idB > 0 && idA !== idB;

  const { data: profileA, isLoading: loadingProfileA } = useUserProfile(validIds ? idA : undefined);
  const { data: profileB, isLoading: loadingProfileB } = useUserProfile(validIds ? idB : undefined);
  const { data: historyA, isLoading: loadingHistoryA } = useEnrichedUserPredictionHistory(validIds ? idA : undefined);
  const { data: historyB, isLoading: loadingHistoryB } = useEnrichedUserPredictionHistory(validIds ? idB : undefined);

  const matches = useMemo((): H2hMatch[] => {
    if (!historyA || !historyB) return [];
    const byMatchB = new Map(historyB.map((item) => [item.matchId, item]));
    const rows: H2hMatch[] = [];
    for (const a of historyA) {
      const b = byMatchB.get(a.matchId);
      if (!b) continue;
      rows.push({
        matchId: a.matchId,
        kickoffUtc: a.kickoffUtc,
        homeTeam: a.homeTeam,
        awayTeam: a.awayTeam,
        actualHomeScore: a.result?.homeScore ?? null,
        actualAwayScore: a.result?.awayScore ?? null,
        predictionA: a.prediction,
        outcomeA: a.outcome,
        pointsA: a.points,
        predictionB: b.prediction,
        outcomeB: b.outcome,
        pointsB: b.points,
      });
    }
    return rows.sort((x, y) => new Date(y.kickoffUtc).getTime() - new Date(x.kickoffUtc).getTime());
  }, [historyA, historyB]);

  const totalA = useCountUp(matches.reduce((sum, m) => sum + (m.pointsA ?? 0), 0));
  const totalB = useCountUp(matches.reduce((sum, m) => sum + (m.pointsB ?? 0), 0));

  if (!validIds) return <Navigate to="/leagues" replace />;

  const isLoading = loadingProfileA || loadingProfileB || loadingHistoryA || loadingHistoryB;

  return (
    <div className="flex flex-col min-h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md bg-elevated border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Volver"
        >
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-lg-s font-display font-bold text-text flex items-center gap-2">
          <Swords size={18} className="text-accent" /> Head to head
        </h1>
      </div>

      {isLoading || !profileA || !profileB ? (
        <div className="px-4">
          <SkeletonList count={5} />
        </div>
      ) : (
        <>
          <div className="mx-4 mb-4 p-4 rounded-lg bg-card border border-border flex items-center justify-between gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <Avatar username={profileA.username} avatarUrl={profileA.avatarUrl} />
              <span className="text-sm-s font-semibold text-text truncate max-w-[90px] text-center">{profileA.username}</span>
              <span className="text-xl-s font-display font-black text-accent tabular-nums">{totalA}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs-s text-muted">{matches.length} en común</span>
              <span
                className={
                  'text-sm-s font-bold ' +
                  (totalA === totalB ? 'text-muted' : totalA > totalB ? 'text-green-500' : 'text-red-500')
                }
              >
                {totalA === totalB ? 'Empate' : totalA > totalB ? `+${totalA - totalB}` : `${totalA - totalB}`}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Avatar username={profileB.username} avatarUrl={profileB.avatarUrl} />
              <span className="text-sm-s font-semibold text-text truncate max-w-[90px] text-center">{profileB.username}</span>
              <span className="text-xl-s font-display font-black text-accent tabular-nums">{totalB}</span>
            </div>
          </div>

          <div className="px-4 pb-4">
            {matches.length === 0 ? (
              <div className="p-6 rounded-xl bg-card border border-border border-dashed flex flex-col items-center gap-2 text-center">
                <span className="text-2xl-s">⚔️</span>
                <p className="text-sm-s font-semibold text-text">Todavía no tienen partidos en común</p>
                <p className="text-xs-s text-muted">
                  Se muestran solo los partidos ya arrancados donde ambos pronosticaron.
                </p>
              </div>
            ) : (
              <motion.div
                className="flex flex-col gap-2"
                variants={staggerContainer(reduced)}
                initial="initial"
                animate="animate"
              >
                {matches.map((m) => (
                  <motion.div key={m.matchId} variants={staggerItem(reduced)}>
                    <H2hRow match={m} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
