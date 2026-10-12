/**
 * Shared keyboard predicates (T3.10). Pure, framework-free helpers so every
 * global listener agrees on what "typing", "an activatable target", and
 * "a modifier chord" mean — the guards exist to keep single-key shortcuts
 * from stealing keystrokes from text entry, native activations, or the
 * browser/OS (WCAG 2.1.4, P1-18).
 */

/** True while focus sits on a text-entry surface. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  );
}

/**
 * True when a shortcut modifier chord is held. Ctrl/Cmd/Alt + a character
 * belongs to the browser or OS (Ctrl+1 tab switching, Cmd+…), never to
 * this app's single-key map.
 */
export function hasShortcutModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

/**
 * True for targets where Space/Enter already activates something (native
 * button behaviour or ARIA roles). A global Space shortcut must stand
 * down there instead of double-toggling the control that has focus.
 */
export function isActivatableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== 'function') return false;
  return (
    (target as HTMLElement).closest(
      'a[href], button, summary, select, input, textarea, ' +
        '[role="button"], [role="link"], [role="checkbox"], [role="switch"], ' +
        '[role="radio"], [role="tab"], [role="option"], [role="menuitem"], ' +
        '[role="treeitem"], [role="combobox"], [role="slider"], [role="spinbutton"]',
    ) !== null
  );
}

/**
 * True while a modal dialog is mounted. Radix unmounts closed dialogs, so
 * presence in the DOM means open — focus-stealing character shortcuts ("/")
 * must not run behind a modal.
 */
export function isModalOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}
