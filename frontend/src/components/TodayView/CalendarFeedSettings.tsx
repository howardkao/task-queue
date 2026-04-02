import { useState } from 'react';
import type { CalendarFeed } from '../../types';
import { useCalendarFeeds, useCreateFeed, useUpdateFeed, useDeleteFeed } from '../../hooks/useCalendar';

const PRESET_COLORS = [
  '#4285f4', // blue
  '#ea4335', // red
  '#34a853', // green
  '#fbbc04', // yellow
  '#ff6d01', // orange
  '#a142f4', // purple
  '#e91e63', // pink
  '#00bcd4', // teal
];

export function CalendarFeedSettings() {
  const { data: feeds = [], isLoading } = useCalendarFeeds();
  const createFeed = useCreateFeed();
  const updateFeed = useUpdateFeed();
  const deleteFeed = useDeleteFeed();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add form state
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addColor, setAddColor] = useState(PRESET_COLORS[0]);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editColor, setEditColor] = useState('');

  const [error, setError] = useState('');

  function resetAddForm() {
    setAddName('');
    setAddUrl('');
    setAddColor(PRESET_COLORS[0]);
    setShowAddForm(false);
    setError('');
  }

  function startEdit(feed: CalendarFeed) {
    setEditingId(feed.id);
    setEditName(feed.name);
    setEditUrl(''); // never pre-filled — server doesn't return URL
    setEditColor(feed.color);
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setError('');
  }

  async function handleAdd() {
    if (!addName.trim() || !addUrl.trim()) {
      setError('Name and URL are required');
      return;
    }
    setError('');
    try {
      await createFeed.mutateAsync({ name: addName.trim(), url: addUrl.trim(), color: addColor });
      resetAddForm();
    } catch (e: any) {
      setError(e.message || 'Failed to add feed');
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) {
      setError('Name is required');
      return;
    }
    setError('');
    const updates: Record<string, string> = { name: editName.trim(), color: editColor };
    if (editUrl.trim()) updates.url = editUrl.trim();
    try {
      await updateFeed.mutateAsync({ id, updates });
      cancelEdit();
    } catch (e: any) {
      setError(e.message || 'Failed to update feed');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFeed.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch (e: any) {
      setError(e.message || 'Failed to delete feed');
    }
  }

  async function handleToggle(feed: CalendarFeed) {
    try {
      await updateFeed.mutateAsync({ id: feed.id, updates: { enabled: !feed.enabled } });
    } catch (e: any) {
      setError(e.message || 'Failed to toggle feed');
    }
  }

  if (isLoading) {
    return <div style={{ padding: '8px 0', fontSize: '13px', color: '#9ca3af' }}>Loading feeds...</div>;
  }

  return (
    <div>
      <label style={sectionLabelStyle}>Calendar Feeds</label>

      {feeds.length === 0 && !showAddForm && (
        <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>
          No calendar feeds configured.
        </div>
      )}

      {/* Feed list */}
      {feeds.map(feed => (
        <div key={feed.id}>
          {editingId === feed.id ? (
            // Edit form
            <div style={feedFormStyle}>
              <FeedForm
                name={editName}
                onNameChange={setEditName}
                url={editUrl}
                onUrlChange={setEditUrl}
                urlPlaceholder="Enter new URL to change (leave blank to keep)"
                color={editColor}
                onColorChange={setEditColor}
              />
              <div style={formActionsStyle}>
                <button style={saveBtnStyle} onClick={() => handleUpdate(feed.id)} disabled={updateFeed.isPending}>
                  {updateFeed.isPending ? 'Saving...' : 'Save'}
                </button>
                <button style={cancelBtnStyle} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            // Feed row
            <div style={feedRowStyle}>
              <div
                style={{ ...colorDotStyle, backgroundColor: feed.color, opacity: feed.enabled ? 1 : 0.4 }}
              />
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: feed.enabled ? '#1D212B' : '#9ca3af' }}>
                {feed.name}
              </span>
              <button
                style={iconBtnStyle}
                onClick={() => handleToggle(feed)}
                title={feed.enabled ? 'Disable' : 'Enable'}
              >
                {feed.enabled ? 'on' : 'off'}
              </button>
              <button style={iconBtnStyle} onClick={() => startEdit(feed)} title="Edit">
                edit
              </button>
              {confirmDeleteId === feed.id ? (
                <span style={{ display: 'flex', gap: '4px' }}>
                  <button style={{ ...iconBtnStyle, color: '#DC2828' }} onClick={() => handleDelete(feed.id)}>
                    yes
                  </button>
                  <button style={iconBtnStyle} onClick={() => setConfirmDeleteId(null)}>
                    no
                  </button>
                </span>
              ) : (
                <button style={{ ...iconBtnStyle, color: '#DC2828' }} onClick={() => setConfirmDeleteId(feed.id)} title="Delete">
                  del
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add form */}
      {showAddForm ? (
        <div style={feedFormStyle}>
          <FeedForm
            name={addName}
            onNameChange={setAddName}
            url={addUrl}
            onUrlChange={setAddUrl}
            urlPlaceholder="https://calendar.google.com/calendar/ical/..."
            color={addColor}
            onColorChange={setAddColor}
          />
          <div style={formActionsStyle}>
            <button style={saveBtnStyle} onClick={handleAdd} disabled={createFeed.isPending}>
              {createFeed.isPending ? 'Adding...' : 'Add Feed'}
            </button>
            <button style={cancelBtnStyle} onClick={resetAddForm}>Cancel</button>
          </div>
        </div>
      ) : (
        <button style={addBtnStyle} onClick={() => { setShowAddForm(true); setError(''); }}>
          + Add Calendar
        </button>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

// ── Reusable form for add/edit ───────────────────────────────────────────────

function FeedForm({
  name, onNameChange,
  url, onUrlChange, urlPlaceholder,
  color, onColorChange,
}: {
  name: string; onNameChange: (v: string) => void;
  url: string; onUrlChange: (v: string) => void; urlPlaceholder: string;
  color: string; onColorChange: (v: string) => void;
}) {
  return (
    <>
      <input
        type="text"
        placeholder="Calendar name"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        style={inputStyle}
      />
      <input
        type="url"
        placeholder={urlPlaceholder}
        value={url}
        onChange={e => onUrlChange(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: c,
              border: color === c ? '2px solid #1D212B' : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
            }}
          />
        ))}
      </div>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  color: '#1D212B',
  marginBottom: '10px',
};

const feedRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 0',
  borderBottom: '1px solid #EFEDEB',
};

const colorDotStyle: React.CSSProperties = {
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  color: '#6b7280',
  padding: '2px 4px',
  fontFamily: 'inherit',
};

const feedFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
  background: '#F2F0ED',
  borderRadius: '10px',
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const formActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginTop: '4px',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  background: '#4285f4',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  background: '#E7E3DF',
  color: '#1D212B',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const addBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: 'none',
  border: '1px dashed #d1d5db',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#6b7280',
  cursor: 'pointer',
  fontFamily: 'inherit',
  marginTop: '4px',
};

const errorStyle: React.CSSProperties = {
  marginTop: '8px',
  padding: '8px 10px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  fontSize: '13px',
  color: '#dc2626',
};
