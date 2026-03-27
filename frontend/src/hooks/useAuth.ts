import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface CachedUser {
  uid: string;
  email: string | null;
  isAdmin: boolean;
}

const DB_NAME = 'taskqueue-auth';
const STORE_NAME = 'meta';
const CACHE_KEY = 'cachedUser';

// IndexedDB helpers for offline-first auth
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCachedUser(user: CachedUser): Promise<void> {
  const idb = await openDB();
  const tx = idb.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(user, CACHE_KEY);
}

async function loadCachedUser(): Promise<CachedUser | null> {
  try {
    const idb = await openDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function clearCachedUser(): Promise<void> {
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(CACHE_KEY);
  } catch {
    // ignore
  }
}

export interface AuthState {
  user: CachedUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<CachedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load cached user immediately for offline-first
    loadCachedUser().then(cached => {
      if (cached) {
        setUser(cached);
        setLoading(false);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check admin status
        let isAdmin = false;
        try {
          const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
          isAdmin = adminDoc.exists();
        } catch {
          // offline — use cached value if available
          const cached = await loadCachedUser();
          if (cached?.uid === firebaseUser.uid) {
            isAdmin = cached.isAdmin;
          }
        }

        const userInfo: CachedUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          isAdmin,
        };
        setUser(userInfo);
        saveCachedUser(userInfo);
      } else {
        setUser(null);
        clearCachedUser();
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleSignOut = useCallback(async () => {
    await firebaseSignOut(auth);
    await clearCachedUser();
    setUser(null);
  }, []);

  return { user, loading, signOut: handleSignOut };
}
