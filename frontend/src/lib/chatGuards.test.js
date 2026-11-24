const test = require('node:test');
const assert = require('node:assert/strict');

const { mediaUrl } = require('./mediaUrl');
const { messageViewChanged } = require('./messageSync');
const { preferredVoiceMime } = require('./voiceMime');

test('mediaUrl accepts http(s) and app paths and rejects other schemes', () => {
  process.env.REACT_APP_BACKEND_URL = 'https://api.example';
  assert.equal(mediaUrl('https://cdn.example/gif.gif'), 'https://cdn.example/gif.gif');
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

test('Safari voice recording falls back to audio/mp4', () => {
  assert.equal(preferredVoiceMime((type) => type === 'audio/webm'), 'audio/webm');
  assert.equal(preferredVoiceMime((type) => type === 'audio/mp4'), 'audio/mp4');
  assert.equal(preferredVoiceMime(() => false), '');
  assert.equal(preferredVoiceMime(() => { throw new Error('unsupported'); }), '');
});
