import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../firebase';

type Mode = 'signin' | 'signup' | 'reset';

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const normalizedInviteCode = inviteCode.trim().toUpperCase();

  const handleSignIn = async () => {
    if (!email || !password) { setError('Email and password required'); return; }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      setError(e.code === 'auth/invalid-credential' ? 'Invalid email or password' : e.message);
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email || !password) { setError('Email and password required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const bootstrapDoc = await getDoc(doc(db, 'bootstrap', 'auth'));
      const isFirstUser = !bootstrapDoc.exists();
      let inviteDoc = null;

      if (!isFirstUser) {
        if (!normalizedInviteCode) { setError('Invite code required'); setLoading(false); return; }
        inviteDoc = await getDoc(doc(db, 'inviteCodes', normalizedInviteCode));
        if (!inviteDoc.exists()) { setError('Invalid invite code'); setLoading(false); return; }
        const codeData = inviteDoc.data();
        if (codeData.used) { setError('Invite code already used'); setLoading(false); return; }
        if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
          setError('Invite code expired');
          setLoading(false);
          return;
        }
      }

      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      if (isFirstUser) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'admins', user.uid), {
          email: user.email,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, 'bootstrap', 'auth'), {
          adminUid: user.uid,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } else {
        if (inviteDoc?.exists()) {
          await setDoc(doc(db, 'inviteCodes', normalizedInviteCode), {
            code: normalizedInviteCode,
            used: true,
            usedBy: user.uid,
            usedAt: serverTimestamp(),
          }, { merge: true });
        }
      }
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        setError('Account already exists — try signing in');
      } else {
        setError(e.message);
      }
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!email) { setError('Enter your email address'); return; }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent — check your inbox');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleSubmit = () => {
    if (mode === 'signin') handleSignIn();
    else if (mode === 'signup') handleSignUp();
    else handleReset();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#FBFAF9',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '40px 36px',
        width: '100%', maxWidth: '380px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{
          fontSize: '28px', fontWeight: 600, lineHeight: 1.2, color: '#1D212B',
          marginBottom: '4px', textAlign: 'center',
        }}>
          Task Queue
        </h1>
        <p style={{
          fontSize: '14px', color: '#9ca3af', textAlign: 'center', marginBottom: '28px',
        }}>
          {mode === 'signin' ? 'Sign in to continue' :
           mode === 'signup' ? 'Create your account' :
           'Reset your password'}
        </p>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #FCEDED', borderRadius: '10px',
            padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px',
            padding: '10px 14px', fontSize: '13px', color: '#16a34a', marginBottom: '16px',
          }}>
            {message}
          </div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={inputStyle}
          autoFocus
        />

        {mode !== 'reset' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={inputStyle}
          />
        )}

        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Invite code (not needed for first user)"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={inputStyle}
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: '12px',
            background: '#EA6657', color: '#fff', fontSize: '14px', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s ease',
            marginBottom: '16px',
          }}
        >
          {loading ? '...' :
           mode === 'signin' ? 'Sign In' :
           mode === 'signup' ? 'Create Account' :
           'Send Reset Email'}
        </button>

        <div style={{ textAlign: 'center', fontSize: '13px' }}>
          {mode === 'signin' && (
            <>
              <button onClick={() => { setMode('signup'); setError(''); }} style={linkBtn}>
                Create account
              </button>
              <span style={{ color: '#d1d5db', margin: '0 8px' }}>|</span>
              <button onClick={() => { setMode('reset'); setError(''); }} style={linkBtn}>
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button onClick={() => { setMode('signin'); setError(''); }} style={linkBtn}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'reset' && (
            <button onClick={() => { setMode('signin'); setError(''); setMessage(''); }} style={linkBtn}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '2px solid #E7E3DF',
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: '#1D212B',
  outline: 'none',
  marginBottom: '12px',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease',
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#EA6657',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  padding: 0,
};
