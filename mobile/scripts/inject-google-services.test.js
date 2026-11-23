'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const script = path.join(__dirname, 'inject-google-services.js');
const PLACEHOLDER = 'FIREBASE_ANDROID_API_KEY_PLACEHOLDER';

function writeSample(dir) {
  const file = path.join(dir, 'google-services.json');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        client: [{ api_key: [{ current_key: PLACEHOLDER }] }],
      },
      null,
      2
    ) + '\n'
  );
  return file;
}

function run(file, env) {
  return spawnSync(process.execPath, [script, file], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ...env,
    },
  });
}

test('local run without a key warns and leaves the placeholder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
  const file = writeSample(dir);
  const result = run(file, {});
  assert.strictEqual(result.status, 0);
  assert.match(result.stderr, /FIREBASE_ANDROID_API_KEY is not set/);
  assert.match(fs.readFileSync(file, 'utf8'), new RegExp(PLACEHOLDER));
});

test('EAS build without a key fails and does not write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
  const file = writeSample(dir);
  const before = fs.readFileSync(file, 'utf8');
  const result = run(file, { EAS_BUILD: 'true' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /sensitive environment variable/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

test('a set key replaces the placeholder and is not printed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
  const file = writeSample(dir);
  const secret = 'AIzaLocalTestKey123';
  const result = run(file, { FIREBASE_ANDROID_API_KEY: secret });
  assert.strictEqual(result.status, 0, result.stderr);
  const written = fs.readFileSync(file, 'utf8');
  assert.strictEqual(JSON.parse(written).client[0].api_key[0].current_key, secret);
  assert.doesNotMatch(written, new RegExp(PLACEHOLDER));
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.doesNotMatch(result.stderr, new RegExp(secret));
  assert.match(result.stderr, /Do not commit/);
});

test('EAS rejects a key that would break values.xml', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
  const file = writeSample(dir);
  const result = run(file, {
    EAS_BUILD: 'true',
    FIREBASE_ANDROID_API_KEY: '<still-broken>',
  });
  assert.strictEqual(result.status, 1);
  assert.match(fs.readFileSync(file, 'utf8'), new RegExp(PLACEHOLDER));
  assert.doesNotMatch(result.stderr, /still-broken/);
});
