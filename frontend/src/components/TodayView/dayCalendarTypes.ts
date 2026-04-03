/** While dragging a placed task, events are driven from preview so the card can move between day columns. */
export interface PlacedTaskDragPreview {
  taskId: string;
  dateKey: string;
  startHour: number;
  duration: number;
  allDay: boolean;
}

export interface CalEvent {
  id: string;
  title: string;
  startHour: number;
  duration: number;
  type: 'meeting' | 'personal' | 'boulder' | 'rock' | 'pebble';
  allDay?: boolean;
  busy?: boolean;
  projectName?: string;
  color?: string;
  description?: string;
  location?: string;
  uid?: string;
  rrule?: string;
  rawStart?: string;
  rawEnd?: string;
}
