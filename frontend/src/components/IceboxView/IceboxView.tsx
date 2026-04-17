import { useState, useMemo } from 'react';
import { useIceboxedTasks, useReactivateTask, useDeleteTask, useUpdateTask } from '../../hooks/useTasks';
import { useInvestments } from '../../hooks/useInvestments';
import { useAuth } from '../../hooks/useAuth';
import type { Task, TaskSize } from '../../types';
import { listCardTitleStyle } from '../shared/listCardStyles';
import {
  collapsedTaskMetaLineStyle,
  formatCollapsedTaskMetaLine,
  formatTaskDeadlineForMeta,
  formatTaskSizeForUi,
  sizeBadgeStyle,
} from '../shared/collapsedTaskMeta';
import { TaskCollapsedSharingIndicator } from '../shared/TaskCollapsedSharingIndicator';

export function IceboxView() {
  const { data: tasks = [], isLoading } = useIceboxedTasks();
  const { data: investments = [] } = useInvestments('active');
  const { user } = useAuth();
  const investmentById = useMemo(
    () => new Map(investments.map((inv) => [inv.id, inv])),
    [investments],
  );
  const reactivateTask = useReactivateTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const vitalTasks = tasks.filter(t => t.vital === true && t.size != null);
  const otherTasks = tasks.filter(t => t.vital === false && t.size != null);
  const needImportanceTasks = tasks.filter(t => t.vital === null && t.size != null);
  const unsizedTasks = tasks.filter(t => t.size == null);

  return (
    <div style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '20px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={sectionHeader}>
        Icebox ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
      </h2>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      )}

      {!isLoading && tasks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: '#9ca3af', fontStyle: 'italic', fontSize: '14px',
        }}>
          Nothing on ice.
        </div>
      )}

      {vitalTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Vital</h3>
          {vitalTasks.map(t => (
            <IceboxCard
              key={t.id}
              task={t}
              onReactivate={reactivateTask}
              onDelete={deleteTask}
              familyVisibleParent={
                t.investmentId ? investmentById.get(t.investmentId)?.familyVisible === true : false
              }
              viewerUid={user?.uid ?? ''}
              viewerEmail={user?.email}
            />
          ))}
        </>
      )}

      {otherTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Other</h3>
          {otherTasks.map(t => (
            <IceboxCard
              key={t.id}
              task={t}
              onReactivate={reactivateTask}
              onDelete={deleteTask}
              familyVisibleParent={
                t.investmentId ? investmentById.get(t.investmentId)?.familyVisible === true : false
              }
              viewerUid={user?.uid ?? ''}
              viewerEmail={user?.email}
            />
          ))}
        </>
      )}

      {needImportanceTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Set importance</h3>
          {needImportanceTasks.map(t => (
            <IceboxCard
              key={t.id}
              task={t}
              onReactivate={reactivateTask}
              onDelete={deleteTask}
              onSetVital={(v) => updateTask.mutate({ id: t.id, data: { vital: v } })}
              familyVisibleParent={
                t.investmentId ? investmentById.get(t.investmentId)?.familyVisible === true : false
              }
              viewerUid={user?.uid ?? ''}
              viewerEmail={user?.email}
            />
          ))}
        </>
      )}

      {unsizedTasks.length > 0 && (
        <>
          <h3 style={groupHeader}>Unsized</h3>
          {unsizedTasks.map(t => (
            <IceboxCard
              key={t.id}
              task={t}
              onReactivate={reactivateTask}
              onDelete={deleteTask}
              familyVisibleParent={
                t.investmentId ? investmentById.get(t.investmentId)?.familyVisible === true : false
              }
              viewerUid={user?.uid ?? ''}
              viewerEmail={user?.email}
            />
          ))}
        </>
      )}
    </div>
  );
}

function IceboxCard({ task, onReactivate, onDelete, onSetVital, familyVisibleParent, viewerUid, viewerEmail }: {
  task: Task;
  onReactivate: { mutate: (args: { id: string; size?: TaskSize }) => void };
  onDelete: { mutate: (id: string) => void };
  /** When set, show Vital / Other to resolve null `vital` while still iceboxed. */
  onSetVital?: (vital: boolean) => void;
  familyVisibleParent: boolean;
  viewerUid: string;
  viewerEmail: string | null | undefined;
}) {
  const [confirming, setConfirming] = useState(false);
  const deadlineLabel = formatTaskDeadlineForMeta(task.deadline);
  const collapsedMeta = formatCollapsedTaskMetaLine({
    deadlineLabel,
    showRecurrence: !!task.recurrence,
    prevCompletedLabel: null,
  });

  return (
    <div style={cardStyle}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={listCardTitleStyle}>{task.title}</span>
          </div>
          <TaskCollapsedSharingIndicator
            task={task}
            familyVisibleParent={familyVisibleParent}
            viewerUid={viewerUid}
            viewerEmail={viewerEmail}
          />
          {task.size && (
            <span style={sizeBadgeStyle}>{formatTaskSizeForUi(task.size)}</span>
          )}
        </div>
        {collapsedMeta && (
          <div style={collapsedTaskMetaLineStyle}>{collapsedMeta}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {onSetVital && (
          <>
            <button type="button" onClick={() => onSetVital(true)} style={iceboxVitalBtnStyle} title="Mark as vital">
              Vital
            </button>
            <button type="button" onClick={() => onSetVital(false)} style={iceboxOtherBtnStyle} title="Mark as other">
              Other
            </button>
            <span style={iceboxImportanceDividerStyle} aria-hidden>|</span>
          </>
        )}
        {(['S', 'M', 'L'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onReactivate.mutate({ id: task.id, size: s })}
            style={actionBtn}
            title={`Reactivate as ${formatTaskSizeForUi(s)}`}
          >
            {formatTaskSizeForUi(s)}
          </button>
        ))}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{ ...actionBtn, color: '#DC2828', borderColor: '#FCEDED' }}
            title="Delete permanently"
          >
            Delete
          </button>
        ) : (
          <button
            onClick={() => { onDelete.mutate(task.id); setConfirming(false); }}
            style={{ ...actionBtn, background: '#DC2828', color: '#fff', borderColor: '#DC2828' }}
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: '14px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  marginBottom: '12px',
  fontWeight: 500,
};

const groupHeader: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  fontWeight: 400,
  marginTop: '16px',
  marginBottom: '8px',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 14px',
  background: '#fff',
  border: '1px solid #E7E3DF',
  borderRadius: '8px',
  marginBottom: '6px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const actionBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #C9C4BE',
  borderRadius: '6px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 700,
  color: '#1D212B',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};

const iceboxVitalBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #D4CFC9',
  borderRadius: '999px',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  color: '#5c6470',
  fontFamily: 'inherit',
};

const iceboxOtherBtnStyle: React.CSSProperties = {
  ...iceboxVitalBtnStyle,
};

const iceboxImportanceDividerStyle: React.CSSProperties = {
  color: '#B8B2AB',
  fontSize: '13px',
  fontWeight: 300,
  userSelect: 'none',
  lineHeight: '26px',
  padding: '0 2px',
};
