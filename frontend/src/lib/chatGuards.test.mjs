import test from 'node:test';
import assert from 'node:assert/strict';

import { mediaUrl } from './mediaUrl.mjs';
import { messageViewChanged } from './messageSync.mjs';
import { preferredVoiceMime } from './voiceMime.mjs';
import { safeRedirect } from './safeRedirect.mjs';

test('mediaUrl allows Giphy and app paths, and rejects other hosts', () => {
  process.env.REACT_APP_BACKEND_URL = 'https://api.example';
  assert.equal(
    mediaUrl('https://media.giphy.com/media/abc/giphy.gif'),
    'https://media.giphy.com/media/abc/giphy.gif',
  );
  assert.equal(mediaUrl('https://i.giphy.com/x.gif'), 'https://i.giphy.com/x.gif');
  assert.equal(mediaUrl('https://media2.giphy.com/a.gif'), 'https://media2.giphy.com/a.gif');
  assert.equal(mediaUrl('https://attacker.example/pixel.gif'), '');
  assert.equal(mediaUrl('http://media.giphy.com/a.gif'), '');
  assert.equal(mediaUrl('/api/files/abc?sig=1'), 'https://api.example/api/files/abc?sig=1');
  assert.equal(mediaUrl('javascript:alert(1)'), '');
  assert.equal(mediaUrl('data:text/html,hi'), '');
  assert.equal(mediaUrl('//evil.example/a'), '');
  assert.equal(mediaUrl('/uploads/secret.png'), '');
});

test('message refresh notices reactions, deletion, and read receipts', () => {
  const base = { message_id: 'm1', file_url: '/api/files/a', reactions: {}, deleted: false, read_by: ['me'] };
  assert.equal(messageViewChanged(base, { ...base }), false);
  assert.equal(messageViewChanged(base, { ...base, reactions: { '👍': ['friend'] } }), true);
  assert.equal(messageViewChanged(base, { ...base, deleted: true }), true);
  assert.equal(messageViewChanged(base, { ...base, read_by: ['friend', 'me'] }), true);
  assert.equal(messageViewChanged(base, { ...base, read_by: ['me'] }), false);
});

test('invite redirects stay on same-origin relative paths', () => {
  assert.equal(safeRedirect('/join/abc'), '/join/abc');
  assert.equal(safeRedirect('/join/abc?x=1'), '/join/abc?x=1');
  assert.equal(safeRedirect('https://evil.example/join/abc'), null);
  assert.equal(safeRedirect('//evil.example/join/abc'), null);
  assert.equal(safeRedirect('/%2f%2fevil.example'), null);
  assert.equal(safeRedirect('/\\evil'), null);
});

test('Safari voice recording falls back to audio/mp4', () => {
  assert.equal(preferredVoiceMime((type) => type === 'audio/webm'), 'audio/webm');
  assert.equal(preferredVoiceMime((type) => type === 'audio/mp4'), 'audio/mp4');
  assert.equal(preferredVoiceMime(() => false), '');
  assert.equal(preferredVoiceMime(() => { throw new Error('unsupported'); }), '');
});
