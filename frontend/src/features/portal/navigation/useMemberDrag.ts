import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { dragIntent } from './carousel';

type Drag = {
  id: number;
  x: number;
  y: number;
  origin?: { step: number; position: number };
  lastMove?: { x: number; time: number; velocity: number };
};

export function useMemberDrag(
  count: number,
  measure: (element: HTMLElement) => NonNullable<Drag['origin']>,
  move: (position: number) => void,
  settle: (position: number, velocity: number) => void,
) {
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  function end(event: PointerEvent<HTMLElement>, snap: boolean) {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null;
    if (!drag.origin) return;
    setDragging(false);
    const lastMove = drag.lastMove;
    const velocity = snap && lastMove && event.timeStamp - lastMove.time < 100 ? lastMove.velocity : 0;
    const released = drag.origin.position + (drag.x - (snap ? event.clientX : lastMove?.x ?? drag.x)) / drag.origin.step;
    if (snap) move(released);
    const coast = Math.max(-.32, Math.min(.32, velocity * 70));
    settle(Math.round(released + coast), velocity);
  }

  const dragHandlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick.current = false;
      if (count > 1) gesture.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      if (!drag.origin) {
        const intent = dragIntent(dx, event.clientY - drag.y, event.pointerType !== 'mouse');
        if (intent === 'pending') return;
        if (intent === 'scroll') {
          gesture.current = null;
          return;
        }
        const origin = measure(event.currentTarget);
        if (origin.step <= 0) return;
        event.currentTarget.setPointerCapture(drag.id);
        drag.origin = origin;
        setDragging(true);
        suppressClick.current = true;
      }
      const previous = drag.lastMove;
      const elapsed = previous ? event.timeStamp - previous.time : 0;
      const velocity = previous && elapsed > 0
        ? (previous.x - event.clientX) / (drag.origin.step * Math.max(8, elapsed))
        : 0;
      drag.lastMove = { x: event.clientX, time: event.timeStamp, velocity };
      move(drag.origin.position - dx / drag.origin.step);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, false),
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      if (event.target === event.currentTarget && event.buttons === 0) end(event, false);
    },
    onPointerLeave(event: PointerEvent<HTMLElement>) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) end(event, false);
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return { dragging, dragHandlers };
}
