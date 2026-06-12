import jwt from 'jsonwebtoken';
import { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } from '../constants.js';

export interface JwtPayload {
  sub: number;   // user id
  username: string;
}

export function signAccess(payload: JwtPayload): string {
  // 15m era muy agresivo: usuarios con la pestaña abierta veían 401 en
  // consola y un breve flash de errores antes del refresh automático.
  // 1h es el sweet spot — sigue siendo corto frente al refresh (30d) y
  // evita el ruido en sesiones normales.
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '1h' });
}

export function signRefresh(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyAccess(token: string): JwtPayload {
  return jwt.verify(token, JWT_ACCESS_SECRET) as unknown as JwtPayload;
}

export function verifyRefresh(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as unknown as JwtPayload;
}
