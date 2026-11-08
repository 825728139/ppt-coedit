export type Patch = { id: string; text?: string; style?: Record<string, string> };
export type Transaction = { baseRevision: number; requestId: string; patches: Patch[] };
export function validateTransaction(input: Transaction, revision: number, exists: (id: string) => boolean, locked: (id: string) => boolean) {
  if (!input || !Number.isInteger(input.baseRevision) || !input.requestId || !Array.isArray(input.patches) || !input.patches.length) throw new Error('invalid_transaction');
  if (input.baseRevision !== revision) throw new Error('revision_conflict');
  for (const patch of input.patches) {
    if (!patch || typeof patch.id !== 'string' || !exists(patch.id)) throw new Error('target_missing');
    if (locked(patch.id)) throw new Error('object_locked');
    if (patch.text !== undefined && typeof patch.text !== 'string') throw new Error('invalid_text');
    if (patch.style && (typeof patch.style !== 'object' || Array.isArray(patch.style) || Object.values(patch.style).some(v => typeof v !== 'string'))) throw new Error('invalid_style');
  }
}
