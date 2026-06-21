import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { ChevronDown, Check, Trophy, Crown, Shield, BarChart2, BookOpen, ChevronRight, Lock, CheckCircle2, Handshake } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useTeams } from '@/shared/hooks/use-teams';
import { usePlayers } from '@/shared/hooks/use-players';
import { useMyFantasyTeam, useUpdateFantasySquad, useFantasyStandings, useUserFantasyTeam, useUserFantasyPointsByRound } from '@/shared/hooks/use-fantasy';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { useAuthStore } from '@/shared/stores/auth-store';
import { SkeletonList } from '@/shared/components/skeleton';
import { toast } from 'sonner';
import { play } from '@/shared/lib/sounds';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { useFantasyRounds, useFantasyLineup, useUpsertLineup } from '@/shared/hooks/use-fantasy-lineups';
import type { LineupPlayerInput } from '@/shared/hooks/use-fantasy-lineups';
import type { Player, FantasyPlayerBreakdown } from '@/shared/types/api';

const POSITION_COLORS: Record<string, string> = {
  GK: 'bg-yellow-500/20 text-yellow-500',
  DEF: 'bg-blue-500/20 text-blue-400',
  MID: 'bg-green-500/20 text-green-500',
  FWD: 'bg-red-500/20 text-red-400',
};

function PlayerAvatar({ photoUrl, name, position }: { photoUrl: string | null; name: string; position: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="w-8 h-8 rounded-full object-cover object-top flex-shrink-0 bg-elevated"
        loading="lazy"
      />
    );
  }
  // Fallback: colored circle with initial
  return (
    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold', POSITION_COLORS[position] ?? 'bg-elevated text-muted')}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

interface PitchPlayer {
  id: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  shirtNumber: number | null;
}

// Shirt SVG — flat color with number
function Shirt({ color, textColor, number }: { color: string; textColor: string; number?: number | null }) {
  return (
    <svg viewBox="0 0 40 36" className="w-full h-full" fill="none">
      {/* Body */}
      <path d="M10 6 L4 14 L10 16 L10 34 L30 34 L30 16 L36 14 L30 6 L24 4 C23 8 17 8 16 4 Z" fill={color} />
      {/* Collar */}
      <ellipse cx="20" cy="5" rx="4" ry="2.5" fill={textColor} opacity="0.25" />
      {/* Number */}
      {number != null && (
        <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="bold" fill={textColor} fontFamily="sans-serif">
          {number}
        </text>
      )}
    </svg>
  );
}

const SHIRT_COLORS: Record<Position, { bg: string; text: string; ring: string }> = {
  GK:  { bg: '#f59e0b', text: '#1c1917', ring: 'ring-yellow-400' },
  DEF: { bg: '#3b82f6', text: '#ffffff', ring: 'ring-blue-400' },
  MID: { bg: '#22c55e', text: '#ffffff', ring: 'ring-green-400' },
  FWD: { bg: '#ef4444', text: '#ffffff', ring: 'ring-red-400' },
};

// ─── Lineup pitch — for the Titulares tab ────────────────────────────────────

interface LineupPitchPlayer extends PitchPlayer {
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** CSV de roles cortos: "LW,LB" o "ST". null si Wikipedia no lo publicó. */
  subPosition: string | null;
}

/**
 * Plantilla de formación: definimos slots con nombre (CB, LB, ST, etc.) y
 * coordenadas % sobre la cancha. La formación activa se deduce del recuento
 * de starters por posición — el usuario solo elige 11 jugadores y la cancha
 * adopta el esquema correcto. Si en el futuro queremos role-per-player, este
 * mapeo deja un slot.role para cruzarlo contra preferencias del jugador.
 */
type SlotRole = 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST' | 'SS';
interface FormationSlot { role: SlotRole; base: Position; x: number; y: number }
interface Formation { name: string; slots: FormationSlot[] }

const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    name: '4-4-2',
    slots: [
      { role: 'GK',  base: 'GK',  x: 50, y: 90 },
      { role: 'LB',  base: 'DEF', x: 15, y: 70 },
      { role: 'CB',  base: 'DEF', x: 38, y: 72 },
      { role: 'CB',  base: 'DEF', x: 62, y: 72 },
      { role: 'RB',  base: 'DEF', x: 85, y: 70 },
      { role: 'LM',  base: 'MID', x: 15, y: 45 },
      { role: 'CM',  base: 'MID', x: 38, y: 47 },
      { role: 'CM',  base: 'MID', x: 62, y: 47 },
      { role: 'RM',  base: 'MID', x: 85, y: 45 },
      { role: 'ST',  base: 'FWD', x: 38, y: 18 },
      { role: 'ST',  base: 'FWD', x: 62, y: 18 },
    ],
  },
  '4-3-3': {
    name: '4-3-3',
    slots: [
      { role: 'GK',  base: 'GK',  x: 50, y: 90 },
      { role: 'LB',  base: 'DEF', x: 15, y: 70 },
      { role: 'CB',  base: 'DEF', x: 38, y: 72 },
      { role: 'CB',  base: 'DEF', x: 62, y: 72 },
      { role: 'RB',  base: 'DEF', x: 85, y: 70 },
      { role: 'CDM', base: 'MID', x: 50, y: 52 },
      { role: 'CM',  base: 'MID', x: 28, y: 45 },
      { role: 'CM',  base: 'MID', x: 72, y: 45 },
      { role: 'LW',  base: 'FWD', x: 18, y: 18 },
      { role: 'ST',  base: 'FWD', x: 50, y: 14 },
      { role: 'RW',  base: 'FWD', x: 82, y: 18 },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    slots: [
      { role: 'GK',  base: 'GK',  x: 50, y: 90 },
      { role: 'CB',  base: 'DEF', x: 25, y: 72 },
      { role: 'CB',  base: 'DEF', x: 50, y: 74 },
      { role: 'CB',  base: 'DEF', x: 75, y: 72 },
      { role: 'LWB', base: 'MID', x: 12, y: 48 },
      { role: 'CDM', base: 'MID', x: 36, y: 52 },
      { role: 'CM',  base: 'MID', x: 50, y: 45 },
      { role: 'CDM', base: 'MID', x: 64, y: 52 },
      { role: 'RWB', base: 'MID', x: 88, y: 48 },
      { role: 'ST',  base: 'FWD', x: 38, y: 18 },
      { role: 'ST',  base: 'FWD', x: 62, y: 18 },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    slots: [
      { role: 'GK',  base: 'GK',  x: 50, y: 90 },
      { role: 'LWB', base: 'DEF', x: 12, y: 70 },
      { role: 'CB',  base: 'DEF', x: 32, y: 73 },
      { role: 'CB',  base: 'DEF', x: 50, y: 75 },
      { role: 'CB',  base: 'DEF', x: 68, y: 73 },
      { role: 'RWB', base: 'DEF', x: 88, y: 70 },
      { role: 'CDM', base: 'MID', x: 30, y: 47 },
      { role: 'CM',  base: 'MID', x: 50, y: 45 },
      { role: 'CAM', base: 'MID', x: 70, y: 47 },
      { role: 'ST',  base: 'FWD', x: 38, y: 18 },
      { role: 'ST',  base: 'FWD', x: 62, y: 18 },
    ],
  },
  '3-4-3': {
    name: '3-4-3',
    slots: [
      { role: 'GK',  base: 'GK',  x: 50, y: 90 },
      { role: 'CB',  base: 'DEF', x: 25, y: 72 },
      { role: 'CB',  base: 'DEF', x: 50, y: 74 },
      { role: 'CB',  base: 'DEF', x: 75, y: 72 },
      { role: 'LM',  base: 'MID', x: 15, y: 47 },
      { role: 'CM',  base: 'MID', x: 38, y: 47 },
      { role: 'CM',  base: 'MID', x: 62, y: 47 },
      { role: 'RM',  base: 'MID', x: 85, y: 47 },
      { role: 'LW',  base: 'FWD', x: 18, y: 18 },
      { role: 'ST',  base: 'FWD', x: 50, y: 14 },
      { role: 'RW',  base: 'FWD', x: 82, y: 18 },
    ],
  },
  '4-5-1': {
    name: '4-5-1',
    slots: [
      { role: 'GK',  base: 'GK',  x: 50, y: 90 },
      { role: 'LB',  base: 'DEF', x: 15, y: 70 },
      { role: 'CB',  base: 'DEF', x: 38, y: 72 },
      { role: 'CB',  base: 'DEF', x: 62, y: 72 },
      { role: 'RB',  base: 'DEF', x: 85, y: 70 },
      { role: 'LM',  base: 'MID', x: 12, y: 45 },
      { role: 'CM',  base: 'MID', x: 32, y: 48 },
      { role: 'CDM', base: 'MID', x: 50, y: 52 },
      { role: 'CM',  base: 'MID', x: 68, y: 48 },
      { role: 'RM',  base: 'MID', x: 88, y: 45 },
      { role: 'ST',  base: 'FWD', x: 50, y: 16 },
    ],
  },
};

/** Detecta formación por recuento de starters por posición base. */
function detectFormation(players: LineupPitchPlayer[]): Formation | null {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) if (p.isStarter) counts[p.position]++;
  if (counts.GK !== 1) return null;
  const key = `${counts.DEF}-${counts.MID}-${counts.FWD}`;
  return FORMATIONS[key] ?? null;
}

