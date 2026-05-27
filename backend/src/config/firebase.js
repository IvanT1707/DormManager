import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';
import { HttpError } from '../utils/http-error.js';

let firebaseApp;

function firebaseCredential() {
  const serviceAccountValues = [
    env.firebaseProjectId,
    env.firebaseClientEmail,
    env.firebasePrivateKey,
  ];
  const hasServiceAccountValue = serviceAccountValues.some(Boolean);

  if (hasServiceAccountValue && !serviceAccountValues.every(Boolean)) {
    throw new HttpError(503, 'Firebase service account environment values are incomplete.');
  }

  if (serviceAccountValues.every(Boolean)) {
    return cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    });
  }

  if (env.firebaseUseApplicationDefault || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return applicationDefault();
  }

  throw new HttpError(503, 'Firebase Authentication is not configured on the server.');
}

function firebaseAuth() {
  if (firebaseApp) {
    return getAuth(firebaseApp);
  }

  firebaseApp =
    getApps()[0] ??
    initializeApp({
      credential: firebaseCredential(),
      projectId: env.firebaseProjectId,
    });

  return getAuth(firebaseApp);
}

export async function verifyFirebaseIdToken(idToken) {
  if (env.nodeEnv === 'test' && idToken.startsWith('test:')) {
    const [uid, email] = idToken.slice(5).split('|');

    if (!uid) {
      throw new Error('Test token does not contain a uid.');
    }

    return { uid, email: email || undefined };
  }

  return firebaseAuth().verifyIdToken(idToken);
}

export async function createFirebaseAccount({ email, password, displayName }) {
  if (env.nodeEnv === 'test') {
    return { uid: `test-created-${email}` };
  }

  try {
    return await firebaseAuth().createUser({ email, password, displayName });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new HttpError(409, 'An authentication account with this email already exists.');
    }

    if (error.code === 'auth/invalid-password') {
      throw new HttpError(400, 'password must contain at least 6 characters.');
    }

    throw error;
  }
}

export async function deleteFirebaseAccount(uid) {
  if (!uid || env.nodeEnv === 'test') {
    return;
  }

  try {
    await firebaseAuth().deleteUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }
  }
}
