import { hashText as checksum } from '../hash';
import { asSaveFile, SaveError, type SaveFile } from './schema';

/**
 * Backup codes: a save turned into text the player can copy, keep in a file
 * and paste back on any device.
 *
 *   KUMO1.<save as base64url JSON>.<checksum>
 *
 * The checksum catches codes that were cut short or mistyped.
 */
const PREFIX = 'KUMO1';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeSaveCode(file: SaveFile): string {
  const body = toBase64Url(JSON.stringify(file));
  return `${PREFIX}.${body}.${checksum(body)}`;
}

/** Reads a backup code. Spaces and line breaks are ignored. Throws SaveError. */
export function decodeSaveCode(text: string): SaveFile {
  const cleaned = text.replace(/\s+/g, '');
  if (!cleaned.startsWith(`${PREFIX}.`)) throw new SaveError('not-a-save');
  // It is one of our codes, so anything wrong from here on means it was cut short or changed.
  const [, body, sum, ...extra] = cleaned.split('.');
  if (!body || !sum || extra.length > 0) throw new SaveError('corrupt');
  if (checksum(body) !== sum.toLowerCase()) throw new SaveError('corrupt');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(body));
  } catch {
    throw new SaveError('corrupt');
  }
  return asSaveFile(parsed);
}
