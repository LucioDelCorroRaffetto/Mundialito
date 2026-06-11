/**
 * Formatea un instante UTC para mostrarlo en las 4 bandas horarias de LATAM
 * más relevantes, en una línea compacta apta para notificaciones push.
 *
 * Ejemplo de salida:
 *   "16:00 AR/UY/BR · 15:00 CL/BO/VE · 14:00 CO/PE/EC · 13:00 MX/CA"
 *
 * Notas de referencia (vigentes 2026, sin DST ajustado):
 *   UTC-3  → Argentina, Uruguay, Brasil (este/centro)
 *   UTC-4  → Chile (invierno), Bolivia, Venezuela, Paraguay (invierno)
 *   UTC-5  → Colombia, Perú, Ecuador, Panamá
 *   UTC-6  → México (sin DST desde 2023), Centroamérica, Cuba
 */

const ZONES: Array<{ tz: string; label: string }> = [
  { tz: 'America/Argentina/Buenos_Aires', label: 'AR/UY/BR' },
  { tz: 'America/Santiago',               label: 'CL/BO/VE' },
  { tz: 'America/Bogota',                 label: 'CO/PE/EC' },
  { tz: 'America/Mexico_City',            label: 'MX/CA/CU' },
];

function fmt(date: Date, tz: string): string {
  try {
    return date.toLocaleTimeString('es', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** Devuelve una cadena con el horario en las 4 bandas LATAM, dedupando las que coincidan. */
export function latamTimes(isoUtc: string): string {
  const date = new Date(isoUtc);
  const seen = new Map<string, string[]>();

  for (const { tz, label } of ZONES) {
    const time = fmt(date, tz);
    const labels = seen.get(time) ?? [];
    labels.push(label);
    seen.set(time, labels);
  }

  return [...seen.entries()]
    .map(([time, labels]) => `${time} ${labels.join('/')}`)
    .join(' · ');
}
