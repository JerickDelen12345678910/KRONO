import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  GoogleAuthProvider, onAuthStateChanged, signInWithPopup,
  signOut as fbSignOut, deleteUser, reauthenticateWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { AppError, ERROR_CODE } from '../lib/errors';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const AuthContext = createContext(null);

const DEMO_USER = { uid: 'demo', displayName: 'Alex Dela Cruz', email: 'alex@example.com', photoURL: null };
const OPTIONAL = { userType: '', school: '', course: '', yearLevel: '' };
const fromAuth = (u) => ({ displayName: u.displayName || '', email: u.email || '', photoURL: u.photoURL || null, ...OPTIONAL });

export function AuthProvider({ children }) {
  const online = useOnlineStatus();
  const [user, setUser] = useState(isFirebaseConfigured ? null : DEMO_USER);
  const [profile, setProfile] = useState(isFirebaseConfigured ? null : { ...fromAuth(DEMO_USER), userType: 'Student', school: 'Sample University', course: 'BSCS', yearLevel: '3rd year' });
  const [loading, setLoading] = useState(isFirebaseConfigured);

  // Create the profile on first sign-in; otherwise load it.
  const loadProfile = useCallback(async (u) => {
    const ref = doc(db, 'users', u.uid);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
      const data = { ...fromAuth(u), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(ref, data);
      return { ...fromAuth(u) };
    } catch {
      return fromAuth(u); // offline or not cached yet: fall back to the sign-in details
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setProfile(u ? await loadProfile(u) : null);
      setLoading(false);
    });
  }, [loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);

  const updateProfile = useCallback(async (changes) => {
    const next = { ...profile, ...changes };
    setProfile(next);
    if (isFirebaseConfigured && user) {
      await updateDoc(doc(db, 'users', user.uid), { ...changes, updatedAt: serverTimestamp() });
    }
  }, [profile, user]);

  // Product rule: no sign-out while offline, so local data stays protected.
  const signOut = useCallback(async () => {
    if (!navigator.onLine) throw new AppError(ERROR_CODE.OFFLINE, 'Offline.');
    if (isFirebaseConfigured) await fbSignOut(auth);
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!navigator.onLine) throw new AppError(ERROR_CODE.OFFLINE, 'Offline.');
    if (!isFirebaseConfigured) return;
    const current = auth.currentUser;
    // Later phases: also delete this user's schedules, workouts, and Storage files here.
    const remove = async () => { await deleteDoc(doc(db, 'users', current.uid)); await deleteUser(current); };
    try { await remove(); } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        await reauthenticateWithPopup(current, new GoogleAuthProvider());
        await remove();
      } else throw e;
    }
  }, []);

  const value = useMemo(() => ({
    user, profile, loading, online, demo: !isFirebaseConfigured,
    signInWithGoogle, signOut, updateProfile, deleteAccount,
  }), [user, profile, loading, online, signInWithGoogle, signOut, updateProfile, deleteAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
