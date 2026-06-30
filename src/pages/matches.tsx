import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronDown, Clock, CheckCircle2, Check, X, Minus } from 'lucide-react';
import { staggerContainer, staggerItem, useMotionPrefs } from '@/shared/lib/motion';
import { useMatches } from '@/shared/hooks/use-matches';
import { useTeams, useTeamMap } from '@/shared/hooks/use-teams';
import { useMyPredictions } from '@/shared/hooks/use-predictions';
import { useMyLeagues } from '@/shared/hooks/use-leagues';
import { ROUND_LABELS } from '@/shared/data/mock';
import { useTournamentPhase } from '@/shared/hooks/use-tournament-phase';
import { KnockoutPhaseBanner } from '@/shared/components/knockout-phase-banner';
import type { Match, Team } from '@/shared/types/api';
import { TeamFlag } from '@/shared/components/ui/team-flag';
import { GroupStandings } from '@/shared/components/group-standings';
import { ThirdPlaceTable } from '@/shared/components/third-place-table';
import { BracketView } from '@/shared/components/bracket-view';
import { R32_LABELS } from '@/shared/data/bracket';
import { computeBracketProjection, resolveAdvancingSlot } from '@/shared/lib/bracket-projection';
import { cn } from '@/shared/lib/cn';
import { SkeletonList } from '@/shared/components/skeleton';

