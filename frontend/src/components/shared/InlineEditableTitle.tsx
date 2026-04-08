import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useUpdateTask } from '../../hooks/useTasks';
import { TASK_TITLE_FIELD_RIGHT_INSET_PX } from './taskTitleFieldConstants';

const textareaBoxStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  outline: 'none',
  resize: 'none',
  overflow: 'hidden',
  padding: 0,
  margin: 0,
  fontFamily: 'inherit',
  display: 'block',
  minWidth: 0,
  maxWidth: '100%',
};

const mirrorStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  zIndex: -1,
  whiteSpace: 'pre-wrap',
  visibility: 'hidden',
  pointerEvents: 'none',
  width: 'max-content',
  maxWidth: 'none',
  padding: 0,
  margin: 0,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export function InlineEditableTitle({
  taskId,
  initialTitle,
  style,
}: {
  taskId: string;
  initialTitle: string;
  style?: CSSProperties;
}) {
  const [value, setValue] = useState(initialTitle);
  const updateTask = useUpdateTask();
  const ref = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef(value);
  const savedRef = useRef(initialTitle);
  valueRef.current = value;

  const {
    width: _ignoreW,
    height: _ignoreH,
    minWidth: _ignoreMinW,
    maxWidth: _ignoreMaxW,
    alignSelf: _ignoreAlign,
    ...typographyStyle
  } = style ?? {};

  useEffect(() => {
    setValue(initialTitle);
    savedRef.current = initialTitle;
  }, [initialTitle]);

  const save = useCallback(() => {
    const current = valueRef.current;
    if (current !== savedRef.current) {
      savedRef.current = current;
      updateTask.mutate({ id: taskId, data: { title: current } });
    }
  }, [taskId, updateTask]);

  useEffect(() => () => save(), [save]);

  const syncTitleLayout = useCallback(() => {
    const el = ref.current;
    const wrap = rowRef.current;
    const mirror = measureRef.current;
    if (!el || !wrap || !mirror) return;
    const cs = getComputedStyle(wrap);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const maxW = wrap.clientWidth - pl - pr;
    // getBoundingClientRect avoids integer truncation; ceil prevents textarea clipping vs mirror
    const needed = Math.ceil(mirror.getBoundingClientRect().width);
    const w = Math.min(Math.max(needed, 1), maxW);
    el.style.width = `${w}px`;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    syncTitleLayout();
  }, [value, syncTitleLayout]);

  useEffect(() => {
    const wrap = rowRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => syncTitleLayout());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [syncTitleLayout]);

  return (
    <div
      ref={rowRef}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        paddingRight: TASK_TITLE_FIELD_RIGHT_INSET_PX,
      }}
    >
      <span ref={measureRef} aria-hidden style={{ ...mirrorStyle, ...typographyStyle }}>
        {value.length > 0 ? value : '\u00a0'}
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={1}
        style={{
          ...textareaBoxStyle,
          ...typographyStyle,
        }}
      />
    </div>
  );
}
