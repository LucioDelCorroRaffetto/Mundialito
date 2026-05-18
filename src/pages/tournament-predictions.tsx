import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import {
  useTournamentPrediction,
  useUpsertTournamentPrediction,
} from '@/shared/hooks/use-tournament-predictions';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import type { Team } from '@/shared/types/api';

interface LocalPicks {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  revelationTeamId: number | null;
  surpriseEliminatedTeamId: number | null;
}

interface PickCardProps {
  title: string;
  points: number;
  selectedTeamId: number | null;
  onSelect: (id: number) => void;
  sectionId: string;
  openSection: string | null;
  setOpenSection: (id: string | null) => void;
  teams: Team[];
}

function PickCard({
  title,
  points,
  selectedTeamId,
  onSelect,
  sectionId,
  openSection,
  setOpenSection,
  teams,
}: PickCardProps) {
  const team = teams.find((t) => t.id === selectedTeamId);
  const isOpen = openSection === sectionId;

  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base-s font-bold text-text">{title}</p>
          <p className="text-xs-s text-accent font-semibold">+{points} pts</p>
        </div>
        {team ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl-s">{team.flag}</span>
            <span className="text-sm-s font-semibold text-text">{team.name}</span>
            <button
              onClick={() => setOpenSection(isOpen ? null : sectionId)}
              className="text-xs-s text-muted underline ml-2"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpenSection(isOpen ? null : sectionId)}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
          >
            Elegir
          </button>
        )}
      </div>
      {isOpen && (
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSelect(t.id);
                setOpenSection(null);
              }}
              className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg border text-xs-s',
                selectedTeamId === t.id
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-elevated'
              )}
            >
              <span className="text-xl-s">{t.flag}</span>
              <span className="text-muted font-semibold">{t.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopScorerCard({
  sectionId,
  openSection,
  setOpenSection,
}: {
  sectionId: string;
  openSection: string | null;
  setOpenSection: (id: string | null) => void;
}) {
  const isOpen = openSection === sectionId;
  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base-s font-bold text-text">Goleador del torneo</p>
          <p className="text-xs-s text-accent font-semibold">+15 pts</p>
        </div>
        <button
          onClick={() => setOpenSection(isOpen ? null : sectionId)}
          className="px-3 py-1.5 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
        >
          Elegir
        </button>
      </div>
      {isOpen && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs-s text-muted text-center py-4">
            Los jugadores estarán disponibles próximamente
          </p>
        </div>
      )}
    </div>
  );
}

