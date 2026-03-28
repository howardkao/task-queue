import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Try service account key file first, fall back to application default credentials
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (saPath) {
  const sa = JSON.parse(readFileSync(saPath, 'utf8')) as ServiceAccount;
  initializeApp({ credential: cert(sa) });
} else {
  // Requires gcloud auth application-default login, or running in a GCP environment
  initializeApp({ projectId: requireEnv('FIREBASE_PROJECT_ID') });
}

export const db = getFirestore();
export const OWNER_UID = requireEnv('OWNER_UID');
export { FieldValue, Timestamp };
