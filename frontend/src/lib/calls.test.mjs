import test from 'node:test';
import assert from 'node:assert/strict';

import { callsEnabled } from './calls.mjs';

test('calls stay off unless the flag is exactly true', () => {
  assert.equal(callsEnabled(undefined), false);
  assert.equal(callsEnabled(''), false);
  assert.equal(callsEnabled('false'), false);
  assert.equal(callsEnabled('FALSE'), false);
  assert.equal(callsEnabled('0'), false);
  assert.equal(callsEnabled(' true '), true);
  assert.equal(callsEnabled('TRUE'), true);
});