function formatDate(localKey: string) {
  // localKey viene en YYYY-MM-DD (fecha local del dispositivo, ya calculada
  // en groupByDate). Lo parseamos como fecha local — sin convertir a UTC —
  // para que no se "corra" un día al renderizar.
  const [y, m, d] = localKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(utc: string) {
  const d = new Date(utc);
  // Usa la timezone del dispositivo — los usuarios viven en distintos países
  // de LATAM, fijar Buenos Aires daba horarios incorrectos a todos los demás.
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Clave YYYY-MM-DD en la zona horaria LOCAL del dispositivo (no UTC), para
 *  que un partido de las 22 h MX no se contabilice bajo el día siguiente. */
function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupByDate(matches: Match[]) {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    // Agrupar por la fecha LOCAL del dispositivo, no por la fecha UTC, para
    // que un partido de las 22 h MX no aparezca bajo el día siguiente.
    const key = localDateKey(new Date(m.kickoffUtc));
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}

const PLACEHOLDER_TEAM: Team = {
  id: 0,
  code: '???',
  flag: '🏳️',
  name: 'Cargando...',
  group: null,
  confederation: null,
};

/** Un equipo "real" es uno ya definido en la DB — no el placeholder TBD que
 *  ocupa los cruces de eliminación todavía sin resolver, ni el '???' que se
 *  muestra mientras el endpoint /teams no trajo (o no incluye) al TBD. */
function isRealTeam(team: Team): boolean {
  return team.id > 0 && team.code !== 'TBD' && team.code !== '???';
}

/** Label del slot del cuadro para un lado de un partido de eliminación todavía
 *  sin definir (ej. "1° Grp A", "Mejor 3ro"), o "Por definir" como último
 *  recurso. NO devuelve el placeholder crudo ('???'/'TBD'). */
function slotLabelFor(matchNumber: number, side: 'home' | 'away'): string {
  return R32_LABELS[matchNumber]?.[side] ?? 'Por definir';
}

/** Renderiza un lado (home/away) de un partido en la lista. Tres casos:
 *  1) equipo real en la DB → bandera + código.
 *  2) cruce de eliminación sin definir pero proyectado por el cuadro → bandera +
 *     código (atenuado).
 *  3) sin proyección → label del slot ("1° Grp A" / "Mejor 3ro" / "Por definir").
 *  En home la bandera va a la izquierda; en away, a la derecha (espejada). */
function renderTeamSide(
  team: Team,
  projected: Team | null,
  matchNumber: number,
  side: 'home' | 'away',
) {
  const real = isRealTeam(team);
  const display = real ? team : projected ?? null;
  const flag = display ? <TeamFlag code={display.code} emoji={display.flag} size={20} /> : null;
  const label = display ? display.code : slotLabelFor(matchNumber, side);
  const text = (
    <span className={cn('truncate', !real && 'text-muted', !real && !projected && 'text-xs-s')}>
      {label}
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-sm-s font-semibold text-text min-w-0">
      {side === 'home' ? (
        <>{flag}{text}</>
      ) : (
        <>{text}{flag}</>
      )}
    </span>
  );
}

function getTeam(teamMap: Map<number, Team> | undefined, id: number): Team {
  return teamMap?.get(id) ?? PLACEHOLDER_TEAM;
}

const STATUS_OPTIONS = [
  'Todos',
  'Hoy',
  'En vivo',
  'Por jugar',
  'Sin pronosticar',
  'Pronosticados',
  'Terminados',
] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

const WC_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

const MAIN_TABS = ['Partidos', 'Grupos', 'Terceros', 'Cuadro'] as const;
type MainTab = (typeof MAIN_TABS)[number];

// Persistimos la pestaña principal y el filtro de estado en sessionStorage para
// que sobrevivan a navegar a un partido y volver — sin importar cómo se vuelva
// (botón atrás, link "Partidos" de la barra inferior, etc.). El URL solo
// persiste con el back del navegador; sessionStorage cubre todos los caminos.
const TAB_STORAGE_KEY = 'matches:mainTab';
const STATUS_STORAGE_KEY = 'matches:statusFilter';

function readStoredTab(): MainTab {
  const v = sessionStorage.getItem(TAB_STORAGE_KEY);
  return MAIN_TABS.includes(v as MainTab) ? (v as MainTab) : 'Partidos';
}
function readStoredStatus(): StatusOption | null {
  const v = sessionStorage.getItem(STATUS_STORAGE_KEY);
  return STATUS_OPTIONS.includes(v as StatusOption) ? (v as StatusOption) : null;
}

/** Dropdown custom (no usa el <select> nativo). En Windows, Chrome ignora
 *  `color-scheme` para el popup del <select> y lo pinta blanco ilegible sobre
 *  el tema oscuro. Un menú propio con los tokens del tema funciona en claro y
 *  oscuro por igual. */
function FilterDropdown({
  value,
  options,
  onChange,
  getCount,
}: {
  value: StatusOption;
  options: readonly StatusOption[];
  onChange: (v: StatusOption) => void;
  getCount: (opt: StatusOption) => number | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const curCount = getCount(value);

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar partidos por estado"
        className="flex items-center justify-between gap-2 w-full pl-4 pr-3 min-h-[44px] rounded-lg bg-elevated border border-border text-sm-s font-semibold text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <span>
          {value}
          {curCount !== null && <span className="text-muted font-normal"> ({curCount})</span>}
        </span>
        <ChevronDown
          size={16}
          className={cn('flex-shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Estado del partido"
          className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-card shadow-card overflow-hidden py-1"
        >
          {options.map((opt) => {
            const c = getCount(opt);
            const selected = opt === value;
            const isLive = opt === 'En vivo' && c !== null && c > 0;
            return (
              <li key={opt} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 w-full px-4 min-h-[40px] text-sm-s text-left transition-colors',
                    selected
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-text hover:bg-elevated',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                    {opt}
                  </span>
                  {c !== null && (
                    <span
                      className={cn(
                        'text-xs-s tabular-nums',
                        selected ? 'text-accent' : 'text-muted',
                      )}
                    >
                      {c}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MatchesPage() {
  const [searchParams] = useSearchParams();
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const { reduced } = useMotionPrefs();

  // Clave de "hoy" en hora local, fijada al montar (no cambia entre renders).
  const todayKey = useMemo(() => localDateKey(new Date()), []);

  // mainTab y statusFilter se inicializan desde sessionStorage para recordar
  // dónde quedó el usuario al volver de un partido. Los setters envuelven el
  // useState para escribir también en storage en cada cambio.
  const [mainTab, setMainTabState] = useState<MainTab>(readStoredTab);
  const [statusFilter, setStatusFilterState] = useState<StatusOption>(
    () => readStoredStatus() ?? 'Todos',
  );

  function setMainTab(tab: MainTab) {
    setMainTabState(tab);
    sessionStorage.setItem(TAB_STORAGE_KEY, tab);
  }
  function setStatusFilter(opt: StatusOption) {
    setStatusFilterState(opt);
    sessionStorage.setItem(STATUS_STORAGE_KEY, opt);
  }

  // Se aplica el filtro inicial una sola vez (cuando llegan los datos), sin que
  // el polling de 30s lo vuelva a pisar ni anule la elección del usuario.
  const initializedRef = useRef(false);

  // Poll every 30s so live scores and the scheduled→live→finished status
  // transitions show up without a manual refresh. Polling is the reliable path
  // (the realtime WS hook was never wired into the app and has been removed).
  // refetchIntervalInBackground is off (in the hook) to spare Render's free tier.
  const { data: matchesResponse, isLoading, error, refetch, isFetching } = useMatches(
    { limit: 200 },
    { refetchInterval: 30_000 },
  );
  const { data: teamMap } = useTeamMap();
  const { data: teamsData } = useTeams();
  const { data: myPredictionsData } = useMyPredictions();
  const { data: myLeaguesData } = useMyLeagues();
  const matches = matchesResponse?.data ?? [];
  const teams = teamsData ?? [];

  const predictedIds = useMemo(
    () => new Set((myPredictionsData?.data ?? []).map((p) => p.matchId)),
    [myPredictionsData],
  );

  // Las ligas personales/auto están ocultas en toda la app (el editor por liga
  // del match-detail solo muestra ligas compartidas). Un marcador viejo en la
  // liga personal NO debe disparar el flag "distintos por liga", así que las
  // identificamos para excluirlas del cálculo de divergencia.
  const personalLeagueIds = useMemo(
    () =>
      new Set(
        (myLeaguesData?.data ?? []).filter((l) => l.isPersonal).map((l) => l.id),
      ),
    [myLeaguesData],
  );

  // Proyección del cuadro (1°/2° de grupo confirmados o clasificados
  // provisionales + mejores terceros) para mostrar en los cruces de R32 los
  // equipos ya definidos, igual que en la pestaña "Cuadro", mientras la DB
  // todavía los tiene como TBD. Reusa teams/matches ya pedidos (no agrega red).
  const bracketProjection = useMemo(
    () => computeBracketProjection(teams, matches),
    [teams, matches],
  );

  // Contexto para resolver la identidad de cada slot (igual que el Cuadro):
  // equipo real, proyección de grupos en R32, o ganador del cruce anterior.
  const matchByNum = useMemo(
    () => new Map(matches.map((m) => [m.matchNumber, m])),
    [matches],
  );
  const slotCtx = useMemo(
    () => ({ matchByNum, teamMap, projection: bracketProjection }),
    [matchByNum, teamMap, bracketProjection],
  );

  // Filtro inicial (una sola vez, cuando ya hay datos): el deep-link ?filter=
  // del banner de home siempre gana. Si no, y NO hay un filtro recordado en
  // sessionStorage (primera visita de la sesión), aterrizamos en el grupo más
  // relevante. Si ya había uno guardado, el useState lo tomó y no lo tocamos.
  if (!initializedRef.current && matches.length > 0) {
    initializedRef.current = true;
    const f = searchParams.get('filter');
    if (f === 'live') setStatusFilter('En vivo');
    else if (f === 'today') setStatusFilter('Hoy');
    else if (readStoredStatus() === null) {
      if (matches.some((m) => localDateKey(new Date(m.kickoffUtc)) === todayKey)) {
        setStatusFilter('Hoy');
      } else if (matches.some((m) => m.status === 'scheduled')) {
        setStatusFilter('Por jugar');
      }
      // si no quedan partidos por jugar (torneo terminado) se queda en 'Todos'.
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-4 pt-6 pb-4 animate-fade-in">
        <div className="h-7 w-28 bg-elevated rounded animate-pulse" />
        <div className="h-3 w-44 bg-elevated rounded animate-pulse mb-3" />
        <SkeletonList count={8} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 m-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col items-center gap-3 text-center animate-fade-in">
        <span className="text-2xl">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-300">No pudimos cargar los partidos</p>
          <p className="text-xs text-muted max-w-xs mt-1">Revisá tu conexión e intentá de nuevo.</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-on text-sm-s font-semibold disabled:opacity-60"
        >
          {isFetching ? 'Reintentando...' : 'Reintentar'}
        </button>
      </div>
    );
  }

  const groupMatches = matches.filter((m) => m.group !== null);

  const filteredByGroup = groupFilter
    ? matches.filter((m) => m.group === groupFilter)
    : matches;

  const filtered = filteredByGroup.filter((m) => {
    if (statusFilter === 'Hoy') return localDateKey(new Date(m.kickoffUtc)) === todayKey;
    if (statusFilter === 'En vivo') return m.status === 'live';
    if (statusFilter === 'Pronosticados') return predictedIds.has(m.id);
    if (statusFilter === 'Por jugar') return m.status === 'scheduled';
    if (statusFilter === 'Sin pronosticar') return m.status === 'scheduled' && !predictedIds.has(m.id);
    if (statusFilter === 'Terminados') return m.status === 'finished';
    return true;
  });

  const grouped = groupByDate(filtered);
  const dates = Object.keys(grouped).sort();
  const liveCount = matches.filter((m) => m.status === 'live').length;
  const phase = useTournamentPhase(matches);
  const finishedCount = matches.filter((m) => m.status === 'finished').length;
  const todayCount = matches.filter((m) => localDateKey(new Date(m.kickoffUtc)) === todayKey).length;

  // Conteo por opción del dropdown (sobre el total, ortogonal al filtro de grupo,
  // igual que el badge "en vivo" del header). 'Todos' no muestra número.
  const optionCount = (opt: StatusOption): number | null => {
    switch (opt) {
      case 'Hoy': return todayCount;
      case 'En vivo': return liveCount;
      case 'Por jugar': return matches.filter((m) => m.status === 'scheduled').length;
      case 'Sin pronosticar': return matches.filter((m) => m.status === 'scheduled' && !predictedIds.has(m.id)).length;
      case 'Pronosticados': return matches.filter((m) => predictedIds.has(m.id)).length;
      case 'Terminados': return finishedCount;
      default: return null;
    }
  };

  // Para la tab "En vivo" rompemos el agrupamiento por fecha y armamos
  // dos secciones explícitas: "En entretiempo" (halftime + descanso de
  // alargue) y "En juego ahora". Antes los partidos en pausa quedaban
  // mezclados con los activos y, sin animación pulsante, se confundían
  // con "ya terminó" o "no está en vivo".
  type LiveSection = { id: string; label: string; tone: 'halftime' | 'inplay'; matches: Match[] };
  const liveSections: LiveSection[] | null = statusFilter === 'En vivo' ? (() => {
    const paused: Match[] = [];
    const inPlay: Match[] = [];
    for (const m of filtered) {
      const isPaused =
        m.liveStatus === 'half_time' ||
        m.liveStatus === 'extra_time_break' ||
        m.liveStatus === 'cooling_break';
      (isPaused ? paused : inPlay).push(m);
    }
    const sections: LiveSection[] = [];
    if (paused.length > 0) {
      sections.push({ id: 'paused', label: 'En pausa', tone: 'halftime', matches: paused });
    }
    if (inPlay.length > 0) {
      sections.push({ id: 'inplay', label: 'En juego ahora', tone: 'inplay', matches: inPlay });
    }
    return sections;
  })() : null;

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl-s font-display font-bold text-text">Partidos</h1>
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-[10px] font-bold text-red-600 dark:text-red-300 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {liveCount} en vivo
            </span>
          )}
        </div>
        <p className="text-sm-s text-muted mt-0.5">
          Mundial FIFA 2026 · {finishedCount}/{matches.length} jugados
        </p>
      </div>

      {/* Banner de fase knockout */}
      {(phase.kind === 'knockout' || phase.kind === 'completed') && (
        <div className="px-4 pb-2">
          <KnockoutPhaseBanner
            phase={phase}
            onViewBracket={() => setMainTab('Cuadro')}
          />
        </div>
      )}

      {/* Main tabs: Partidos / Grupos */}
      <div className="flex gap-1 px-4 pt-2 pb-3">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className={cn(
              'flex-1 py-2 rounded-md text-sm-s font-semibold transition-colors',
              mainTab === tab
                ? 'bg-accent text-accent-on'
                : 'bg-elevated border border-border text-muted hover:text-text',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {mainTab === 'Grupos' ? (
        <div className="px-4 pb-8">
          <GroupStandings teams={teams} matches={groupMatches} />
        </div>
      ) : mainTab === 'Terceros' ? (
        <div className="px-4 pb-8">
          <ThirdPlaceTable teams={teams} matches={groupMatches} />
        </div>
      ) : mainTab === 'Cuadro' ? (
        <div className="px-3 pb-8">
          <BracketView matches={matches} teamMap={teamMap} teams={teams} />
        </div>
      ) : (
        <>
          {/* Group filter chips.
              Tap-targets ≥44px (min-h en todos, min-w en los de letra) para
              cumplir guías de accesibilidad táctil sin agrandar el aspecto
              compacto del pill ni romper el scroll horizontal de los 12 grupos. */}
          <div
            className="flex items-center gap-1.5 px-4 py-1 pb-3 overflow-x-auto no-scrollbar"
            role="group"
            aria-label="Filtrar por grupo"
          >
            <button
              onClick={() => setGroupFilter(null)}
              aria-pressed={groupFilter === null}
              className={cn(
                'flex-shrink-0 inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-xs-s font-semibold transition-colors whitespace-nowrap border',
                groupFilter === null
                  ? 'bg-accent text-accent-on border-accent'
                  : 'bg-elevated border-border text-muted hover:text-text',
              )}
            >
              Todos
            </button>
            {WC_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setGroupFilter(groupFilter === g ? null : g)}
                aria-pressed={groupFilter === g}
                aria-label={`Grupo ${g}`}
                className={cn(
                  'flex-shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full text-xs-s font-bold transition-colors border',
                  groupFilter === g
                    ? 'bg-accent text-accent-on border-accent'
                    : 'bg-elevated border-border text-muted hover:text-text',
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Status filter — dropdown CUSTOM (no nativo) para no saturar la barra
              con 7 opciones y poder tematizarlo en claro/oscuro. El <select>
              nativo no es tematizable en Windows (popup blanco ilegible). */}
          <div className="px-4 py-1 pb-4">
            <FilterDropdown
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
              getCount={optionCount}
            />
          </div>

          {/* Match list. Renderizamos secciones live-status para la tab
              "En vivo", o agrupado por fecha para las demás. La función
              MatchRow renderiza una sola card y se reusa en ambos paths. */}
          <div className="flex flex-col gap-6 px-4 pb-4">
            {liveSections && liveSections.map((section) => (
              <motion.div
                key={section.id}
                variants={staggerContainer(reduced)}
                initial="initial"
                animate="animate"
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      section.tone === 'halftime' ? 'bg-amber-500' : 'bg-red-500 animate-pulse',
                    )}
                  />
                  <p
                    className={cn(
                      'text-xs-s font-bold uppercase tracking-wider',
                      section.tone === 'halftime' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {section.label} ({section.matches.length})
                  </p>
                </div>
                {section.matches.map((match) => renderMatchRow(match))}
              </motion.div>
            ))}
            {!liveSections && dates.map((date) => (
              <motion.div
                key={date}
                variants={staggerContainer(reduced)}
                initial="initial"
                animate="animate"
                className="flex flex-col gap-2"
              >
                <p className="text-sm-s font-bold text-muted capitalize">{formatDate(date)}</p>
                {grouped[date].map((match) => renderMatchRow(match))}
              </motion.div>
            ))}

            {filtered.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-3xl-s mb-3">⚽</p>
                <p className="text-base-s font-semibold text-text">No hay partidos</p>
                <p className="text-sm-s text-muted mt-1">
                  {statusFilter === 'Pronosticados'
                    ? 'Todavía no pronosticaste ningún partido.'
                    : statusFilter === 'Hoy'
                      ? 'No hay partidos hoy. Mirá el calendario completo en «Todos».'
                      : 'No hay partidos en esta categoría.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  function renderMatchRow(match: Match) {
    // A user in multiple leagues can have DIFFERENT predictions per league for
    // the same match. `/predictions/mine` (no leagueId) returns one row per
    // league, so a `.find()` would surface an arbitrary league's score/points.
    // We still flag "predicted" via `hasPrediction`, but only show a concrete
    // score+points when every league agrees; otherwise we defer the per-league
    // detail to match-detail (which has the divergent view).
    const matchPredictions = (myPredictionsData?.data ?? []).filter((p) => p.matchId === match.id);
    const hasPrediction = matchPredictions.length > 0;
    // La divergencia se evalúa solo sobre las ligas que el usuario puede ver/editar
    // (las compartidas). Para quien solo tiene su liga personal, caemos de nuevo a
    // todas las predicciones para que igual se muestre su marcador concreto.
    const sharedPredictions = matchPredictions.filter((p) => !personalLeagueIds.has(p.leagueId));
    const consideredPredictions = sharedPredictions.length > 0 ? sharedPredictions : matchPredictions;
    const uniqueScores = new Set(consideredPredictions.map((p) => `${p.homeScore}-${p.awayScore}`));
    const prediction = uniqueScores.size === 1 ? consideredPredictions[0] : undefined;
    const homeTeam = getTeam(teamMap, match.homeTeamId);
    const awayTeam = getTeam(teamMap, match.awayTeamId);
    // Para cruces de eliminación aún sin definir, proyectar el equipo: en la R32
    // desde la fase de grupos (1°/2° o mejor 3ro); de octavos en adelante, el
    // ganador del cruce anterior — igual que el Cuadro — en vez de "Por definir".
    const projHome = isRealTeam(homeTeam) ? null : resolveAdvancingSlot(match.matchNumber, 'home', slotCtx);
    const projAway = isRealTeam(awayTeam) ? null : resolveAdvancingSlot(match.matchNumber, 'away', slotCtx);
    const isLive = match.status === 'live';
    const isFinished = match.status === 'finished';
    const isScheduled = match.status === 'scheduled';
    const isSuspended = match.status === 'suspended';
    const isPaused = isLive && (
      match.liveStatus === 'half_time' ||
      match.liveStatus === 'extra_time_break' ||
      match.liveStatus === 'cooling_break'
    );
    const isHalftime = isPaused; // alias para mantener nombre semántico abajo
    const pauseLabel =
      match.liveStatus === 'half_time' ? 'Entretiempo'
      : match.liveStatus === 'cooling_break' ? 'Hidratación'
      : match.liveStatus === 'extra_time_break' ? 'Descanso ET'
      : null;
    const finishedPredictions = isFinished
      ? consideredPredictions.filter((p) => p.points !== null)
      : [];
    const predictionHit: true | false | 'partial' | null =
      finishedPredictions.length === 0
        ? null
        : finishedPredictions.every((p) => p.points! > 0)
          ? true
          : finishedPredictions.every((p) => p.points! === 0)
            ? false
            : 'partial';
    // Partido terminado, el usuario SÍ pronosticó pero todavía no tiene puntos:
    // típicamente el lag entre el pitazo final y el cron de scoring (o una
    // predicción recién traída por el carry-over al unirse a una liga). No es
    // "no pronosticaste" — no hay que mostrar el badge alarmante de "sin
    // resultado", sino un estado neutro de "puntuando…".
    const isPendingScore = isFinished && hasPrediction && predictionHit === null;
    return (
      <motion.div
        key={match.id}
        variants={staggerItem(reduced)}
      >
        <Link
          to={`/matches/${match.id}`}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border transition-all',
            isLive && !isHalftime &&
              'bg-card border-red-500/50 shadow-[0_0_0_1px_rgba(239,68,68,0.25),0_0_16px_-4px_rgba(239,68,68,0.45)] hover:border-red-500/70',
            isHalftime &&
              'bg-card border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_14px_-4px_rgba(245,158,11,0.4)] hover:border-amber-500/70',
            isFinished &&
              'bg-card/60 border-border/60 opacity-70 hover:opacity-90 hover:border-accent-border',
            isScheduled &&
              'bg-card border-border hover:border-accent-border',
          )}
        >
          <div className="flex-shrink-0">
            {isLive ? (
              <span className={cn('w-2 h-2 rounded-full block', isHalftime ? 'bg-amber-500' : 'bg-red-400 animate-pulse')} />
            ) : isFinished ? (
              predictionHit === true ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-500">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : predictionHit === false ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/15 text-red-500">
                  <X size={12} strokeWidth={3} />
                </span>
              ) : predictionHit === 'partial' ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-500">
                  <Minus size={12} strokeWidth={3} />
                </span>
              ) : isPendingScore ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-elevated text-muted">
                  <Clock size={12} />
                </span>
              ) : (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-elevated text-muted">
                  <Minus size={14} strokeWidth={2.5} />
                </span>
              )
            ) : hasPrediction ? (
              <CheckCircle2 size={18} className="text-green-400" />
            ) : (
              <Clock size={18} className="text-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs-s text-muted">
                {match.group ? `Grupo ${match.group}` : ROUND_LABELS[match.round]}
              </span>
              <span className="text-xs-s text-muted">·</span>
              {isLive ? (
                isPaused ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      {pauseLabel}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-300 uppercase tracking-wider">
                      {match.currentMinute ? match.currentMinute : 'En vivo'}
                    </span>
                  </span>
                )
              ) : isSuspended ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                    Suspendido
                  </span>
                </span>
              ) : isFinished ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-elevated border border-border text-[10px] font-bold text-muted uppercase tracking-wider">
                  Final
                </span>
              ) : (
                <span className="text-xs-s font-semibold text-accent tabular-nums">
                  {formatTime(match.kickoffUtc)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {renderTeamSide(homeTeam, projHome, match.matchNumber, 'home')}
              {(isLive || isFinished || isSuspended) && match.homeScore !== null ? (
                <span
                  className={cn(
                    'font-display font-bold tabular-nums px-2 inline-flex items-baseline gap-1',
                    isLive
                      ? isHalftime ? 'text-lg-s text-amber-600 dark:text-amber-400' : 'text-lg-s text-red-500'
                      : 'text-sm-s text-muted',
                  )}
                >
                  {(() => {
                    const h = match.homeScore!;
                    const a = match.awayScore!;
                    // Bump model: el sync sumó +1 al ganador cuando se fueron a
                    // penales; para mostrar el resultado de reglamento (empate)
                    // usamos el mínimo de ambos lados.
                    if (!!match.decidedByPenalties && h !== a) {
                      const reg = Math.min(h, a);
                      return `${reg} – ${reg}`;
                    }
                    return `${h} – ${a}`;
                  })()}
                  {isFinished && !!match.decidedByPenalties && (
                    <span className="text-[9px] font-bold text-muted" title="Definido por penales">pen.</span>
                  )}
                </span>
              ) : (
                <span className="text-xs-s font-bold text-muted">vs</span>
              )}
              {renderTeamSide(awayTeam, projAway, match.matchNumber, 'away')}
            </div>
            {hasPrediction && (
              <p
                className={cn(
                  'text-xs-s font-semibold mt-0.5',
                  predictionHit === true
                    ? 'text-green-500'
                    : predictionHit === false
                      ? 'text-muted'
                      : predictionHit === 'partial'
                        ? 'text-amber-500'
                        : 'text-accent',
                )}
              >
                {prediction
                  ? <>Tu pronóstico: {prediction.homeScore} – {prediction.awayScore}{prediction.points !== null ? ` · +${prediction.points} pts` : isPendingScore ? ' · puntuando…' : ''}</>
                  : 'Pronósticos distintos por liga'}
              </p>
            )}
            {isFinished && !hasPrediction && (
              <p className="text-xs-s text-muted italic mt-0.5">
                No pronosticaste
              </p>
            )}
          </div>
          {!isFinished && <ChevronRight size={16} className="text-muted flex-shrink-0" />}
        </Link>
      </motion.div>
    );
  }
}
