import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

interface InviteCode {
  id: string;
  code: string;
  used: boolean;
  usedBy?: string;
  createdAt: any;
  expiresAt: any;
}

interface AdminPanelProps {
  onClose: () => void;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    const snap = await getDocs(collection(db, 'inviteCodes'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as InviteCode));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setCodes(list);
    setLoading(false);
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleCreate = async () => {
    const code = generateCode();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    await setDoc(doc(db, 'inviteCodes', code), {
      code,
      used: false,
      createdAt: Timestamp.now(),
      expiresAt,
    });
    loadCodes();
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'inviteCodes', id));
    loadCodes();
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '28px',
        width: '100%', maxWidth: '420px', maxHeight: '70vh', overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
            Invite Codes
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af',
          }}>
            ✕
          </button>
        </div>

        <button onClick={handleCreate} style={{
          width: '100%', padding: '10px', border: 'none', borderRadius: '10px',
          background: '#FF7A7A', color: '#fff', fontSize: '14px', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', marginBottom: '16px',
        }}>
          Generate Invite Code
        </button>

        {loading && <div style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Loading...</div>}

        {!loading && codes.length === 0 && (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: '20px', fontSize: '14px' }}>
            No invite codes yet
          </div>
        )}

        {codes.map(c => {
          const expired = c.expiresAt && c.expiresAt.toDate() < new Date();
          const status = c.used ? 'Used' : expired ? 'Expired' : 'Active';
          const statusColor = c.used ? '#9ca3af' : expired ? '#f59e0b' : '#10b981';

          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', background: '#f9fafb', borderRadius: '10px',
              marginBottom: '6px', border: '1px solid #e5e7eb',
            }}>
              <code style={{
                flex: 1, fontSize: '14px', fontWeight: 600, color: '#1f2937',
                letterSpacing: '0.05em',
              }}>
                {c.code || c.id}
              </code>
              <span style={{ fontSize: '11px', fontWeight: 600, color: statusColor }}>{status}</span>
              {!c.used && !expired && (
                <button
                  onClick={() => handleCopy(c.code || c.id)}
                  style={{
                    padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '6px',
                    background: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                    color: copied === (c.code || c.id) ? '#10b981' : '#4b5563',
                  }}
                >
                  {copied === (c.code || c.id) ? 'Copied!' : 'Copy'}
                </button>
              )}
              <button
                onClick={() => handleDelete(c.id)}
                style={{
                  padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '6px',
                  background: '#fff', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                  color: '#ef4444',
                }}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
