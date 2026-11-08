import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransaction, validateTransactionShape } from '../src/protocol.ts';
const tx = { baseRevision: 3, requestId: 'a', patches: [{ id: 'title', text: '更新' }] };
test('accept valid patch and reject a stale revision', () => {
  validateTransaction(tx, 3, () => true, () => false);
  assert.throws(() => validateTransaction(tx, 4, () => true, () => false), /revision_conflict/);
});
test('reject malformed requests and no-op patches before touching the document', () => {
  for(const value of [null,{}, {...tx,requestId:42}, {...tx,baseRevision:-1}, {...tx,patches:[{id:'title',style:null}]}, {...tx,patches:[{id:'title'}]}]) assert.throws(()=>validateTransactionShape(value));
  validateTransactionShape({...tx,patches:[{id:'title',text:''}]});
});
test('validate every target before mutation, including locks', () => {
  assert.throws(() => validateTransaction({ ...tx, patches: [...tx.patches, { id: 'missing', text: 'x' }] }, 3, id => id === 'title', () => false), /target_missing/);
  assert.throws(() => validateTransaction(tx, 3, () => true, () => true), /object_locked/);
});
