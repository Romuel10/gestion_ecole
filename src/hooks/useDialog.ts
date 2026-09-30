import { useLayoutEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
let previousOverflow = '';

/** One active keyboard scope, including nested dialogs. */
export function useDialog(isOpen: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialogs.push(dialog);
    if (!dialog.contains(document.activeElement)) (dialog.querySelector<HTMLElement>('[data-dialog-autofocus]') || dialog).focus();
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]'
    )].filter((el) => el.tabIndex >= 0 && !el.matches(':disabled, [inert]') && el.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const controls = focusable();
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && event.target instanceof Node && !dialog.contains(event.target)) dialog.focus();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      const index = dialogs.indexOf(dialog);
      if (index !== -1) dialogs.splice(index, 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && (!dialogs.length || dialogs.at(-1)?.contains(previousFocus))) previousFocus.focus();
    };
  }, [isOpen]);
  return ref;
}
