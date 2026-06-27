import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, gte, lte, asc, or } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches } from '../../../db/schema/index.js';
import { getCachedMatches, setCachedMatches } from '../../../lib/matches-cache.js';

export const listMatchesQuerySchema = z.object({
  status: z.enum(['scheduled', 'live', 'finished']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  group: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export async function listMatchesHandler(req: Request, res: Response) {
  const parsed = listMatchesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
  }
  const { status, from, to, group, limit } = parsed.data;

  // Cache de lectura (TTL corto, global): este endpoint es el más polleado
  // (~30s × cada usuario) y no depende del usuario, así que la respuesta se
  // comparte. Clave = combinación de filtros. Se invalida en cada escritura de
  // match vía broadcastMatchUpdate, así que un gol/cambio de estado se ve en el
  // próximo poll sin esperar al TTL.
  const cacheKey = JSON.stringify({ status, from, to, group, limit });
  const cached = getCachedMatches(cacheKey);
  if (cached !== undefined) {
    return res.json(cached);
  }

  const conditions = [];
  // 'scheduled' incluye también 'live': el sync FIFA puede tardar en elevar
  // un partido a 'live' (espera al primer evento), pero el home/countdown ya
  // tiene que ver el partido en curso para mostrar el banner "EN VIVO".
  // Mantener filtro estricto en 'live'/'finished' (usados explícitamente).
  if (status === 'scheduled') {
    conditions.push(or(eq(matches.status, 'scheduled'), eq(matches.status, 'live')));
  } else if (status) {
    conditions.push(eq(matches.status, status));
  }
  if (from) conditions.push(gte(matches.kickoffUtc, from));
  if (to) conditions.push(lte(matches.kickoffUtc, to));
  if (group) conditions.push(eq(matches.group, group));

  const rows = await db
    .select()
    .from(matches)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(matches.kickoffUtc))
    .limit(limit);

  const body = { data: rows, meta: { total: rows.length } };
  setCachedMatches(cacheKey, body);
  return res.json(body);
}
