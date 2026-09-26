import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

const setKeyboardState = (open: boolean) => {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty(
    '--iftin-visual-height',
    `${Math.max(0, Math.round(viewportHeight))}px`,
  );
  document.documentElement.classList.toggle('iftin-keyboard-open', open);
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
    const surface = active.closest('.iftin-keyboard-dialog, .iftin-auth-page');
    if (surface instanceof HTMLElement) {
      const surfaceRect = surface.getBoundingClientRect();
      const targetTop = Math.max(0, surface.scrollTop + rect.top - surfaceRect.top - 72);
      surface.scrollTo({ top: targetTop, behavior: 'auto' });
    }
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

    const showListener = Keyboard.addListener('keyboardDidShow', (_info: KeyboardInfo) => {
      setKeyboardState(true);
      scheduleVisibilityCheck();
    });

    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardState(false);
    });

    const focusHandler = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) {
        scheduleVisibilityCheck();
      }
    };

    const viewportHandler = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--iftin-visual-height', `${Math.round(viewportHeight)}px`);
      if (document.documentElement.classList.contains('iftin-keyboard-open')) {
        scheduleVisibilityCheck();
      }
    };

    viewportHandler();

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
      setKeyboardState(false);
    };
  }, []);
};
