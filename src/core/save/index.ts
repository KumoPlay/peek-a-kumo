import type { SaveState } from '../progress';
import { decodeSaveCode, encodeSaveCode } from './codec';
import { migrateSave } from './migrations';
import { asSaveFile, normalizeState, toSaveFile } from './schema';

export { decodeSaveCode, encodeSaveCode } from './codec';
export { migrateSave, migrations, type Migration } from './migrations';
export { asSaveFile, normalizeState, SAVE_APP, SAVE_VERSION, SaveError, toSaveFile } from './schema';
export type { SaveErrorCode, SaveFile } from './schema';

export interface OpenedSave {
  state: SaveState;
  rev: number;
}

/** Stored data → a ready SaveState: check, upgrade old versions, repair. Throws SaveError. */
export function openSave(raw: unknown): OpenedSave {
  const file = migrateSave(asSaveFile(raw));
  return { state: normalizeState(file.state), rev: file.rev };
}

/** The current progress as a backup code. */
export function exportSaveCode(state: SaveState, rev: number): string {
  return encodeSaveCode(toSaveFile(state, rev));
}

/** A pasted backup code → a ready SaveState. Throws SaveError. */
export function importSaveCode(code: string): OpenedSave {
  return openSave(decodeSaveCode(code));
}
