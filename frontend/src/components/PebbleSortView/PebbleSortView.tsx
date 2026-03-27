import { useState, useCallback } from 'react';
import { PebbleRow } from './PebbleRow';
import { usePebbles, useCompleteTask, useIceboxTask } from '../../hooks/useTasks';
import { reorderPebbles as reorderPebblesApi } from '../../api/tasks';
import type { Task } from '../../types';

export function PebbleSortView() {
  const { data: pebbles = [], isLoading } = usePebbles();
  const completeTask = useCompleteTask();
  const iceboxTask = useIceboxTask();

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  // Local optimistic reorder state
  const [localOrder, setLocalOrder] = useState<Task[] | null>(null);

  const displayPebbles = localOrder || pebbles;

  const persistOrder = useCallback(async (newList: Task[]) => {
    const order = newList.map((t, i) => ({
      id: t.id,
      sortOrder: (i + 1) * 1000,
    }));
    try {
      await reorderPebblesApi(order);
    } catch (e) {
      console.error('Failed to persist order:', e);
    }
  }, []);

  const applyReorder = useCallback((fromIdx: number, toIdx: number) => {
    const list = [...displayPebbles];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setLocalOrder(list);
    persistOrder(list);
  }, [displayPebbles, persistOrder]);

  const handleBumpToTop = useCallback((id: string) => {
    const idx = displayPebbles.findIndex(t => t.id === id);
    if (idx > 0) applyReorder(idx, 0);
  }, [displayPebbles, applyReorder]);

  const handleDropBy10 = useCallback((id: string) => {
    const idx = displayPebbles.findIndex(t => t.id === id);
    if (idx >= 0) {
      const newIdx = Math.min(idx + 10, displayPebbles.length - 1);
      if (newIdx !== idx) applyReorder(idx, newIdx);
    }
  }, [displayPebbles, applyReorder]);

  const handleComplete = useCallback((id: string) => {
    // Optimistically remove from local list
    setLocalOrder(prev => (prev || pebbles).filter(t => t.id !== id));
    completeTask.mutate(id);
  }, [pebbles, completeTask]);

  const handleIcebox = useCallback((id: string) => {
    setLocalOrder(prev => (prev || pebbles).filter(t => t.id !== id));
    iceboxTask.mutate(id);
  }, [pebbles, iceboxTask]);

  // Drag handlers
  const handleDragStart = useCallback((_e: React.DragEvent, index: number) => {
    setDragFromIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((_e: React.DragEvent, toIndex: number) => {
    setDragOverIndex(null);
    if (dragFromIndex !== null && dragFromIndex !== toIndex) {
      applyReorder(dragFromIndex, toIndex);
    }
    setDragFromIndex(null);
  }, [dragFromIndex, applyReorder]);

  // Reset local order when server data changes and we're not mid-drag
  if (localOrder && pebbles.length !== localOrder.length && dragFromIndex === null) {
    setLocalOrder(null);
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: '#6b7280',
        marginBottom: '16px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Pebbles ({displayPebbles.length} active)
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
          Loading...
        </div>
      )}

      {!isLoading && displayPebbles.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#9ca3af',
          fontStyle: 'italic',
          fontSize: '15px',
        }}>
          No pebbles yet — classify some tasks from the Triage view.
        </div>
      )}

      {displayPebbles.map((task, index) => (
        <PebbleRow
          key={task.id}
          task={task}
          index={index}
          totalCount={displayPebbles.length}
          onBumpToTop={handleBumpToTop}
          onDropBy10={handleDropBy10}
          onComplete={handleComplete}
          onIcebox={handleIcebox}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          isDragOver={dragOverIndex === index}
        />
      ))}
    </div>
  );
}
