import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

const KEYBOARD_CLASS = 'iftin-keyboard-open';

const setKeyboardInset = (height: number) => {
  document.documentElement.style.setProperty(
    '--iftin-keyboard-inset',
    `${Math.max(0, Math.round(height))}px`,
  );
  document.documentElement.classList.toggle(KEYBOARD_CLASS, height > 0);
};

const revealFocusedField = () => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;

  const field = active.closest('input, textarea, [contenteditable="true"]') as HTMLElement | null;
  if (!field) return;

  const anchor =
    (field.closest('[data-keyboard-anchor]') as HTMLElement | null) ??
    field;

  // First let the browser/Android resized viewport do the simple correct thing.
  anchor.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });

  requestAnimationFrame(() => {
    const viewport = window.visualViewport;
    const top = (viewport?.offsetTop ?? 0) + 16;
    const bottom = viewport
      ? viewport.offsetTop + viewport.height - 20
      : window.innerHeight - 20;
    const rect = anchor.getBoundingClientRect();

    let delta = 0;
    if (rect.bottom > bottom) delta = rect.bottom - bottom;
    else if (rect.top < top) delta = rect.top - top;
    if (!delta) return;

    const dialog = anchor.closest('[role="dialog"]') as HTMLElement | null;
    const route = document.querySelector('.iftin-route-viewport') as HTMLElement | null;
    const scroller =
      dialog && dialog.scrollHeight > dialog.clientHeight
        ? dialog
        : route;

    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'auto' });
    } else {
      window.scrollBy({ top: delta, behavior: 'auto' });
    }
  });
};

export const useKeyboardInsets = () => {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const onShow = (info: KeyboardInfo) => {
      setKeyboardInset(Number(info.keyboardHeight || 0));
      window.setTimeout(revealFocusedField, 80);
      window.setTimeout(revealFocusedField, 220);
    };

    const onHide = () => setKeyboardInset(0);

    const showListener = Keyboard.addListener('keyboardDidShow', onShow);
    const hideListener = Keyboard.addListener('keyboardDidHide', onHide);

    const handleFocus = () => {
      if (!document.documentElement.classList.contains(KEYBOARD_CLASS)) return;
      window.setTimeout(revealFocusedField, 40);
    };
    document.addEventListener('focusin', handleFocus);

    return () => {
      showListener.then((handle) => handle.remove());
      hideListener.then((handle) => handle.remove());
      document.removeEventListener('focusin', handleFocus);
      setKeyboardInset(0);
    };
  }, []);
};
