export type Patch = { id: string; text?: string; style?: Record<string, string> };
export type Transaction = { baseRevision: number; requestId: string; patches: Patch[] };
export function validateTransactionShape(value: unknown): asserts value is Transaction {
  if (!value || typeof value !== 'object') throw new Error('invalid_transaction');
  const input = value as Transaction;
  if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0 || typeof input.requestId !== 'string' || !input.requestId.trim() || !Array.isArray(input.patches) || !input.patches.length) throw new Error('invalid_transaction');
  for(const patch of input.patches) {
    if(!patch || typeof patch.id !== 'string' || !patch.id) throw new Error('invalid_patch');
    if(patch.text !== undefined && typeof patch.text !== 'string') throw new Error('invalid_text');
    if(patch.style !== undefined && (!patch.style || typeof patch.style !== 'object' || Array.isArray(patch.style) || Object.values(patch.style).some(value => typeof value !== 'string'))) throw new Error('invalid_style');
    if(patch.text === undefined && (!patch.style || !Object.keys(patch.style).length)) throw new Error('empty_patch');
  }
}
export function validateTransaction(input: Transaction, revision: number, exists: (id: string) => boolean, locked: (id: string) => boolean) {
  validateTransactionShape(input);
  if (input.baseRevision !== revision) throw new Error('revision_conflict');
  for (const patch of input.patches) {
    if (!patch || typeof patch.id !== 'string' || !exists(patch.id)) throw new Error('target_missing');
    if (locked(patch.id)) throw new Error('object_locked');
    if (patch.text !== undefined && typeof patch.text !== 'string') throw new Error('invalid_text');
    if (patch.style && (typeof patch.style !== 'object' || Array.isArray(patch.style) || Object.values(patch.style).some(v => typeof v !== 'string'))) throw new Error('invalid_style');
  }
}
