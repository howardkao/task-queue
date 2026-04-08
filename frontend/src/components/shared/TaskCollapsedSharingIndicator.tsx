import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff } from 'lucide-react';
import type { CSSProperties, MouseEvent } from 'react';
import type { Task } from '../../types';
import { getTaskResponsibleUids, isSharedTask } from '../../taskPolicy';
import { taskSharingHoverSummary } from '../../lib/taskSharingUi';
import { TaskSharingStateModal } from './TaskSharingStateModal';

const AVATAR_PX = 20;
const STACK_OVERLAP = 7;
const TOOLTIP_SHOW_MS = 380;
const TOOLTIP_Z = 2050;

function hueForUid(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function initialForUid(uid: string, viewerUid: string, viewerEmail: string | null | undefined): string {
  if (uid === viewerUid && viewerEmail?.trim()) {
    const local = viewerEmail.trim().split('@')[0] ?? viewerEmail.trim();
    const ch = local.match(/[\p{L}\p{N}]/u)?.[0] ?? local[0] ?? '?';
    return ch.toUpperCase();
  }
  const fromUid = uid.match(/[a-zA-Z0-9]/)?.[0] ?? '?';
  return fromUid.toUpperCase();
}

export interface TaskCollapsedSharingIndicatorProps {
  task: Task;
  familyVisibleParent?: boolean;
  viewerUid: string;
  viewerEmail: string | null | undefined;
  style?: CSSProperties;
}

export function TaskCollapsedSharingIndicator({
  task,
  familyVisibleParent,
  viewerUid,
  viewerEmail,
  style: styleProp,
}: TaskCollapsedSharingIndicatorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const updateTipPosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTipPos({ left: r.left + r.width / 2, top: r.top });
  }, []);

  const scheduleShowTooltip = useCallback(() => {
    clearShowTimer();
    updateTipPosition();
    showTimerRef.current = setTimeout(() => {
      setTooltipVisible(true);
      updateTipPosition();
    }, TOOLTIP_SHOW_MS);
  }, [clearShowTimer, updateTipPosition]);

  const hideTooltip = useCallback(() => {
    clearShowTimer();
    setTooltipVisible(false);
    setTipPos(null);
  }, [clearShowTimer]);

  useEffect(() => {
    if (!tooltipVisible) return;
    const onScroll = () => updateTipPosition();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [tooltipVisible, updateTipPosition]);

  useEffect(() => () => clearShowTimer(), [clearShowTimer]);

  if (!familyVisibleParent) return null;

  const shared = isSharedTask(task, { familyVisible: true });
  const responsible = getTaskResponsibleUids(task);
  const summary = taskSharingHoverSummary(task, viewerUid);

  const wrapStyle = (): CSSProperties => ({
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'center',
    ...styleProp,
  });

  const openModal = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    hideTooltip();
    setModalOpen(true);
  };

  const visual = !shared ? (
    <EyeOff size={18} strokeWidth={2} color="#9ca3af" aria-hidden />
  ) : responsible.length === 0 ? (
    <span
      style={{
        width: AVATAR_PX,
        height: AVATAR_PX,
        borderRadius: '50%',
        border: '2px solid #d1d5db',
        boxSizing: 'border-box',
        background: 'transparent',
      }}
      aria-hidden
    />
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {responsible.map((uid, index) => (
        <span
          key={`${uid}-${index}`}
          style={{
            width: AVATAR_PX,
            height: AVATAR_PX,
            borderRadius: '50%',
            background: `hsl(${hueForUid(uid)} 52% 40%)`,
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: index > 0 ? -STACK_OVERLAP : 0,
            border: '2px solid #fff',
            boxSizing: 'border-box',
            lineHeight: 1,
            fontFamily: 'inherit',
          }}
          aria-hidden
        >
          {initialForUid(uid, viewerUid, viewerEmail)}
        </span>
      ))}
    </span>
  );

  const paddingRight =
    shared && responsible.length > 0
      ? Math.max(0, (responsible.length - 1) * (AVATAR_PX - STACK_OVERLAP))
      : 0;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openModal}
        onMouseEnter={scheduleShowTooltip}
        onMouseLeave={hideTooltip}
        aria-label="Sharing and responsibility"
        aria-haspopup="dialog"
        aria-expanded={modalOpen}
        className="cursor-pointer border-0 bg-transparent p-0 text-left"
        style={{
          ...wrapStyle(),
          paddingRight: paddingRight || undefined,
        }}
      >
        {visual}
      </button>

      {tooltipVisible && tipPos && !modalOpen
        ? createPortal(
            <div
              id={`task-sharing-tip-${task.id}`}
              role="tooltip"
              className="pointer-events-none max-w-[min(320px,calc(100vw-24px))] rounded-lg border border-border bg-popover px-3 py-2 text-[12px] leading-snug text-popover-foreground shadow-md"
              style={{
                position: 'fixed',
                left: tipPos.left,
                top: tipPos.top - 8,
                transform: 'translate(-50%, -100%)',
                zIndex: TOOLTIP_Z,
              }}
            >
              {summary}
            </div>,
            document.body,
          )
        : null}

      {modalOpen && (
        <TaskSharingStateModal
          task={task}
          onClose={() => setModalOpen(false)}
          familyVisibleParent={!!familyVisibleParent}
          viewerUid={viewerUid}
        />
      )}
    </>
  );
}