export function TournamentPredictionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leagueIdParam = searchParams.get('leagueId');
  const leagueId = leagueIdParam ? Number(leagueIdParam) : undefined;

  const [picks, setPicks] = useState<LocalPicks>({
    championTeamId: null,
    runnerUpTeamId: null,
    revelationTeamId: null,
    surpriseEliminatedTeamId: null,
  });
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const teams = teamsData ?? [];

  const tournamentQuery = useTournamentPrediction(leagueId);
  const upsertMutation = useUpsertTournamentPrediction();

  // Populate picks from server data once loaded
  useEffect(() => {
    if (tournamentQuery.data && !initialised) {
      const d = tournamentQuery.data;
      setPicks({
        championTeamId: d.championTeamId,
        runnerUpTeamId: d.runnerUpTeamId,
        revelationTeamId: d.revelationTeamId,
        surpriseEliminatedTeamId: d.surpriseEliminatedTeamId,
      });
      setInitialised(true);
    }
    if (!tournamentQuery.isLoading && !tournamentQuery.data && !initialised) {
      setInitialised(true);
    }
  }, [tournamentQuery.data, tournamentQuery.isLoading, initialised]);

  const handleSave = async () => {
    if (!leagueId) {
      toast.error('Seleccioná una liga primero');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        leagueId,
        championTeamId: picks.championTeamId,
        runnerUpTeamId: picks.runnerUpTeamId,
        topScorerPlayerId: null,
        revelationTeamId: picks.revelationTeamId,
        surpriseEliminatedTeamId: picks.surpriseEliminatedTeamId,
      });
      toast.success('¡Pronósticos guardados!');
    } catch {
      toast.error('Error al guardar los pronósticos');
    }
  };

  const setField = (field: keyof LocalPicks) => (id: number) => {
    setPicks((prev) => ({ ...prev, [field]: id }));
  };

  const isLoading = tournamentQuery.isLoading || teamsLoading;

  if (!leagueId) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in pb-8">
        <div className="flex items-center gap-3 px-4 pt-5 pb-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-md bg-elevated border border-border"
            aria-label="Volver"
          >
            <ArrowLeft size={18} className="text-text" />
          </button>
          <h1 className="text-base-s font-bold text-text">Pronósticos de torneo</h1>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 px-4 gap-3 mt-16">
          <p className="text-base-s font-semibold text-text text-center">
            Seleccioná una liga para ver tus pronósticos
          </p>
          <button
            onClick={() => navigate('/leagues')}
            className="px-4 py-2 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
          >
            Ir a ligas
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full animate-fade-in pb-8">
        <div className="flex items-center gap-3 px-4 pt-5 pb-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-md bg-elevated border border-border"
            aria-label="Volver"
          >
            <ArrowLeft size={18} className="text-text" />
          </button>
          <h1 className="text-base-s font-bold text-text">Pronósticos de torneo</h1>
        </div>
        <div className="px-4 mt-2">
          <SkeletonList count={5} />
        </div>
      </div>
    );
  }

  const saving = upsertMutation.isPending;

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-md bg-elevated border border-border"
          aria-label="Volver"
        >
          <ArrowLeft size={18} className="text-text" />
        </button>
        <h1 className="text-base-s font-bold text-text">Pronósticos de torneo</h1>
      </div>

      {/* Urgency badge */}
      <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/15 border border-orange-500/30">
        <Clock size={14} className="text-orange-400 flex-shrink-0" />
        <p className="text-xs-s text-orange-400 font-semibold">
          Solo podés cambiarlos hasta el 11 Jun
        </p>
      </div>

      {/* Pick cards */}
      <div className="flex flex-col gap-3 px-4">
        <PickCard
          title="Campeón"
          points={50}
          selectedTeamId={picks.championTeamId}
          onSelect={setField('championTeamId')}
          sectionId="champion"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <PickCard
          title="Finalista"
          points={20}
          selectedTeamId={picks.runnerUpTeamId}
          onSelect={setField('runnerUpTeamId')}
          sectionId="runnerUp"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <TopScorerCard
          sectionId="topScorer"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
        <PickCard
          title="Revelación"
          points={10}
          selectedTeamId={picks.revelationTeamId}
          onSelect={setField('revelationTeamId')}
          sectionId="revelation"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
        <PickCard
          title="Eliminado sorpresa"
          points={10}
          selectedTeamId={picks.surpriseEliminatedTeamId}
          onSelect={setField('surpriseEliminatedTeamId')}
          sectionId="eliminatedSurprise"
          openSection={openSection}
          setOpenSection={setOpenSection}
          teams={teams}
        />
      </div>

      {/* Scoring reference */}
      <div className="mx-4 mt-4 p-4 rounded-lg bg-elevated border border-border">
        <p className="text-sm-s font-semibold text-text mb-2">Sistema de puntos</p>
        <div className="flex flex-col gap-1.5">
          {[
            ['Campeón', '50 pts'],
            ['Finalista', '20 pts'],
            ['Goleador del torneo', '15 pts'],
            ['Revelación', '10 pts'],
            ['Eliminado sorpresa', '10 pts'],
          ].map(([label, pts]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm-s text-muted">{label}</span>
              <span className="text-sm-s font-bold text-accent">{pts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 mt-4">
        {upsertMutation.isSuccess ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500/15 border border-green-500/30"
          >
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-sm-s font-semibold text-green-400">
              ¡Pronósticos guardados!
            </span>
          </motion.div>
        ) : (
          <Button fullWidth size="lg" onClick={handleSave} loading={saving}>
            Guardar pronósticos
          </Button>
        )}
      </div>
    </div>
  );
}
