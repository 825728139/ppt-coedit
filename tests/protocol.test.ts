import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransaction } from '../src/protocol.ts';
const tx = { baseRevision: 3, requestId: 'a', patches: [{ id: 'title', text: '更新' }] };
test('accept valid patch and reject a stale revision', () => {
  validateTransaction(tx, 3, () => true, () => false);
  assert.throws(() => validateTransaction(tx, 4, () => true, () => false), /revision_conflict/);
});
test('validate every target before mutation, including locks', () => {
  assert.throws(() => validateTransaction({ ...tx, patches: [...tx.patches, { id: 'missing' }] }, 3, id => id === 'title', () => false), /target_missing/);
  assert.throws(() => validateTransaction(tx, 3, () => true, () => true), /object_locked/);
});
