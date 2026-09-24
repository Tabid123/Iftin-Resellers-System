import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

const setKeyboardInset = (height: number) => {
  document.documentElement.style.setProperty(
    '--iftin-keyboard-inset',
    `${Math.max(0, Math.round(height))}px`,
  );
  document.documentElement.classList.toggle('iftin-keyboard-open', height > 0);
};

/**
 * Lightweight Android keyboard handling.
 *
 * Capacitor's resize mode already owns layout resizing. Do not keep keyboard
 * height in React state at the root (that re-rendered the entire active route),
 * and do not schedule repeated visualViewport/focus scroll loops.
 */
export const useKeyboardInsets = () => {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const showListener = Keyboard.addListener('keyboardWillShow', (info: KeyboardInfo) => {
      const height = Math.max(0, Number(info.keyboardHeight || 0));
      setKeyboardInset(height);

      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]')) {
          active.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }
      }, 100);
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardInset(0);
    });

    return () => {
      showListener.then((handle) => handle.remove());
      hideListener.then((handle) => handle.remove());
      setKeyboardInset(0);
    };
  }, []);
};