function LineupPitch({
  players,
  isOpen,
  onToggleStarter,
  onSetCaptain,
  onSetVice,
}: {
  players: LineupPitchPlayer[];
  isOpen: boolean;
  onToggleStarter: (id: number) => void;
  onSetCaptain: (id: number) => void;
  onSetVice: (id: number) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const starters = players.filter((p) => p.isStarter);
  const bench = players.filter((p) => !p.isStarter);

  // Detectamos la formación a partir del recuento de starters. Si el usuario
  // no llegó a 11 o tiene un combo raro (ej. 0 GK), caemos a una vista
  // por filas sin slots — placeholder amistoso "Falta X" para que entienda
  // qué le falta.
  const formation = detectFormation(starters);
  // Asignación inteligente — dos pasadas:
  //  1ª pass: para cada slot, preferimos un jugador cuyo `subPosition`
  //     coincide EXACTAMENTE con el rol del slot (Haaland ST → slot ST,
  //     Nico González LW → slot LW).
  //  2ª pass: rellenamos slots vacíos con cualquier jugador disponible
  //     de la misma posición base (FWDs sobrantes → slot FWD genérico).
  // Esto resuelve "Haaland aparece en el LW solo porque hay 3 FWD".
  const slotAssignments: Array<{ slot: FormationSlot; player: LineupPitchPlayer | null }> = [];
  if (formation) {
    const used = new Set<number>();
    const available = [...starters].sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999));
    const hasRole = (p: LineupPitchPlayer, role: SlotRole): boolean => {
      if (!p.subPosition) return false;
      return p.subPosition.split(',').map((r) => r.trim()).includes(role);
    };
    // 1ª pass: matchs exactos de subPosition.
    const tempSlots: Array<{ slot: FormationSlot; player: LineupPitchPlayer | null }> = formation.slots.map((slot) => {
      const exact = available.find((p) => !used.has(p.id) && p.position === slot.base && hasRole(p, slot.role));
      if (exact) used.add(exact.id);
      return { slot, player: exact ?? null };
    });
    // 2ª pass: rellenamos los slots vacíos con cualquier jugador disponible
    // de la misma base position.
    for (const ts of tempSlots) {
      if (ts.player) continue;
      const fallback = available.find((p) => !used.has(p.id) && p.position === ts.slot.base);
      if (fallback) {
        used.add(fallback.id);
        ts.player = fallback;
      }
    }
    slotAssignments.push(...tempSlots);
  }

  // Resumen de qué falta para que el usuario novato sepa cómo armarlo.
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) counts[p.position]++;
  const needs: string[] = [];
  if (counts.GK === 0) needs.push('1 arquero');
  if (starters.length < 11) needs.push(`${11 - starters.length} jugadores más`);
  if (starters.length > 11) needs.push(`sobran ${starters.length - 11}`);

  return (
    <div className="flex flex-col gap-4 px-4">
      <div
        className="rounded-2xl overflow-hidden relative shadow-xl aspect-[3/4]"
        style={{ background: 'linear-gradient(175deg, #1a5c35 0%, #2d8653 35%, #3aaa68 50%, #2d8653 65%, #1a5c35 100%)' }}
        onClick={() => setOpenMenuId(null)}
      >
        {/* Pitch markings */}
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* Franjas de césped cortado — alterna 8 bandas para el look estadio */}
          <div
            className="absolute inset-0"
            style={{ background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 12.5%, rgba(0,0,0,0.04) 12.5% 25%)' }}
          />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/15" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/20" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-10 border-b border-x border-white/15 rounded-b-xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-10 border-t border-x border-white/15 rounded-t-xl" />
          {/* Viñeta suave para dar profundidad */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.28) 100%)' }}
          />
        </div>

        {/* Etiqueta de formación arriba a la derecha (si la pudimos detectar) */}
        {formation && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur text-[10px] font-bold text-white tracking-wider">
            {formation.name}
          </span>
        )}
        {!formation && needs.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-orange-500/90 text-[10px] font-bold text-white text-center">
            Te falta {needs.join(' + ')}
          </div>
        )}

        {/* Render por slots con posicionamiento absoluto */}
        {formation && slotAssignments.map(({ slot, player }, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <LineupPitchSlot
              role={slot.role}
              player={player ?? undefined}
              menuOpen={player ? openMenuId === player.id : false}
              canEdit={isOpen}
              onToggleMenu={(e) => {
                if (!player) return;
                e.stopPropagation();
                setOpenMenuId((cur) => (cur === player.id ? null : player.id));
              }}
              onPickCaptain={() => { if (player) { onSetCaptain(player.id); setOpenMenuId(null); } }}
              onPickVice={() => { if (player) { onSetVice(player.id); setOpenMenuId(null); } }}
              onBench={() => { if (player) { onToggleStarter(player.id); setOpenMenuId(null); } }}
            />
          </div>
        ))}

        {/* Fallback: si no detectamos formación (recuento raro), mostramos
            por filas como antes para que igual se vea algo coherente. */}
        {!formation && (
          <div className="relative flex flex-col gap-3 py-5 px-2 h-full justify-around">
            {(['FWD', 'MID', 'DEF', 'GK'] as Position[]).map((pos) => {
              const row = starters.filter((p) => p.position === pos).sort((a, b) => (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999));
              if (row.length === 0) {
                return (
                  <div key={pos} className="flex justify-center items-center px-1 min-h-[60px]">
                    <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Falta {pos}</span>
                  </div>
                );
              }
              return (
                <div key={pos} className="flex justify-around items-center px-1">
                  {row.map((p) => (
                    <LineupPitchSlot
                      key={p.id}
                      role={p.position as SlotRole}
                      player={p}
                      menuOpen={openMenuId === p.id}
                      canEdit={isOpen}
                      onToggleMenu={(e) => { e.stopPropagation(); setOpenMenuId((cur) => (cur === p.id ? null : p.id)); }}
                      onPickCaptain={() => { onSetCaptain(p.id); setOpenMenuId(null); }}
                      onPickVice={() => { onSetVice(p.id); setOpenMenuId(null); }}
                      onBench={() => { onToggleStarter(p.id); setOpenMenuId(null); }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bench — chips horizontales abajo, tap para promover a titular */}
      <div>
        <p className="text-xs-s text-muted mb-2 font-semibold uppercase tracking-wider">
          Suplentes ({bench.length})
        </p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {bench.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!isOpen}
              onClick={() => onToggleStarter(p.id)}
              className="flex-shrink-0 flex flex-col items-center gap-0.5 p-2 rounded-xl bg-card border border-border w-[78px] disabled:opacity-50 active:scale-95 transition-transform"
              title={`Subir ${p.name} a titular`}
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden ring-2 ring-border" style={{ background: SHIRT_COLORS[p.position].bg }}>
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt={p.name} className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
                ) : (
                  <Shirt color={SHIRT_COLORS[p.position].bg} textColor={SHIRT_COLORS[p.position].text} number={p.shirtNumber} />
                )}
              </div>
              <span className="text-[10px] font-bold text-text truncate max-w-[74px] leading-tight">
                {p.name.split(' ').slice(-1)[0]}
              </span>
              <span className={cn(
                'text-[8px] font-bold px-1.5 rounded leading-tight',
                p.position === 'GK' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                p.position === 'DEF' ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300' :
                p.position === 'MID' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
                'bg-rose-500/20 text-rose-700 dark:text-rose-300'
              )}>{p.position}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LineupPitchSlot({
  role,
  player,
  menuOpen,
  canEdit,
  onToggleMenu,
  onPickCaptain,
  onPickVice,
  onBench,
}: {
  role: SlotRole;
  player?: LineupPitchPlayer;
  menuOpen: boolean;
  canEdit: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onPickCaptain: () => void;
  onPickVice: () => void;
  onBench: () => void;
}) {
  // Slot vacío — placeholder con el rol esperado (CB / ST / etc.).
  if (!player) {
    return (
      <div className="relative w-[60px]">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center bg-white/5">
            <span className="text-[10px] text-white/60 font-bold">{role}</span>
          </div>
          <span className="text-[9px] text-white/40 font-semibold leading-tight">{role}</span>
        </div>
      </div>
    );
  }

  const shirt = SHIRT_COLORS[player.position];
  const lastName = player.name.split(' ').slice(-1)[0] ?? player.name;
  return (
    <div className="relative w-[60px]">
      <button
        onClick={onToggleMenu}
        disabled={!canEdit}
        className="flex flex-col items-center gap-0.5 w-full group disabled:cursor-default"
      >
        <div
          className={cn(
            'relative w-12 h-12 rounded-full overflow-hidden ring-2 transition-transform group-hover:scale-110 drop-shadow-lg',
            player.isCaptain ? 'ring-yellow-400' : player.isViceCaptain ? 'ring-slate-300' : 'ring-white/40',
          )}
          style={{ background: shirt.bg }}
        >
          {player.photoUrl ? (
            <img src={player.photoUrl} alt={player.name} className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
          ) : (
            <Shirt color={shirt.bg} textColor={shirt.text} number={player.shirtNumber} />
          )}
          {player.isCaptain && (
            <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center shadow-md ring-2 ring-black/30">
              <Crown size={11} className="text-yellow-950" />
            </span>
          )}
          {player.isViceCaptain && (
            <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center shadow-md ring-2 ring-black/30">
              <span className="text-[10px] font-black text-slate-900">V</span>
            </span>
          )}
          {/* Etiqueta de rol específico (CB, LB, ST...) abajo a la derecha del avatar */}
          <span className="absolute -bottom-1 -right-1 px-1 min-w-[16px] h-3.5 rounded-full bg-black/60 border border-white/30 text-[7px] font-bold text-white flex items-center justify-center leading-none">
            {role}
          </span>
        </div>
        <span className="text-[10px] text-white font-bold truncate max-w-[60px] text-center leading-tight drop-shadow-md">
          {lastName}
        </span>
      </button>

      {menuOpen && canEdit && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 flex flex-col gap-1 p-1.5 rounded-lg bg-card border border-border shadow-xl min-w-[110px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onPickCaptain}
            className={cn(
              'px-2 py-1 rounded text-[11px] font-semibold text-left flex items-center gap-1.5 hover:bg-elevated',
              player.isCaptain && 'text-yellow-600 dark:text-yellow-400',
            )}
          >
            <Crown size={11} className="text-yellow-500" />
            {player.isCaptain ? 'Es capitán' : 'Capitán (x2)'}
          </button>
          <button
            onClick={onPickVice}
            className={cn(
              'px-2 py-1 rounded text-[11px] font-semibold text-left flex items-center gap-1.5 hover:bg-elevated',
              player.isViceCaptain && 'text-slate-600 dark:text-slate-300',
            )}
          >
            <span className="w-3 h-3 rounded-full bg-slate-400 flex items-center justify-center text-[8px] font-black text-slate-900">V</span>
            {player.isViceCaptain ? 'Es vice' : 'Vicecapitán (x1.5)'}
          </button>
          <button
            onClick={onBench}
            className="px-2 py-1 rounded text-[11px] font-semibold text-left hover:bg-elevated text-muted"
          >
            ↓ A banca
          </button>
        </div>
      )}
    </div>
  );
}

// ─── End lineup pitch ───────────────────────────────────────────────────────

const POSITIONS = ['Todo', 'GK', 'DEF', 'MID', 'FWD'] as const;
type PositionFilter = typeof POSITIONS[number];
type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

const POSITION_LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_SQUAD = 15;
const STARTERS_COUNT = 11;

const POSITION_LABELS: Record<Position, string> = {
  GK: 'Portero',
  DEF: 'Defensor',
  MID: 'Mediocampista',
  FWD: 'Delantero',
};

type Tab = 'team' | 'standings' | 'guide';

export function FantasyPage() {
  const [tab, setTab] = useState<Tab>('team');
  const [selectedPosition, setSelectedPosition] = useState<PositionFilter>('Todo');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [starterIds, setStarterIds] = useState<number[]>([]);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: playersData, isLoading: playersLoading } = usePlayers();
  const { data: fantasyData, isLoading: fantasyLoading } = useMyFantasyTeam();
  const { data: leaguesResponse } = useMyLeagues();
  const updateSquad = useUpdateFantasySquad();
  const { data: roundsData } = useFantasyRounds();
  // Standings comparten cache con la pestaña Tabla (staleTime 60s), así que
  // leer el ranking del usuario en el hero no agrega un fetch extra.
  const { data: standingsData } = useFantasyStandings();
  const currentUser = useAuthStore((s) => s.user);

  // El plantel se bloquea con el deadline de Fecha 1 (group_1) — no podés
  // cambiar los 15 una vez arrancado el Mundial. Lo que SÍ podés cambiar
  // es tu 11 inicial fecha por fecha desde la pestaña Titulares. Cuando
  // el plantel queda locked, escondemos el botón "Guardar plantel" y
  // dejamos un banner que apunta al lugar correcto.
  const squadLocked = (() => {
    const group1 = roundsData?.data.find((r) => r.slug === 'group_1');
    if (!group1?.deadline) return false;
    return new Date(group1.deadline).getTime() <= Date.now();
  })();

  const myLeagues = leaguesResponse?.data ?? [];

  // Exclude internal placeholder teams (TBD for knockouts, PO1/PO2 for playoffs)
  const teams = (teamsData ?? []).filter(
    (t) => t.confederation !== null && t.code !== 'TBD' && t.code !== 'PO1' && t.code !== 'PO2',
  );
  const players = playersData ?? [];

  // Preload existing squad, starters and captain from server. We compute a
  // stable signature of the server squad and only sync local state when the
  // signature changes — otherwise every background refetch (TanStack Query
  // re-fires on focus, network reconnect, etc.) would silently wipe the
  // user's unsaved edits while they're still picking players.
  const serverSquadSignature = useMemo(() => {
    if (!fantasyData?.squad) return '';
    return fantasyData.squad
      .map((p) => `${p.id}:${p.isStarter ? 's' : 'b'}:${p.isCaptain ? 'c' : '-'}`)
      .sort()
      .join('|');
  }, [fantasyData?.squad]);
  const lastLoadedSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fantasyData?.squad || fantasyData.squad.length === 0) return;
    if (lastLoadedSignatureRef.current === serverSquadSignature) return;
    lastLoadedSignatureRef.current = serverSquadSignature;
    setSelectedPlayerIds(fantasyData.squad.map((p) => p.id));
    setStarterIds(fantasyData.squad.filter((p) => p.isStarter).map((p) => p.id));
    const cap = fantasyData.squad.find((p) => p.isCaptain);
    setCaptainId(cap ? cap.id : null);
  }, [fantasyData?.squad, serverSquadSignature]);

  const playersById = useMemo(() => {
    const map = new Map<number, Player>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  // Group players by teamId — sort each team's roster GK → DEF → MID → FWD,
  // then by shirt number within position so the picker matches how the
  // actual squad sheets are printed (GK 1, DEF 2-5, etc.). Players with
  // no shirt number sort last alphabetically.
  const playersByTeam = useMemo(() => {
    const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const map = new Map<number, Player[]>();
    for (const player of players) {
      const existing = map.get(player.teamId) ?? [];
      existing.push(player);
      map.set(player.teamId, existing);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const dp = (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99);
        if (dp !== 0) return dp;
        const sa = a.shirtNumber ?? 999;
        const sb = b.shirtNumber ?? 999;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [players]);

  // Position counts for selected players
  const positionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const selectedSet = new Set(selectedPlayerIds);
    for (const player of players) {
      if (selectedSet.has(player.id)) {
        counts[player.position]++;
      }
    }
    return counts;
  }, [selectedPlayerIds, players]);

  // fantasy points lookup from saved squad
  const fantasyPointsById = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of fantasyData?.squad ?? []) map.set(p.id, p.fantasyPoints);
    return map;
  }, [fantasyData]);

  const totalPoints = fantasyData?.team?.totalPoints ?? 0;

  // Posición del usuario en la tabla global — alimenta el hero. Solo tiene
  // sentido mostrarla una vez que el torneo arrancó a sumar puntos.
  const myRank = standingsData?.find((e) => e.userId === currentUser?.id)?.rank ?? null;
  const totalTeams = standingsData?.length ?? 0;

  const handleTogglePlayer = (player: Player) => {
    const isSelected = selectedPlayerIds.includes(player.id);

    if (isSelected) {
      setSelectedPlayerIds((prev) => prev.filter((id) => id !== player.id));
      // also drop from starters / captain if present
      setStarterIds((prev) => prev.filter((id) => id !== player.id));
      setCaptainId((prev) => (prev === player.id ? null : prev));
      return;
    }

    // Check total limit
    if (selectedPlayerIds.length >= MAX_SQUAD) {
      toast.error(`Ya tenés el máximo de ${MAX_SQUAD} jugadores`);
      return;
    }

    // Check position limit
    const limit = POSITION_LIMITS[player.position];
    if (positionCounts[player.position] >= limit) {
      toast.error(
        `Ya tenés ${limit} ${POSITION_LABELS[player.position]}${limit > 1 ? 's' : ''} (máximo)`
      );
      return;
    }

    setSelectedPlayerIds((prev) => [...prev, player.id]);
  };


  // NOTE: starterIds / captainId / these handlers belong to the legacy
  // "fixed starters per tournament" model. They still feed the squad save
  // payload for backwards-compat but the user-facing toggling lives in
  // PerRoundLineupTab. We keep the helpers exported with underscore prefix
  // so the linter doesn't complain while preserving them as documentation.
  const _handleToggleStarter = (id: number) => {
    setStarterIds((prev) => {
      if (prev.includes(id)) {
        if (captainId === id) setCaptainId(null);
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= STARTERS_COUNT) {
        toast.error(`Solo podés tener ${STARTERS_COUNT} titulares`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const _handleSetCaptain = (id: number) => {
    if (!starterIds.includes(id)) {
      toast.error('El capitán tiene que ser titular');
      return;
    }
    setCaptainId((prev) => (prev === id ? null : id));
  };
  void _handleToggleStarter;
  void _handleSetCaptain;

  const handleSave = async () => {
    // The Plantel tab only chooses the universe of 15 — starters / captain
    // are picked per round in the Titulares tab now. We keep the legacy
    // payload happy by sending the first 11 as starters and the first one
    // as captain; the backend treats these as defaults that the per-round
    // lineup overrides. Without this, the save was blocked with 'marcá
    // 11 titulares' even though there's no UI to do that any more.
    if (selectedPlayerIds.length < 15) {
      toast.error(`Tenés que armar un plantel de 15 (tenés ${selectedPlayerIds.length})`);
      return;
    }
    const defaultStarters = selectedPlayerIds.slice(0, 11);
    const defaultCaptain = defaultStarters[0];
    try {
      await updateSquad.mutateAsync({
        playerIds: selectedPlayerIds,
        starterIds: defaultStarters,
        captainId: defaultCaptain,
      });
      toast.success('¡Equipo guardado! Elegí tu 11 inicial en la pestaña Titulares.');
      play('chime');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err?.response?.data?.error?.message ?? 'Error al guardar el equipo');
    }
  };

  const isLoading = teamsLoading || playersLoading || fantasyLoading;

  if (isLoading) {
    return (
      <div className="p-4">
        <SkeletonList count={6} />
      </div>
    );
  }

  const squadPlayers = selectedPlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => p != null);

  return (
    <div className="flex flex-col gap-4 pb-36 md:pb-24 animate-fade-in">
      {/* Hero — identidad del equipo + stats clave en un solo bloque con
          presencia. El motivo de cancha (círculos) y el degradé del accent
          le dan el aire "fantasy/estadio" que antes faltaba. */}
      <div className="mx-4 mt-4 relative overflow-hidden rounded-2xl bg-accent text-accent-on shadow-lg">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, transparent 45%, rgba(0,0,0,0.18) 100%)' }}
        />
        {/* Líneas de cancha decorativas, ancladas a la derecha */}
        <div className="absolute inset-y-0 right-0 w-40 pointer-events-none text-accent-on opacity-[0.13]">
          <div className="absolute right-[-46px] top-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-[3px] border-current" />
          <div className="absolute right-[-96px] top-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-[3px] border-current" />
        </div>

        <div className="relative p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">⚽</span>
            <h1 className="text-2xl-s font-display font-black tracking-tight">Fantasy</h1>
          </div>
          <p className="text-xs-s text-accent-on/80 mt-1">
            Armá tu plantel de 15. Elegí tu 11 y capitán por fecha.
          </p>

          {/* Stat strip */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <span className="text-2xl font-black tabular-nums leading-none">{totalPoints}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-on/70 mt-1.5">Puntos</span>
            </div>
            <div className="flex flex-col border-l border-accent-on/20 pl-3">
              <span className="text-2xl font-black tabular-nums leading-none">{myRank ? `#${myRank}` : '—'}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-on/70 mt-1.5">
                {myRank && totalTeams ? `de ${totalTeams}` : 'Ranking'}
              </span>
            </div>
            <div className="flex flex-col border-l border-accent-on/20 pl-3">
              <span className="text-2xl font-black tabular-nums leading-none">
                {squadPlayers.length}<span className="text-base font-bold text-accent-on/55">/15</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-on/70 mt-1.5">Plantel</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4">
        {([
          { id: 'team', label: 'Mi Equipo' },
          { id: 'standings', label: 'Tabla' },
          { id: 'guide', label: 'Guía' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs-s font-semibold transition-colors',
              tab === t.id
                ? 'bg-accent text-accent-on'
                : 'bg-card border border-border text-muted hover:text-text'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guide' && <FantasyGuide />}
      {tab === 'standings' && <FantasyStandings />}

      {tab === 'team' && (
        <>
          {/* If squad not complete yet, show picker first so user knows what to do */}
          {squadPlayers.length < 15 ? (
            <SquadPicker
              teams={teams}
              playersByTeam={playersByTeam}
              selectedPlayerIds={selectedPlayerIds}
              positionCounts={positionCounts}
              fantasyPointsById={fantasyPointsById}
              expandedTeam={expandedTeam}
              selectedPosition={selectedPosition}
              squadLocked={squadLocked}
              squadSaving={updateSquad.isPending}
              myLeagues={myLeagues}
              onTogglePlayer={handleTogglePlayer}
              onSave={handleSave}
              onSetExpandedTeam={setExpandedTeam}
              onSetPosition={setSelectedPosition}
            />
          ) : (
            <>
              {/* Lineup picker (11 starters + captain per round) */}
              <PerRoundLineupTab squadPlayers={squadPlayers} />
              {/* Squad management below — collapsed by default once squad is complete */}
              <SquadPicker
                teams={teams}
                playersByTeam={playersByTeam}
                selectedPlayerIds={selectedPlayerIds}
                positionCounts={positionCounts}
                fantasyPointsById={fantasyPointsById}
                expandedTeam={expandedTeam}
                selectedPosition={selectedPosition}
                squadLocked={squadLocked}
                squadSaving={updateSquad.isPending}
                myLeagues={myLeagues}
                onTogglePlayer={handleTogglePlayer}
                onSave={handleSave}
                onSetExpandedTeam={setExpandedTeam}
                onSetPosition={setSelectedPosition}
                collapsible
              />
            </>
          )}
        </>
      )}

    </div>
  );
}

// ─── Fantasy Guide ────────────────────────────────────────────────────────────

function GuideSection({
  emoji,
  title,
  children,
  defaultOpen = false,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <span className="flex-1 text-sm-s font-semibold text-text">{title}</span>
        <ChevronRight
          size={16}
          className={cn('text-muted transition-transform flex-shrink-0', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 flex flex-col gap-3 text-sm-s text-muted leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm-s text-muted">{label}</span>
      <span className={cn('text-sm-s font-bold', highlight ? 'text-accent' : value.startsWith('-') ? 'text-red-400' : 'text-green-400')}>
        {value}
      </span>
    </div>
  );
}


function FantasyGuide() {
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex items-center gap-2 py-1">
        <BookOpen size={16} className="text-accent" />
        <p className="text-sm-s font-bold text-text">¿Cómo funciona el Fantasy?</p>
      </div>

      {/* Intro */}
      <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">
        <p className="text-sm-s text-text leading-relaxed">
          El Fantasy del Mundialito es un juego en el que armás tu <span className="font-semibold">equipo de 15 jugadores reales</span> del Mundial FIFA 2026.
          Cada vez que tus jugadores actúan en un partido, ganás puntos según su rendimiento.
          Gana el que acumule más puntos al final del torneo.
        </p>
      </div>

      <GuideSection emoji="📋" title="Paso 1 — Armá tu plantel (15 jugadores)" defaultOpen>
        <p>Tu plantel tiene que tener exactamente <span className="text-text font-semibold">15 jugadores</span> con esta distribución obligatoria:</p>
        <div className="rounded-lg bg-elevated border border-border overflow-hidden">
          {[
            { pos: 'GK', label: 'Porteros',         count: '2',  color: 'text-yellow-400' },
            { pos: 'DEF', label: 'Defensores',       count: '5',  color: 'text-blue-400'   },
            { pos: 'MID', label: 'Mediocampistas',   count: '5',  color: 'text-green-400'  },
            { pos: 'FWD', label: 'Delanteros',       count: '3',  color: 'text-red-400'    },
          ].map(({ pos, label, count, color }) => (
            <div key={pos} className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0">
              <span className={cn('w-10 text-xs font-bold text-center px-1.5 py-0.5 rounded-full bg-elevated border border-border', color)}>{pos}</span>
              <span className="flex-1 text-sm-s text-text">{label}</span>
              <span className="text-sm-s font-bold text-text">{count}</span>
            </div>
          ))}
        </div>
        <p>En <span className="text-text font-semibold">Mi Equipo</span> expandís cada selección y tocás los jugadores para agregarlos.</p>
      </GuideSection>

      <GuideSection emoji="⭐" title="Paso 2 — Elegí tu 11 inicial por fecha">
        <p>De tus 15 jugadores, en cada <span className="text-text font-semibold">fecha del torneo</span> tenés que marcar <span className="text-text font-semibold">11 como titulares</span> y 4 quedan en el banco.</p>
        <div className="p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs-s font-semibold text-text mb-1">⚠️ Importante</p>
          <p className="text-xs-s">Solo los <span className="text-text font-semibold">titulares</span> de esa fecha suman puntos. Los suplentes no acumulan puntos por más goles que hagan.</p>
        </div>
        <p>En <span className="text-text font-semibold">Mi Equipo</span> configurás el 11 inicial por fecha — podés cambiarlo entre rondas para apostar a los jugadores que tienen partido.</p>
      </GuideSection>

      <GuideSection emoji="👑" title="Paso 3 — Elegí tu capitán y vicecapitán">
        <p>Entre los 11 titulares, elegí <span className="text-text font-semibold">1 capitán</span> y <span className="text-text font-semibold">1 vicecapitán</span> por fecha:</p>
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/30">
          <p className="text-sm-s font-bold text-accent text-center">Capitán suma DOBLE · Vicecapitán x1.5</p>
          <p className="text-xs-s text-muted text-center mt-0.5">Si tu capitán hace 6 pts vos recibís 12; tu vicecapitán los multiplica por 1.5.</p>
        </div>
        <p>Igual que el 11 inicial, el capitán y vice se eligen por fecha — apostá fuerte a quienes esperás que jueguen.</p>
      </GuideSection>

      <GuideSection emoji="📊" title="Sistema de puntuación por partido">
        <p>Cada vez que tus jugadores titulares juegan un partido del Mundial, suman o restan puntos según lo que hagan:</p>

        <div className="rounded-lg bg-elevated border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-card">
            <p className="text-xs-s font-bold text-muted uppercase tracking-wide">Puntos base</p>
          </div>
          <div className="px-3">
            <ScoreRow label="Jugar el partido" value="+2 pts" />
            <ScoreRow label="No jugar" value="0 pts" />
          </div>

          <div className="px-3 py-2 border-b border-border border-t bg-card">
            <p className="text-xs-s font-bold text-muted uppercase tracking-wide">Goles (por posición)</p>
          </div>
          <div className="px-3">
            <ScoreRow label="Gol de Portero" value="+6 pts" />
            <ScoreRow label="Gol de Defensor" value="+6 pts" />
            <ScoreRow label="Gol de Mediocampista" value="+5 pts" />
            <ScoreRow label="Gol de Delantero" value="+4 pts" />
          </div>

          <div className="px-3 py-2 border-b border-border border-t bg-card">
            <p className="text-xs-s font-bold text-muted uppercase tracking-wide">Otras acciones</p>
          </div>
          <div className="px-3">
            <ScoreRow label="Asistencia (cualquier posición)" value="+3 pts" />
            <ScoreRow label="Valla invicta — Portero o Defensor" value="+4 pts" />
            <ScoreRow label="Valla invicta — Mediocampista" value="+1 pt" />
            <ScoreRow label="Tarjeta amarilla" value="-1 pt" />
            <ScoreRow label="Tarjeta roja" value="-3 pts" />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-elevated border border-border">
          <p className="text-xs-s font-semibold text-text mb-1">¿Qué es valla invicta?</p>
          <p className="text-xs-s">El equipo del jugador no recibió ningún gol en ese partido. Los porteros y defensores suman puntos extra por mantener el arco en cero.</p>
        </div>
      </GuideSection>

      <GuideSection emoji="🏆" title="¿Cómo se acumulan los puntos?">
        <p>Los puntos se acumulan <span className="text-text font-semibold">automáticamente</span> a lo largo del torneo a medida que se juegan los partidos. No necesitás hacer nada — el sistema actualiza los puntos de tus jugadores después de cada partido.</p>
        <div className="flex flex-col gap-2">
          {[
            { emoji: '⚽', text: 'Fase de grupos: 3 partidos por equipo (11 jun – 2 jul)' },
            { emoji: '🔥', text: 'Ronda de 32 y Octavos: eliminación directa, cada partido cuenta' },
            { emoji: '🏅', text: 'Cuartos, Semis y Final (26 jun – 19 jul): los mejores jugadores suman en las etapas decisivas' },
          ].map(({ emoji, text }) => (
            <div key={text} className="flex items-start gap-2">
              <span className="flex-shrink-0">{emoji}</span>
              <p className="text-xs-s">{text}</p>
            </div>
          ))}
        </div>
        <p>Los jugadores que llegan más lejos en el torneo tienen más partidos para sumar puntos. Vale la pena elegir jugadores de selecciones fuertes.</p>
      </GuideSection>

      <GuideSection emoji="💡" title="Tips para armar un buen equipo">
        <div className="flex flex-col gap-2.5">
          {[
            { tip: 'Capitán goleador', desc: 'Elegí de capitán al delantero o mediocampista de una selección que esperes que avance lejos en el torneo.' },
            { tip: 'Defensores de selecciones sólidas', desc: 'Una selección que llegue a semis puede sumar varias vallas invictas. 4 pts × varios partidos = mucho.' },
            { tip: 'Distribuí por selecciones', desc: 'Si todos tus jugadores son del mismo equipo y esa selección pierde en octavos, tus puntos se cortan ahí.' },
            { tip: 'El capitán tiene que jugar', desc: 'Si tu capitán no juega un partido, perdés el doble bonus. Revisá antes de cada fecha.' },
          ].map(({ tip, desc }) => (
            <div key={tip} className="p-3 rounded-lg bg-elevated border border-border">
              <p className="text-xs-s font-semibold text-text mb-0.5">✅ {tip}</p>
              <p className="text-xs-s text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection emoji="❓" title="Preguntas frecuentes">
        <div className="flex flex-col gap-3">
          {[
            {
              q: '¿Puedo cambiar mi equipo después de armarlo?',
              a: 'Sí, podés modificar tu plantel, titulares y capitán hasta que empiece el torneo (11 de junio). Una vez que arrancan los partidos, los cambios pueden quedar bloqueados.',
            },
            {
              q: '¿Qué pasa si un jugador de mi equipo no juega ningún partido?',
              a: 'Si un jugador no fue convocado o no juega, suma 0 puntos en esos partidos. Si es tu capitán, perdés el bonus doble en esos partidos.',
            },
            {
              q: '¿Hace falta estar en una liga para jugar al Fantasy?',
              a: 'No. Tu equipo es global y compite automáticamente en la tabla general. Si te unís a una liga, también compite dentro de esa liga.',
            },
            {
              q: '¿Cuándo se actualizan los puntos?',
              a: 'Los puntos se actualizan automáticamente después de cada partido, cuando el admin carga las estadísticas de los jugadores.',
            },
            {
              q: '¿Qué es la valla invicta (clean sheet)?',
              a: 'Un equipo tiene valla invicta cuando termina un partido sin recibir ningún gol. Solo aplica si el jugador jugó ese partido.',
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-xs-s font-semibold text-text mb-1">🙋 {q}</p>
              <p className="text-xs-s text-muted">{a}</p>
            </div>
          ))}
        </div>
      </GuideSection>
    </div>
  );
}

// ─── Squad picker — choose the 15-player squad ──────────────────────────────

function SquadPicker({
  teams,
  playersByTeam,
  selectedPlayerIds,
  positionCounts,
  fantasyPointsById,
  expandedTeam,
  selectedPosition,
  squadLocked,
  squadSaving,
  myLeagues,
  onTogglePlayer,
  onSave,
  onSetExpandedTeam,
  onSetPosition,
  collapsible = false,
}: {
  teams: { id: number; name: string; code: string; flag: string | null; confederation: string | null }[];
  playersByTeam: Map<number, Player[]>;
  selectedPlayerIds: number[];
  positionCounts: Record<Position, number>;
  fantasyPointsById: Map<number, number>;
  expandedTeam: number | null;
  selectedPosition: PositionFilter;
  squadLocked: boolean;
  squadSaving: boolean;
  myLeagues: { id: number }[];
  onTogglePlayer: (player: Player) => void;
  onSave: () => void;
  onSetExpandedTeam: (id: number | null) => void;
  onSetPosition: (pos: PositionFilter) => void;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const total = selectedPlayerIds.length;
  const isDirty = total > 0; // parent tracks server vs local; here we just show save when >0 and not locked

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mx-4 rounded-xl bg-card border border-border flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm-s font-bold text-text">Mi plantel</p>
            <p className="text-xs-s text-muted mt-0.5">
              {(Object.entries(POSITION_LIMITS) as [Position, number][]).map(([pos, max]) =>
                `${pos} ${positionCounts[pos]}/${max}`
              ).join(' · ')}
            </p>
          </div>
          <ChevronDown size={16} className={cn('text-muted transition-transform flex-shrink-0', open && 'rotate-180')} />
        </button>
      ) : (
        <div className="mx-4 flex items-center gap-2">
          <p className="flex-1 text-xs-s font-bold text-muted uppercase tracking-wider">
            Plantel ({total}/{MAX_SQUAD})
          </p>
          {(Object.entries(POSITION_LIMITS) as [Position, number][]).map(([pos, max]) => (
            <span
              key={pos}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-bold',
                positionCounts[pos] >= max ? 'bg-accent/20 text-accent' : 'bg-elevated text-muted',
              )}
            >
              {pos} {positionCounts[pos]}/{max}
            </span>
          ))}
        </div>
      )}

      {open && (
        <>
          {/* Locked banner */}
          {squadLocked && (
            <div className="mx-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
              <Lock size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs-s text-amber-700 dark:text-amber-300 leading-snug">
                El plantel está cerrado desde el inicio del torneo. Podés cambiar tu 11 inicial y capitán por fecha en la cancha de arriba.
              </p>
            </div>
          )}

          {/* League note */}
          {myLeagues.length > 0 && (
            <p className="mx-4 text-xs-s text-muted/70 flex items-center gap-1.5">
              <Trophy size={11} className="text-accent flex-shrink-0" />
              Tu equipo cuenta en {myLeagues.length === 1 ? 'tu liga' : `tus ${myLeagues.length} ligas`} automáticamente.
            </p>
          )}

          {/* Position filter */}
          <div className="flex gap-2 px-4 overflow-x-auto pb-1 no-scrollbar">
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => onSetPosition(pos)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs-s font-semibold whitespace-nowrap transition-colors',
                  selectedPosition === pos ? 'bg-accent text-accent-on' : 'bg-card border border-border text-muted',
                )}
              >
                {pos}
              </button>
            ))}
          </div>

          {/* Teams accordion */}
          <div className="flex flex-col gap-2 px-4">
            {teams.map((team) => {
              const teamPlayers = (playersByTeam.get(team.id) ?? []).filter(
                (p) => selectedPosition === 'Todo' || p.position === selectedPosition,
              );
              if (selectedPosition !== 'Todo' && teamPlayers.length === 0) return null;

              const selectedInTeam = teamPlayers.filter((p) => selectedPlayerIds.includes(p.id)).length;

              return (
                <div key={team.id} className="rounded-xl bg-card border border-border overflow-hidden">
                  <button
                    onClick={() => onSetExpandedTeam(expandedTeam === team.id ? null : team.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5"
                  >
                    <TeamFlag code={team.code} emoji={team.flag ?? undefined} size={24} />
                    <span className="flex-1 text-left text-sm-s font-semibold text-text">{team.name}</span>
                    {selectedInTeam > 0 && (
                      <span className="text-xs-s font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                        {selectedInTeam} ✓
                      </span>
                    )}
                    <ChevronDown
                      size={15}
                      className={cn('text-muted transition-transform flex-shrink-0', expandedTeam === team.id && 'rotate-180')}
                    />
                  </button>

                  {expandedTeam === team.id && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="border-t border-border"
                    >
                      <ul>
                        {teamPlayers.map((player, idx) => {
                          const isSelected = selectedPlayerIds.includes(player.id);
                          const pts = fantasyPointsById.get(player.id);
                          return (
                            <li key={player.id} className={cn(idx < teamPlayers.length - 1 && 'border-b border-border')}>
                              <button
                                disabled={squadLocked && !isSelected}
                                onClick={() => onTogglePlayer(player)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                                  isSelected ? 'bg-accent/10' : 'hover:bg-muted/5',
                                  squadLocked && !isSelected && 'opacity-40 cursor-not-allowed',
                                )}
                              >
                                <span className={cn(
                                  'flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
                                  isSelected ? 'bg-accent border-accent' : 'border-border',
                                )}>
                                  {isSelected && <Check size={12} className="text-accent-on" strokeWidth={3} />}
                                </span>
                                <PlayerAvatar photoUrl={player.photoUrl} name={player.name} position={player.position} />
                                <span className="flex-1 text-sm-s font-medium text-text">{player.name}</span>
                                {isSelected && pts != null && (
                                  <span className="text-xs-s font-bold text-accent">{pts} pts</span>
                                )}
                                {player.shirtNumber != null && (
                                  <span className="text-xs-s text-muted w-5 text-right">#{player.shirtNumber}</span>
                                )}
                                <span className={cn('text-xs-s font-bold px-2 py-0.5 rounded-full', POSITION_COLORS[player.position])}>
                                  {player.position}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Save button — only when dirty and not locked */}
          {!squadLocked && isDirty && (
            <div className="px-4">
              <button
                onClick={onSave}
                disabled={squadSaving || total < MAX_SQUAD}
                className="w-full py-3.5 rounded-xl bg-accent text-accent-on font-bold text-sm-s shadow-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              >
                {squadSaving
                  ? 'Guardando...'
                  : total < MAX_SQUAD
                    ? `Elegí ${MAX_SQUAD - total} jugador${MAX_SQUAD - total === 1 ? '' : 'es'} más`
                    : 'Guardar plantel'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Lineup tab — pick 11 starters + captain ─────────────────────────────────

// ─── Per-round lineup tab (NEW) ──────────────────────────────────────────────

function PerRoundLineupTab({ squadPlayers }: { squadPlayers: Player[] }) {
  const { data: roundsData, isLoading: roundsLoading } = useFantasyRounds();
  const rounds = roundsData?.data ?? [];
  const currentRound = rounds.find((r) => r.isCurrent) ?? rounds.find((r) => r.isOpen) ?? null;
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [lineupView, setLineupView] = useState<'pitch' | 'list'>('pitch');

  // Auto-select the current open round on load.
  useEffect(() => {
    if (selectedRound === null && currentRound) {
      setSelectedRound(currentRound.slug);
    }
  }, [currentRound, selectedRound]);

  const activeSlug = selectedRound ?? currentRound?.slug ?? null;
  const { data: lineupData, isLoading: lineupLoading } = useFantasyLineup(activeSlug);
  const upsertLineup = useUpsertLineup();

  // Local draft: playerIds with flags.
  const [draft, setDraft] = useState<LineupPlayerInput[]>([]);
  const [dirty, setDirty] = useState(false);

  // Stable key for the squad so the draft-init effect only re-fires when the
  // squad ACTUALLY changes (15 different player ids), not on every parent
  // re-render. Previously this was the root cause of "I unselect a player
  // and it pops back" — every parent render reset the draft to bench.
  const squadKey = useMemo(
    () => [...squadPlayers.map((p) => p.id)].sort((a, b) => a - b).join(','),
    [squadPlayers],
  );

  // Populate draft from server data when the round (or the squad itself)
  // changes. Local edits afterwards are preserved.
  //
  // The draft is ALWAYS built from the current 15-player squad, with the
  // server lineup overlayed on top. This is intentional: if the user saved
  // a lineup back when their squad was different (e.g. before adding a
  // player, or under an earlier bug that wrote partial rows), we still want
  // them to see all 15 current squad players — the missing ones simply
  // appear as bench. Otherwise the Titulares list would render only those
  // 9-10 stale rows and leave the user unable to even pick the new players.
  useEffect(() => {
    if (!activeSlug || squadPlayers.length === 0) return;
    const lineupByPlayer = new Map(
      (lineupData?.data ?? []).map((r) => [r.playerId, r]),
    );
    setDraft(
      squadPlayers.map((p) => {
        const saved = lineupByPlayer.get(p.id);
        return {
          playerId: p.id,
          isStarter: saved?.isStarter ?? false,
          isCaptain: saved?.isCaptain ?? false,
          isViceCaptain: saved?.isViceCaptain ?? false,
        };
      }),
    );
    setDirty(false);
    // squadKey (stable) deliberately replaces squadPlayers (unstable ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupData, activeSlug, squadKey]);

  const starterCount = draft.filter((p) => p.isStarter).length;
  const captainPicked = draft.some((p) => p.isCaptain);
  const vicePicked = draft.some((p) => p.isViceCaptain);
  const roundInfo = rounds.find((r) => r.slug === activeSlug);
  const isOpen = roundInfo?.isOpen ?? false;

  function toggle(playerId: number) {
    if (!isOpen) return;
    setDraft((prev) => {
      const cur = prev.find((p) => p.playerId === playerId);
      if (!cur) return prev;
      const willBeStarter = !cur.isStarter;
      const currentStarters = prev.filter((p) => p.isStarter).length;
      // Hard cap at 11 starters so the backend never rejects on count.
      if (willBeStarter && currentStarters >= 11) {
        toast.error('Solo podés tener 11 titulares — sacá uno antes de agregar otro');
        return prev;
      }
      // When de-starring a player, also strip captain/vice if they had it.
      return prev.map((p) =>
        p.playerId === playerId
          ? {
              ...p,
              isStarter: willBeStarter,
              isCaptain: willBeStarter ? p.isCaptain : false,
              isViceCaptain: willBeStarter ? p.isViceCaptain : false,
            }
          : p,
      );
    });
    setDirty(true);
  }

  function setCaptain(playerId: number) {
    if (!isOpen) return;
    setDraft((prev) => prev.map((p) => ({
      ...p,
      isCaptain: p.playerId === playerId,
      isViceCaptain: p.isViceCaptain && p.playerId !== playerId,
    })));
    setDirty(true);
  }

  function setVice(playerId: number) {
    if (!isOpen) return;
    setDraft((prev) => prev.map((p) => ({
      ...p,
      isViceCaptain: p.playerId === playerId,
      isCaptain: p.isCaptain && p.playerId !== playerId,
    })));
    setDirty(true);
  }

  async function handleSave() {
    if (!activeSlug) return;
    try {
      await upsertLineup.mutateAsync({ round: activeSlug, players: draft });
      toast.success('¡Lineup guardado!');
      play('chime');
      setDirty(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message ?? 'Error al guardar';
      toast.error(msg);
    }
  }

  const squadById = useMemo(() => new Map(squadPlayers.map((p) => [p.id, p])), [squadPlayers]);
  const ORDER = ['GK', 'DEF', 'MID', 'FWD'];
  // Both starters and bench are sorted by position then shirt number so the
  // list rhythm matches an actual team sheet (GK on top, FWDs at the bottom)
  // instead of insertion order from the squad.
  const sortByPositionThenShirt = (a: LineupPlayerInput, b: LineupPlayerInput) => {
    const pa = squadById.get(a.playerId);
    const pb = squadById.get(b.playerId);
    const dp = ORDER.indexOf(pa?.position ?? '') - ORDER.indexOf(pb?.position ?? '');
    if (dp !== 0) return dp;
    const sa = pa?.shirtNumber ?? 999;
    const sb = pb?.shirtNumber ?? 999;
    if (sa !== sb) return sa - sb;
    return (pa?.name ?? '').localeCompare(pb?.name ?? '');
  };
  const starters = draft.filter((p) => p.isStarter).sort(sortByPositionThenShirt);
  const bench = draft.filter((p) => !p.isStarter).sort(sortByPositionThenShirt);

  if (roundsLoading) return <div className="px-4 mt-4"><SkeletonList count={5} /></div>;
  if (squadPlayers.length < 15) {
    return (
      <div className="mx-4 mt-4 p-4 rounded-xl bg-card border border-border text-center flex flex-col items-center gap-3">
        <span className="text-2xl">🧩</span>
        <p className="text-sm-s font-semibold text-text">Primero armá tu plantel de 15</p>
        <p className="text-xs-s text-muted">Elegí 15 jugadores en la pestaña Plantel antes de configurar el lineup por fecha.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Round selector */}
      <div className="px-4">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {rounds.map((r) => (
            <button
              key={r.slug}
              onClick={() => setSelectedRound(r.slug)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs-s font-semibold border transition-colors',
                activeSlug === r.slug ? 'bg-accent text-accent-on border-accent' : 'bg-elevated border-border text-muted',
                !r.isOpen && activeSlug !== r.slug && 'opacity-60',
              )}
            >
              {!r.isOpen && <Lock size={10} />}
              {shortRoundLabel(r.label)}
              {r.isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </button>
          ))}
        </div>
      </div>

      {/* Deadline info */}
      {roundInfo && (
        <div className={cn(
          'mx-4 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs-s',
          isOpen
            ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300'
            : 'bg-elevated border-border text-muted',
        )}>
          {isOpen ? <CheckCircle2 size={14} /> : <Lock size={14} />}
          {isOpen
            ? `Deadline: ${new Date(roundInfo.deadline).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}`
            : `Cerrado · ${lineupData?.meta.points ?? 0} pts en esta fecha`
          }
        </div>
      )}

      {lineupLoading ? (
        <div className="px-4"><SkeletonList count={11} /></div>
      ) : (
        <>
          {/* View toggle — pitch (default) vs list */}
          <div className="px-4 flex items-center justify-between">
            <p className="text-xs-s text-muted font-semibold uppercase tracking-wider">
              Titulares ({starterCount}/11)
              {!captainPicked && starterCount > 0 && isOpen && <span className="text-orange-400 ml-2">· Capitán</span>}
              {!vicePicked && starterCount > 0 && isOpen && <span className="text-orange-400 ml-1">+ Vice</span>}
            </p>
            <div className="flex p-0.5 rounded-lg bg-elevated border border-border">
              <button
                onClick={() => setLineupView('pitch')}
                className={cn('px-2 py-1 rounded text-[10px] font-bold transition-colors', lineupView === 'pitch' ? 'bg-accent text-accent-on' : 'text-muted')}
              >
                Cancha
              </button>
              <button
                onClick={() => setLineupView('list')}
                className={cn('px-2 py-1 rounded text-[10px] font-bold transition-colors', lineupView === 'list' ? 'bg-accent text-accent-on' : 'text-muted')}
              >
                Lista
              </button>
            </div>
          </div>

          {lineupView === 'pitch' ? (
            <LineupPitch
              players={draft.map((d) => {
                const p = squadById.get(d.playerId)!;
                return {
                  id: p.id,
                  name: p.name,
                  position: p.position as Position,
                  subPosition: (p as { subPosition?: string | null }).subPosition ?? null,
                  photoUrl: p.photoUrl ?? null,
                  shirtNumber: p.shirtNumber ?? null,
                  isStarter: d.isStarter,
                  isCaptain: d.isCaptain,
                  isViceCaptain: d.isViceCaptain,
                };
              }).filter((p) => squadById.has(p.id))}
              isOpen={isOpen}
              onToggleStarter={toggle}
              onSetCaptain={setCaptain}
              onSetVice={setVice}
            />
          ) : (
            <>
              {/* Starters list */}
              <div className="px-4">
                <div className="flex flex-col gap-1.5">
                  {starters.map((row) => {
                    const p = squadById.get(row.playerId);
                    if (!p) return null;
                    return (
                      <LineupRow
                        key={row.playerId}
                        player={p}
                        isStarter
                        isCaptain={row.isCaptain}
                        isViceCaptain={row.isViceCaptain}
                        isOpen={isOpen}
                        onToggle={() => toggle(row.playerId)}
                        onCaptain={() => setCaptain(row.playerId)}
                        onVice={() => setVice(row.playerId)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Bench list */}
              <div className="px-4">
                <p className="text-xs-s text-muted mb-2 font-semibold uppercase tracking-wider">
                  Suplentes ({bench.length})
                </p>
                <div className="flex flex-col gap-1.5 opacity-60">
                  {bench.map((row) => {
                    const p = squadById.get(row.playerId);
                    if (!p) return null;
                    return (
                      <LineupRow
                        key={row.playerId}
                        player={p}
                        isStarter={false}
                        isCaptain={false}
                        isViceCaptain={false}
                        isOpen={isOpen}
                        onToggle={() => toggle(row.playerId)}
                        onCaptain={undefined}
                        onVice={undefined}
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Save — sticky above the mobile tab bar (bottom-24 on mobile,
              regular on desktop). Only renders when there's actually
              something to do: either the user has unsaved changes OR the
              current draft is invalid (wrong starter count, missing
              captain, etc.). When everything matches the server, the
              button hides completely so it doesn't sit there asking to
              save a no-op. */}
          {(() => {
            if (!isOpen) return null;
            let blocker: string | null = null;
            if (starterCount < 11) blocker = `Faltan ${11 - starterCount} titular${11 - starterCount === 1 ? '' : 'es'}`;
            else if (starterCount > 11) blocker = `Sobran ${starterCount - 11} titular${starterCount - 11 === 1 ? '' : 'es'}`;
            else if (!captainPicked) blocker = 'Elegí un capitán (C)';
            else if (!vicePicked) blocker = 'Elegí un vicecapitán (V)';

            // Nothing pending → don't render anything at all. This is the
            // fix for 'el cartel aparece siempre aunque no haga cambios'.
            if (!dirty && blocker === null) return null;

            return (
              <div className="px-4 sticky z-10 bottom-24 md:bottom-4">
                <button
                  onClick={handleSave}
                  disabled={upsertLineup.isPending || blocker !== null}
                  className="w-full py-3 rounded-xl bg-accent text-accent-on font-semibold text-sm-s disabled:opacity-50 transition-opacity shadow-lg"
                >
                  {upsertLineup.isPending
                    ? 'Guardando…'
                    : blocker
                      ? blocker
                      : `Guardar lineup de ${roundInfo?.label ?? 'esta fecha'}`}
                </button>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

/**
 * Mini badge strip — shows goal/assist/clean-sheet/card icons and total
 * points for a closed round. Shown beneath the player name in list view.
 */
function BreakdownBadges({
  breakdown,
  isCaptain,
  isViceCaptain,
}: {
  breakdown: FantasyPlayerBreakdown;
  isCaptain: boolean;
  isViceCaptain: boolean;
}) {
  const badges: React.ReactNode[] = [];

  if (!breakdown.played) {
    badges.push(
      <span key="dnp" className="text-[10px] text-muted italic">No jugó</span>,
    );
  } else {
    for (let i = 0; i < breakdown.goals; i++) {
      badges.push(
        <span key={`g${i}`} className="text-[12px]" aria-label="Gol">⚽</span>,
      );
    }
    for (let i = 0; i < breakdown.assists; i++) {
      badges.push(
        <Handshake key={`a${i}`} size={11} className="text-blue-400" aria-label="Asistencia" />,
      );
    }
    if (breakdown.cleanSheet) {
      badges.push(
        <Shield key="cs" size={11} className="text-emerald-400" aria-label="Valla invicta" />,
      );
    }
    for (let i = 0; i < breakdown.yellowCards; i++) {
      badges.push(
        <span
          key={`y${i}`}
          className="inline-block w-[8px] h-[11px] rounded-[1px] bg-yellow-400 flex-shrink-0"
          aria-label="Amarilla"
        />,
      );
    }
    if (breakdown.redCard) {
      badges.push(
        <span
          key="red"
          className="inline-block w-[8px] h-[11px] rounded-[1px] bg-red-500 flex-shrink-0"
          aria-label="Roja"
        />,
      );
    }
  }

  const multiplierLabel = isCaptain ? '×2' : isViceCaptain ? '×1.5' : null;

  return (
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      {badges}
      {badges.length > 0 && breakdown.played && <span className="text-muted text-[10px]">·</span>}
      <span className={cn(
        'text-[11px] font-bold tabular-nums',
        breakdown.totalPoints > 0 ? 'text-accent' : breakdown.totalPoints < 0 ? 'text-red-400' : 'text-muted',
      )}>
        {breakdown.totalPoints > 0 ? '+' : ''}{breakdown.totalPoints} pts
      </span>
      {multiplierLabel && (
        <span className={cn(
          'text-[10px] font-black px-1 py-px rounded-full',
          isCaptain ? 'bg-yellow-400/20 text-yellow-400' : 'bg-slate-300/20 text-slate-300',
        )}>
          {multiplierLabel}
        </span>
      )}
    </div>
  );
}

function LineupRow({
  player,
  isStarter,
  isCaptain,
  isViceCaptain,
  isOpen,
  onToggle,
  onCaptain,
  onVice,
  breakdown,
}: {
  player: Player;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onCaptain: (() => void) | undefined;
  onVice: (() => void) | undefined;
  breakdown?: FantasyPlayerBreakdown | null;
}) {
  const showBreakdown = !isOpen && isStarter && breakdown != null;
  return (
    <div className={cn(
      'flex items-center gap-2.5 p-2.5 rounded-xl border bg-card transition-colors',
      // Accent border + faint glow so a row reads as "starter" at a glance
      // even before checking the checkbox state. Captain/Vice get a stronger
      // ring on top of that.
      isStarter
        ? isCaptain
          ? 'border-yellow-400/60 ring-1 ring-yellow-400/30 bg-yellow-400/[0.04]'
          : isViceCaptain
            ? 'border-slate-300/60 ring-1 ring-slate-300/30'
            : 'border-accent/40'
        : 'border-border',
    )}>
      <button
        type="button"
        disabled={!isOpen}
        onClick={onToggle}
        aria-label={isStarter ? 'Quitar de titulares' : 'Marcar titular'}
        className={cn(
          'w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors',
          isStarter ? 'bg-accent border-accent text-accent-on' : 'bg-elevated border-border',
        )}
      >
        {isStarter && <Check size={13} strokeWidth={3} />}
      </button>
      {/* Player avatar — photo when available, position-coloured shirt as
          fallback. Same component the pitch view uses for visual consistency. */}
      <PlayerAvatar
        photoUrl={player.photoUrl ?? null}
        name={player.name}
        position={player.position}
      />
      <span
        className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0',
          POSITION_COLORS[player.position],
        )}
      >
        {player.position}
      </span>
      {/* Name + optional breakdown strip */}
      <div className="flex-1 min-w-0">
        <span className="block text-sm-s font-semibold text-text truncate">{player.name}</span>
        {showBreakdown && (
          <BreakdownBadges
            breakdown={breakdown}
            isCaptain={isCaptain}
            isViceCaptain={isViceCaptain}
          />
        )}
      </div>
      {isStarter && onCaptain && (
        <button
          type="button"
          onClick={onCaptain}
          aria-label={isCaptain ? 'Capitán' : 'Marcar capitán'}
          className={cn(
            'w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 transition-all',
            isCaptain
              ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/40 scale-105'
              : 'bg-elevated border border-border text-muted hover:border-yellow-400/60',
          )}
          title="Capitán (x2 puntos)"
        >C</button>
      )}
      {isStarter && onVice && (
        <button
          type="button"
          onClick={onVice}
          aria-label={isViceCaptain ? 'Vicecapitán' : 'Marcar vicecapitán'}
          className={cn(
            'w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 transition-all',
            isViceCaptain
              ? 'bg-slate-300 text-black shadow-md shadow-slate-400/40 scale-105'
              : 'bg-elevated border border-border text-muted hover:border-slate-300/60',
          )}
          title="Vicecapitán (x1.5 puntos)"
        >V</button>
      )}
      {/* Closed round: show captain/vice badge (read-only) */}
      {!isOpen && isStarter && isCaptain && (
        <span className="w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 bg-yellow-400 text-black">
          C
        </span>
      )}
      {!isOpen && isStarter && isViceCaptain && (
        <span className="w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 bg-slate-300 text-black">
          V
        </span>
      )}
    </div>
  );
}

// ─── User fantasy team drawer ────────────────────────────────────────────────

/** Acorta el label canónico del round (ej: "Octavos de final" → "Octavos")
 *  para que entren todos los chips en una sola línea en mobile. */
function shortRoundLabel(label: string): string {
  return label
    .replace('Grupos — ', '')
    .replace('Ronda de 32', 'R32')
    .replace('Octavos de final', 'Octavos')
    .replace('Cuartos de final', 'Cuartos')
    .replace('Semifinales', 'Semis')
    .replace('Final y 3er puesto', 'Final');
}

function UserTeamDrawer({
  userId,
  username,
  teamName,
  onClose,
}: {
  userId: number;
  username: string;
  teamName: string;
  onClose: () => void;
}) {
  const dragControls = useDragControls();
  // Selector de fecha — permite ver el lineup que el usuario armó en
  // cualquier fecha del torneo (no sólo la activa).
  const { data: roundsData } = useFantasyRounds();
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  const { data, isLoading } = useUserFantasyTeam(userId, selectedRound);
  // Puntos por round del usuario — alimenta el badge debajo de cada tab.
  const { data: pointsByRoundData } = useUserFantasyPointsByRound(userId);
  const pointsByRound = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of pointsByRoundData ?? []) map.set(r.round, r.points);
    return map;
  }, [pointsByRoundData]);
  const squad = data?.squad ?? [];
  const effectiveRound = data?.round ?? selectedRound ?? roundsData?.meta.currentRound ?? null;

  const starters = squad.filter((p) => p.isStarter);
  const bench = squad.filter((p) => !p.isStarter);
  const captain = squad.find((p) => p.isCaptain);
  const viceCaptain = squad.find((p) => p.isViceCaptain);
  const totalPoints = data?.team?.totalPoints ?? 0;

  const ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  const byPosition = ORDER.map((pos) => ({
    pos,
    players: starters.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Sheet — el sheet entero es el que se mueve, pero el drag SOLO se
          inicia desde el handle/header (dragListener={false} + dragControls).
          Así el body (lista) sigue siendo scrolleable con touch normal. */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) onClose();
        }}
        className="relative z-10 w-full max-w-lg bg-card rounded-t-2xl border-t border-border h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + Header (única zona que inicia el drag — el sheet entero
            se mueve). touch-none evita que el browser robe el gesto. */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="px-5 pb-3 border-b border-border flex items-center gap-3">
            <Trophy size={18} className="text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm-s font-bold text-text truncate">{teamName}</p>
              <p className="text-xs-s text-muted truncate">{username}</p>
            </div>
            <span className="text-lg font-bold text-accent">{totalPoints} pts</span>
          </div>
        </div>

        {/* Tabs por fecha — muestra los rounds del torneo para ver el 11
            que armó el usuario en cada uno. Cada chip muestra labels cortos
            (Octavos, Cuartos, Semis, Final) y los pts del usuario en esa
            fecha. Marca con dot el round activo del torneo. */}
        {roundsData && roundsData.data.length > 0 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-3 py-2 border-b border-border flex-shrink-0">
            {roundsData.data.map((r) => {
              const active = effectiveRound === r.slug;
              const pts = pointsByRound.get(r.slug);
              const hasPts = pts != null && pts > 0;
              return (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => setSelectedRound(r.slug)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 text-xs-s font-semibold px-3 py-1.5 rounded-full transition-colors',
                    active
                      ? 'bg-accent text-accent-on'
                      : 'bg-elevated text-muted hover:text-text',
                  )}
                >
                  <span>{shortRoundLabel(r.label)}</span>
                  {hasPts && (
                    <span
                      className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                        active
                          ? 'bg-accent-on/20 text-accent-on'
                          : 'bg-accent/15 text-accent',
                      )}
                    >
                      {pts}
                    </span>
                  )}
                  {r.isCurrent && !active && <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Body — scroll interno. min-h-0 es necesario para que flex-1 +
            overflow-y-auto se comporten en mobile (sin él el contenedor
            crece más allá del max-h del padre y el scroll no aparece). */}
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 pb-6">
          {isLoading ? (
            <div className="py-8"><SkeletonList count={5} /></div>
          ) : squad.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2">
              <Trophy size={32} className="text-muted opacity-30" />
              <p className="text-sm-s text-muted">Este usuario aún no armó su equipo</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pt-3">
              {/* Starters */}
              <div>
                <p className="text-xs-s font-bold text-muted uppercase tracking-wide mb-2">Titulares</p>
                <div className="rounded-xl bg-elevated border border-border overflow-hidden">
                  {byPosition.map(({ pos, players }) => (
                    <div key={pos}>
                      <div className="px-3 py-1.5 border-b border-border bg-card flex items-center gap-2">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', POSITION_COLORS[pos])}>
                          {pos}
                        </span>
                      </div>
                      {players.map((p, idx) => {
                        const isCap = p.isCaptain;
                        const isVice = p.isViceCaptain;
                        const isLast = idx === players.length - 1;
                        return (
                          <div
                            key={p.id}
                            className={cn('flex items-center gap-3 px-3 py-2.5', !isLast && 'border-b border-border/50')}
                          >
                            <PlayerAvatar photoUrl={p.photoUrl} name={p.name} position={p.position} />
                            <span className="flex-1 text-sm-s font-medium text-text truncate">{p.name}</span>
                            {isCap && (
                              <span className="flex items-center gap-1 text-xs-s font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full flex-shrink-0">
                                <Crown size={10} /> CAP
                              </span>
                            )}
                            {isVice && (
                              <span className="flex items-center gap-1 text-xs-s font-bold text-slate-600 dark:text-slate-300 bg-slate-400/15 border border-slate-400/30 px-2 py-0.5 rounded-full flex-shrink-0">
                                <Shield size={10} /> VICE
                              </span>
                            )}
                            <span className="text-xs-s font-bold text-accent w-10 text-right flex-shrink-0">
                              {p.fantasyPoints} pts
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bench */}
              {bench.length > 0 && (
                <div>
                  <p className="text-xs-s font-bold text-muted uppercase tracking-wide mb-2">Suplentes</p>
                  <div className="rounded-xl bg-elevated border border-border overflow-hidden">
                    {bench.map((p, idx) => (
                      <div
                        key={p.id}
                        className={cn('flex items-center gap-3 px-3 py-2.5 opacity-50', idx < bench.length - 1 && 'border-b border-border/50')}
                      >
                        <PlayerAvatar photoUrl={p.photoUrl} name={p.name} position={p.position} />
                        <span className="flex-1 text-sm-s font-medium text-text truncate">{p.name}</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', POSITION_COLORS[p.position])}>
                          {p.position}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {captain && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-center gap-3">
                  <Crown size={16} className="text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs-s text-muted">Capitán</p>
                    <p className="text-sm-s font-bold text-text truncate">{captain.name}</p>
                  </div>
                  <span className="text-xs-s font-bold text-accent">×2 pts</span>
                </div>
              )}

              {viceCaptain && (
                <div className="p-3 rounded-xl bg-slate-400/10 border border-slate-400/20 flex items-center gap-3">
                  <Shield size={16} className="text-slate-600 dark:text-slate-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs-s text-muted">Vicecapitán</p>
                    <p className="text-sm-s font-bold text-text truncate">{viceCaptain.name}</p>
                  </div>
                  <span className="text-xs-s font-bold text-slate-600 dark:text-slate-300">×1.5 pts</span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Fantasy standings tab ───────────────────────────────────────────────────

function FantasyStandings() {
  const { data, isLoading } = useFantasyStandings();
  const currentUser = useAuthStore((s) => s.user);
  const entries = data ?? [];
  const [viewingUser, setViewingUser] = useState<{ userId: number; username: string; teamName: string } | null>(null);

  if (isLoading) {
    return (
      <div className="px-4">
        <SkeletonList count={8} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mx-4 flex flex-col items-center py-16 gap-3">
        <BarChart2 size={40} className="text-muted opacity-40" />
        <p className="text-sm-s text-muted">Todavía no hay posiciones fantasy</p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-4 rounded-xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-elevated">
          <span className="w-7 text-center text-xs-s text-muted">#</span>
          <span className="w-8 flex-shrink-0" />
          <span className="flex-1 text-xs-s text-muted">Equipo</span>
          <span className="text-xs-s text-muted">Pts</span>
        </div>
        {entries.map((entry) => {
          const isMe = entry.userId === currentUser?.id;
          const initials = entry.username.slice(0, 1).toUpperCase();
          return (
            <motion.button
              key={entry.userId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(entry.rank, 20) * 0.02 }}
              onClick={() => setViewingUser({ userId: entry.userId, username: entry.username, teamName: entry.teamName })}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 text-left transition-colors hover:bg-elevated',
                isMe && 'bg-accent-soft hover:bg-accent-soft'
              )}
            >
              <span className={cn('w-7 text-center text-sm-s font-bold', isMe ? 'text-accent' : 'text-muted')}>
                {entry.rank}
              </span>
              <div className="w-8 h-8 rounded-full bg-elevated border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                {entry.avatarUrl ? (
                  <img src={entry.avatarUrl} alt={entry.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm-s font-bold text-text">{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm-s font-semibold truncate', isMe ? 'text-accent' : 'text-text')}>
                  {entry.teamName} {isMe && '(vos)'}
                </p>
                <p className="text-xs-s text-muted truncate">{entry.username}</p>
              </div>
              <span className={cn('text-base-s font-bold', isMe ? 'text-accent' : 'text-text')}>
                {entry.totalPoints}
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="text-center text-xs-s text-muted/50 mt-2">Tocá un equipo para ver su plantel</p>

      {viewingUser && (
        <UserTeamDrawer
          userId={viewingUser.userId}
          username={viewingUser.username}
          teamName={viewingUser.teamName}
          onClose={() => setViewingUser(null)}
        />
      )}
    </>
  );
}
