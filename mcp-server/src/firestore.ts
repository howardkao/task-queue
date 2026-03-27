import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Firebase config: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  projectId: requireEnv('FIREBASE_PROJECT_ID'),
  appId: requireEnv('FIREBASE_APP_ID'),
  storageBucket: requireEnv('FIREBASE_STORAGE_BUCKET'),
  apiKey: requireEnv('FIREBASE_API_KEY'),
  authDomain: requireEnv('FIREBASE_AUTH_DOMAIN'),
  messagingSenderId: requireEnv('FIREBASE_MESSAGING_SENDER_ID'),
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Re-export utilities that tasks.ts and projects.ts need
export {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  firestoreLimit,
  serverTimestamp,
  Timestamp,
};
