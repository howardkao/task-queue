import type { Task, Classification } from '../../types';
import { formatFirestoreDateShort } from '@/lib/firestoreTime';
import { ProjectDetailTaskRow } from './ProjectDetailTaskRow';
import {
  btnSmStyle,
  completedTaskStyle,
  emptyTaskStyle,
  sectionHeaderStyle,
} from './projectDetailStyles';

export function ProjectDetailTaskRail({
  isMobile,
  newTaskTitle,
  setNewTaskTitle,
  newTaskType,
  setNewTaskType,
  onAddTask,
  boulders,
  rocks,
  pebbles,
  unclassified,
  onCompleteTask,
  onIceboxTask,
  showCompleted,
  setShowCompleted,
  completedTasks,
  expandedTaskId,
  onExpandedTaskIdChange,
}: {
  isMobile: boolean;
  newTaskTitle: string;
  setNewTaskTitle: (v: string) => void;
  newTaskType: Classification;
  setNewTaskType: (c: Classification) => void;
  onAddTask: () => void;
  boulders: Task[];
  rocks: Task[];
  pebbles: Task[];
  unclassified: Task[];
  onCompleteTask: (id: string) => void;
  onIceboxTask: (id: string) => void;
  showCompleted: boolean;
  setShowCompleted: (v: boolean) => void;
  completedTasks: Task[];
  expandedTaskId: string | null;
  onExpandedTaskIdChange: (taskId: string | null) => void;
}) {
  return (
    <div style={{ width: isMobile ? '100%' : '320px', flexShrink: 0 }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddTask()}
            placeholder="Add a task..."
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '2px solid #E7E3DF',
              borderRadius: '12px',
              fontSize: '13px',
              fontFamily: 'inherit',
              outline: 'none',
              color: '#1D212B',
            }}
          />
          <button type="button" onClick={onAddTask} style={btnSmStyle}>
            Add
          </button>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {(['boulder', 'rock', 'pebble'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setNewTaskType(type)}
              style={{
                ...btnSmStyle,
                background: newTaskType === type ? '#EA6657' : '#F2F0ED',
                color: newTaskType === type ? '#fff' : '#1D212B',
                borderColor: newTaskType === type ? '#EA6657' : '#E7E3DF',
                textTransform: 'capitalize',
                fontWeight: 700,
              }}
            >
              {type === 'boulder' ? '🪨 Boulder' : type === 'rock' ? 'Rock' : 'Pebble'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Boulders</h2>
        {boulders.length === 0 && <div style={emptyTaskStyle}>No boulders yet</div>}
        {boulders.map((t) => (
          <ProjectDetailTaskRow
            key={t.id}
            task={t}
            expandedTaskId={expandedTaskId}
            onExpandedTaskIdChange={onExpandedTaskIdChange}
            onComplete={onCompleteTask}
            onIcebox={onIceboxTask}
          />
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Rocks</h2>
        {rocks.length === 0 && <div style={emptyTaskStyle}>No rocks yet</div>}
        {rocks.map((t) => (
          <ProjectDetailTaskRow
            key={t.id}
            task={t}
            expandedTaskId={expandedTaskId}
            onExpandedTaskIdChange={onExpandedTaskIdChange}
            onComplete={onCompleteTask}
            onIcebox={onIceboxTask}
          />
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Pebbles</h2>
        {pebbles.length === 0 && <div style={emptyTaskStyle}>No pebbles yet</div>}
        {pebbles.map((t) => (
          <ProjectDetailTaskRow
            key={t.id}
            task={t}
            expandedTaskId={expandedTaskId}
            onExpandedTaskIdChange={onExpandedTaskIdChange}
            onComplete={onCompleteTask}
            onIcebox={onIceboxTask}
          />
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Unclassified</h2>
        {unclassified.length === 0 && <div style={emptyTaskStyle}>No unclassified tasks</div>}
        {unclassified.map((t) => (
          <ProjectDetailTaskRow
            key={t.id}
            task={t}
            expandedTaskId={expandedTaskId}
            onExpandedTaskIdChange={onExpandedTaskIdChange}
            onComplete={onCompleteTask}
            onIcebox={onIceboxTask}
          />
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div
          onClick={() => setShowCompleted(!showCompleted)}
          style={{ cursor: 'pointer', color: '#6b7280', fontSize: '14px', userSelect: 'none' }}
        >
          Completed ({completedTasks.length}) {showCompleted ? '▲' : '▼'}
        </div>
        {showCompleted && (
          <div style={{ marginTop: '8px' }}>
            {completedTasks.length === 0 && <div style={emptyTaskStyle}>No completed tasks</div>}
            {completedTasks.map((t) => (
              <div key={t.id} style={completedTaskStyle}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    background: '#EA6657',
                    border: '2px solid #EA6657',
                    borderRadius: '6px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: '#fff',
                  }}
                >
                  ✓
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, textDecoration: 'line-through', color: '#9ca3af' }}>
                    {t.title}
                  </span>
                  {t.completedAt && (
                    <div style={{ fontSize: '10px', color: '#d1d5db' }}>{formatFirestoreDateShort(t.completedAt)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: '12px',
          fontSize: '12px',
          color: '#9ca3af',
          fontStyle: 'italic',
          lineHeight: '1.5',
        }}
      >
        Tasks can be generated via assistant workflows.
        <br />
        &quot;What should I work on next for this project?&quot;
      </div>
    </div>
  );
}
