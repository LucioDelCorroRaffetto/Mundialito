import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1 (ambiguos)

/**
 * Generates a hard-to-guess invite code. Uses crypto.randomInt instead of
 * Math.random so a determined attacker can't enumerate the search space —
 * with the previous Math.random impl + 6 chars (~30 bits) a quiet brute-force
 * against /leagues/join could discover private leagues.
 *
 * Length bumped to 8 by default (~40 bits with our 32-char alphabet) which
 * still fits in a comfortable share-this-on-WhatsApp size. Existing 6-char
 * codes remain valid for old leagues.
 */
export function generateInviteCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
