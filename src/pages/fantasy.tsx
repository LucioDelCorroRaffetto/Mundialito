import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { useMyFantasyTeam, useUpdateFantasySquad } from '@/shared/hooks/use-fantasy';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';

const POSITIONS = ['Todo', 'GK', 'DEF', 'MID', 'FWD'] as const;
type Position = typeof POSITIONS[number];

const POSITION_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

export function FantasyPage() {
  const [params] = useSearchParams();
  const leagueId = params.get('leagueId') ? Number(params.get('leagueId')) : undefined;
  const [selectedPosition, setSelectedPosition] = useState<Position>('Todo');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { isLoading: fantasyLoading } = useMyFantasyTeam(leagueId);
  const updateSquad = useUpdateFantasySquad();

  const teams = teamsData ?? [];

  const handleSave = async () => {
    if (!leagueId) {
      toast.error('Seleccioná una liga primero');
      return;
    }
    if (selectedPlayerIds.length < 11) {
      toast.error('Necesitás al menos 11 jugadores');
      return;
    }
    try {
      await updateSquad.mutateAsync({ leagueId, playerIds: selectedPlayerIds });
      toast.success('¡Equipo guardado!');
    } catch {
      toast.error('Error al guardar el equipo');
    }
  };

  if (teamsLoading || fantasyLoading) {
    return (
      <div className="p-4">
        <SkeletonList count={6} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl-s font-display font-bold text-text">Fantasy</h1>
        <p className="text-sm-s text-muted mt-1">
          Elegí hasta 15 jugadores para tu equipo
        </p>
      </div>

      {/* Position filter */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-1">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setSelectedPosition(pos)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs-s font-semibold whitespace-nowrap transition-colors',
              selectedPosition === pos
                ? 'bg-accent text-accent-on'
                : 'bg-card border border-border text-muted'
            )}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Squad counter */}
      <div className="mx-4 p-3 rounded-xl bg-card border border-border flex justify-between text-xs-s">
        {Object.entries(POSITION_LIMITS).map(([pos, max]) => (
          <div key={pos} className="flex flex-col items-center gap-0.5">
            <span className="text-muted">{pos}</span>
            <span className="font-bold text-text">
              0/{max}
            </span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-muted">Total</span>
          <span
            className={cn(
              'font-bold',
              selectedPlayerIds.length >= 11 ? 'text-accent' : 'text-text'
            )}
          >
            {selectedPlayerIds.length}/15
          </span>
        </div>
      </div>

      {/* Teams accordion */}
      <div className="flex flex-col gap-2 px-4">
        {teams.length === 0 ? (
          <div className="p-6 rounded-xl bg-card border border-border text-center">
            <p className="text-sm-s text-muted">
              Los equipos estarán disponibles próximamente
            </p>
          </div>
        ) : (
          teams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl bg-card border border-border overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedTeam(expandedTeam === team.id ? null : team.id)
                }
                className="w-full flex items-center gap-3 p-4"
              >
                <span className="text-2xl-s">{team.flag}</span>
                <span className="flex-1 text-left text-sm-s font-semibold text-text">
                  {team.name}
                </span>
                <span className="text-xs-s text-muted">{team.code}</span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'text-muted transition-transform',
                    expandedTeam === team.id && 'rotate-180'
                  )}
                />
              </button>
              {expandedTeam === team.id && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="border-t border-border"
                >
                  <p className="px-4 py-3 text-xs-s text-muted italic">
                    Jugadores disponibles próximamente. Por ahora el equipo completo
                    se puede seleccionar desde aquí.
                  </p>
                  <button
                    onClick={() => {
                      toast.info(`${team.name} — jugadores disponibles pronto`);
                    }}
                    className="w-full px-4 py-2 text-xs-s text-accent font-semibold text-left hover:bg-accent/10 transition-colors"
                  >
                    Ver jugadores →
                  </button>
                </motion.div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Save button */}
      {selectedPlayerIds.length > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          className="fixed bottom-20 left-4 right-4"
        >
          <button
            onClick={handleSave}
            disabled={updateSquad.isPending}
            className="w-full py-4 rounded-xl bg-accent text-accent-on font-bold text-base-s shadow-lg disabled:opacity-60"
          >
            {updateSquad.isPending
              ? 'Guardando...'
              : `Guardar equipo (${selectedPlayerIds.length})`}
          </button>
        </motion.div>
      )}
    </div>
  );
}
