/**
 * lineup.ts — lógica pura de edición del 11 inicial del Fantasy.
 *
 * Vive separada del componente `FantasyPage` por dos motivos:
 *   1. Es testeable sin montar React (ver `lineup.test.ts`).
 *   2. Las reglas (cap de 11, swap automático de arquero, validación de
 *      capitán/vice) son la fuente de verdad del frontend y conviene tenerlas
 *      en un solo lugar en vez de repartidas entre handlers del componente.
 *
 * El backend (`upsert-lineup.ts`) revalida TODO esto — estas funciones son la
 * capa de UX que evita que el usuario arme un lineup inválido y solo se entere
 * al guardar.
 */

export interface LineupSlot {
  playerId: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

/** Mira la posición de un jugador por id. Devuelve undefined si no la conoce. */
export type PositionLookup = (playerId: number) => string | undefined;

export const STARTERS_REQUIRED = 11;

const benchOf = (slot: LineupSlot): LineupSlot => ({
  ...slot,
  isStarter: false,
  // Un suplente nunca puede conservar la cinta: si lo mandamos al banco le
  // sacamos capitán/vice para no quedar con un capitán que no juega.
  isCaptain: false,
  isViceCaptain: false,
});

/**
 * Alterna a un jugador entre titular y suplente respetando las reglas:
 *
 *  • Mandar al banco siempre se permite (y limpia su capitanía).
 *  • Subir a titular cuando hay menos de 11 titulares: se permite.
 *  • Subir a titular cuando ya hay 11:
 *      - Si el jugador es ARQUERO, se hace un swap automático con el arquero
 *        titular actual (la formación exige exactamente 1, así que el cambio
 *        es inequívoco). Esto resuelve el bug "no puedo sacar al arquero de la
 *        banca / no me deja hacer nada con el arquero".
 *      - Si es de otra posición, se rechaza con un mensaje: el usuario tiene
 *        que elegir a quién baja primero (cualquiera de los 10 de campo es un
 *        candidato válido, no hay swap inequívoco).
 *
 * Devuelve el nuevo draft y, si la acción se rechazó, un `error` para toast.
 * Nunca muta el array de entrada.
 */
export function toggleStarter(
  draft: LineupSlot[],
  playerId: number,
  positionOf: PositionLookup,
): { draft: LineupSlot[]; error?: string } {
  const current = draft.find((p) => p.playerId === playerId);
  if (!current) return { draft };

  // Bajar al banco — siempre permitido.
  if (current.isStarter) {
    return {
      draft: draft.map((p) => (p.playerId === playerId ? benchOf(p) : p)),
    };
  }

  // Subir a titular.
  const starterCount = draft.filter((p) => p.isStarter).length;
  if (starterCount < STARTERS_REQUIRED) {
    return {
      draft: draft.map((p) =>
        p.playerId === playerId ? { ...p, isStarter: true } : p,
      ),
    };
  }

  // Ya hay 11 titulares. Swap automático solo para el arquero.
  if (positionOf(playerId) === 'GK') {
    const gkStarter = draft.find(
      (p) => p.isStarter && positionOf(p.playerId) === 'GK',
    );
    if (gkStarter) {
      return {
        draft: draft.map((p) => {
          if (p.playerId === gkStarter.playerId) return benchOf(p);
          if (p.playerId === playerId) return { ...p, isStarter: true };
          return p;
        }),
      };
    }
    // No había arquero titular (lineup raro) → simplemente lo subimos: el cap
    // de 11 se relaja porque hace falta un arquero sí o sí.
    return {
      draft: draft.map((p) =>
        p.playerId === playerId ? { ...p, isStarter: true } : p,
      ),
    };
  }

  return {
    draft,
    error: 'Solo podés tener 11 titulares — sacá uno antes de agregar otro',
  };
}

/** Marca al jugador como capitán (único). No puede ser capitán y vice a la vez. */
export function setCaptain(draft: LineupSlot[], playerId: number): LineupSlot[] {
  return draft.map((p) => ({
    ...p,
    isCaptain: p.playerId === playerId,
    isViceCaptain: p.isViceCaptain && p.playerId !== playerId,
  }));
}

/** Marca al jugador como vicecapitán (único). No puede ser vice y capitán a la vez. */
export function setVice(draft: LineupSlot[], playerId: number): LineupSlot[] {
  return draft.map((p) => ({
    ...p,
    isViceCaptain: p.playerId === playerId,
    isCaptain: p.isCaptain && p.playerId !== playerId,
  }));
}

/**
 * ¿Por qué el lineup todavía no se puede guardar? Devuelve el primer problema
 * en orden de prioridad, o `null` si es válido. El texto se muestra tal cual en
 * el botón de guardado.
 */
export function lineupBlocker(
  draft: LineupSlot[],
  positionOf: PositionLookup,
): string | null {
  const starters = draft.filter((p) => p.isStarter);
  const starterCount = starters.length;
  const gkStarters = starters.filter((p) => positionOf(p.playerId) === 'GK').length;
  const captainPicked = draft.some((p) => p.isCaptain);
  const vicePicked = draft.some((p) => p.isViceCaptain);

  if (starterCount < STARTERS_REQUIRED) {
    const missing = STARTERS_REQUIRED - starterCount;
    return `Faltan ${missing} titular${missing === 1 ? '' : 'es'}`;
  }
  if (starterCount > STARTERS_REQUIRED) {
    const extra = starterCount - STARTERS_REQUIRED;
    return `Sobran ${extra} titular${extra === 1 ? '' : 'es'}`;
  }
  if (gkStarters === 0) return 'Falta el arquero titular';
  if (gkStarters > 1) return 'Solo 1 arquero titular';
  if (!captainPicked) return 'Elegí un capitán (C)';
  if (!vicePicked) return 'Elegí un vicecapitán (V)';
  return null;
}
