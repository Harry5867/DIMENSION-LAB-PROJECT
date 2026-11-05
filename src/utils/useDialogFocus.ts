import { useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];

/** Contain keyboard focus, close only the top dialog, then return to its opener. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void, initialFocus?: string) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogs.push(dialog);
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(node => !node.matches(':disabled, [tabindex="-1"]') && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0);
    const focusFirst = () => {
      const nodes = focusable();
      const preferred = initialFocusRef.current ? dialog.querySelector<HTMLElement>(initialFocusRef.current) : null;
      (preferred && nodes.includes(preferred) ? preferred : nodes[0] ?? dialog).focus();
    };
    const frame = requestAnimationFrame(focusFirst);
    const keydown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current();
      } else if (event.key === 'Tab') {
        const nodes = focusable();
        const current = document.activeElement;
        if (!nodes.length) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (current === nodes[0] || !dialog.contains(current))) { event.preventDefault(); nodes.at(-1)!.focus(); }
        else if (!event.shiftKey && (current === nodes.at(-1) || !dialog.contains(current))) { event.preventDefault(); nodes[0].focus(); }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin, true);
    return () => {
      cancelAnimationFrame(frame);
      dialogs.splice(dialogs.indexOf(dialog), 1);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  return ref;
}
