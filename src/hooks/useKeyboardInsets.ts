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

const keepFocusedFieldVisible = () => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.matches('input, textarea, [contenteditable="true"]')) return;

  const viewport = window.visualViewport;
  const visibleTop = viewport?.offsetTop ?? 0;
  const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
  const rect = active.getBoundingClientRect();
  const margin = 28;

  if (rect.bottom > visibleBottom - margin || rect.top < visibleTop + margin) {
    active.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
  }
};

/**
 * Android keyboard handling.
 *
 * The native keyboard can resize the WebView several frames after focus.
 * Keep the root scrollable while typing and re-check the focused field after
 * the viewport settles so phone/OTP fields never remain behind the keyboard.
 */
export const useKeyboardInsets = () => {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let timers: number[] = [];
    const scheduleVisibilityCheck = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [
        window.setTimeout(keepFocusedFieldVisible, 40),
        window.setTimeout(keepFocusedFieldVisible, 180),
        window.setTimeout(keepFocusedFieldVisible, 360),
      ];
    };

    const showListener = Keyboard.addListener('keyboardWillShow', (info: KeyboardInfo) => {
      const height = Math.max(0, Number(info.keyboardHeight || 0));
      setKeyboardInset(height);
      scheduleVisibilityCheck();
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardInset(0);
    });

    const focusHandler = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) {
        scheduleVisibilityCheck();
      }
    };

    const viewportHandler = () => {
      if (document.documentElement.classList.contains('iftin-keyboard-open')) {
        scheduleVisibilityCheck();
      }
    };

    document.addEventListener('focusin', focusHandler);
    window.visualViewport?.addEventListener('resize', viewportHandler);
    window.visualViewport?.addEventListener('scroll', viewportHandler);

    return () => {
      showListener.then((handle) => handle.remove());
      hideListener.then((handle) => handle.remove());
      document.removeEventListener('focusin', focusHandler);
      window.visualViewport?.removeEventListener('resize', viewportHandler);
      window.visualViewport?.removeEventListener('scroll', viewportHandler);
      timers.forEach((timer) => window.clearTimeout(timer));
      setKeyboardInset(0);
    };
  }, []);
};
