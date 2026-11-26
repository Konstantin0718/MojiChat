import test from 'node:test';
import assert from 'node:assert/strict';

import { firebaseWebConfig, googleSignInErrorText } from './firebaseWebConfig.mjs';

const complete = {
  REACT_APP_FIREBASE_API_KEY: 'key',
  REACT_APP_FIREBASE_AUTH_DOMAIN: 'mijichat-7d13c.firebaseapp.com',
  REACT_APP_FIREBASE_PROJECT_ID: 'mijichat-7d13c',
  REACT_APP_FIREBASE_APP_ID: '1:1:web:abc',
};

test('firebase web config stays hidden until every required value is set', () => {
  assert.equal(firebaseWebConfig({}), null);
  assert.equal(firebaseWebConfig({ ...complete, REACT_APP_FIREBASE_APP_ID: '  ' }), null);
  assert.deepEqual(firebaseWebConfig(complete), {
    apiKey: 'key',
    authDomain: 'mijichat-7d13c.firebaseapp.com',
    projectId: 'mijichat-7d13c',
    appId: '1:1:web:abc',
  });
  assert.equal(
    firebaseWebConfig({ ...complete, REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '1070' }).messagingSenderId,
    '1070',
  );
});

test('a password-account conflict is shown in English', () => {
  assert.equal(googleSignInErrorText({ code: 'auth/popup-closed-by-user' }), '');
  assert.equal(
    googleSignInErrorText({ message: 'Google sign-in is loading, try again' }),
    'Google sign-in is loading, try again',
  );
  assert.equal(
    googleSignInErrorText({ response: { data: { detail: 'password_account' } } }),
    'This email has a password account. Sign in with your password or reset it via Forgot password, then you can also use Google.',
  );
});
