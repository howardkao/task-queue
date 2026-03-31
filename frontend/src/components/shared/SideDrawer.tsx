import type { ReactNode } from 'react';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SideDrawer({ open, onClose, title, children }: SideDrawerProps) {
  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={backdropStyle} />
      <div style={drawerStyle}>
        <div style={headerStyle}>
          <div style={titleStyle}>{title}</div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={contentStyle}>
          {children}
        </div>
      </div>
    </>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(29, 33, 43, 0.18)',
  zIndex: 40,
};

const drawerStyle: React.CSSProperties = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  bottom: '12px',
  width: 'min(88vw, 420px)',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '16px',
  boxShadow: '0 24px 60px rgba(29, 33, 43, 0.15)',
  zIndex: 41,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid #EFEDEB',
  background: '#F9F7F6',
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#1D212B',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const closeBtnStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  border: '1px solid #E7E3DF',
  borderRadius: '10px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  color: '#6b7280',
  fontFamily: 'inherit',
};

const contentStyle: React.CSSProperties = {
  padding: '14px',
  overflowY: 'auto',
  flex: 1,
};
