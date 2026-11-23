#!/usr/bin/env node
/**
 * EAS hook: eas-build-pre-install.
 *
 * Expo runs this before npm install and before `expo prebuild`. Prebuild
 * copies google-services.json into the Android project, and the Google
 * Services Gradle plugin later writes that API key into values.xml.
 * eas-build-post-install is too late: on Android it runs after prebuild.
 *
 * Set FIREBASE_ANDROID_API_KEY as a sensitive EAS environment variable
 * for the preview and production environments. Do not commit the real key.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PLACEHOLDER = 'FIREBASE_ANDROID_API_KEY_PLACEHOLDER';
const DEFAULT_FILE = path.join(__dirname, '..', 'google-services.json');

function isEasBuild() {
  const value = process.env.EAS_BUILD;
  return value === 'true' || value === '1';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function keyIsSafe(key) {
  return Boolean(key) && !/[\s"'\\<>]/.test(key) && key !== PLACEHOLDER;
}

function main() {
  const filePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_FILE;
  const apiKey = (process.env.FIREBASE_ANDROID_API_KEY || '').trim();
  const onEas = isEasBuild();

  if (!apiKey) {
    const message =
      'FIREBASE_ANDROID_API_KEY is not set. Add it in EAS as a sensitive environment variable for preview and production. google-services.json keeps FIREBASE_ANDROID_API_KEY_PLACEHOLDER.';
    if (onEas) {
      fail(message);
    }
    console.warn(message);
    return;
  }

  if (!keyIsSafe(apiKey)) {
    fail(
      'FIREBASE_ANDROID_API_KEY contains characters that would break google-services.json or Android values.xml. Refusing to write it.'
    );
  }

  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Could not read ${filePath}: ${error.code || 'read failed'}`);
  }

  const occurrences = contents.split(PLACEHOLDER).length - 1;
  if (occurrences === 0) {
    const message = `Placeholder ${PLACEHOLDER} was not found in ${path.basename(filePath)}.`;
    if (onEas) {
      fail(message);
    }
    console.warn(message);
    return;
  }

  const next = contents.split(PLACEHOLDER).join(apiKey);
  try {
    JSON.parse(next);
  } catch (error) {
    fail('Refusing to write google-services.json because the result is not valid JSON.');
  }
  fs.writeFileSync(filePath, next);
  console.log(
    `Wrote the Firebase Android API key into ${path.basename(filePath)} (${occurrences} replacement${occurrences === 1 ? '' : 's'}). The key is not logged.`
  );
  if (!onEas) {
    console.warn('Do not commit google-services.json after a local injection.');
  }
}

main();
