import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

const setKeyboardOpen = (open: boolean) => {
  document.documentElement.classList.toggle('iftin-keyboard-open', open);
};

const setInputFocused = (focused: boolean) => {
  document.documentElement.classList.toggle('iftin-input-focused', focused);
};

const keepFocusedFieldVisible = () => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.matches('input, textarea, [contenteditable="true"]')) return;

  const anchor = active.closest<HTMLElement>('[data-keyboard-anchor]') ?? active;
  const viewport = window.visualViewport;
  const visibleTop = viewport?.offsetTop ?? 0;
  const visibleHeight = Math.min(viewport?.height ?? window.innerHeight, window.innerHeight);
  const visibleBottom = visibleTop + visibleHeight;
  const rect = anchor.getBoundingClientRect();
  const margin = 20;

  if (rect.bottom > visibleBottom - margin || rect.top < visibleTop + margin) {
    anchor.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
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
    let blurTimer: number | null = null;

    const scheduleVisibilityCheck = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [
        window.setTimeout(keepFocusedFieldVisible, 0),
        window.setTimeout(keepFocusedFieldVisible, 80),
        window.setTimeout(keepFocusedFieldVisible, 180),
        window.setTimeout(keepFocusedFieldVisible, 320),
      ];
    };

    const showWillListener = Keyboard.addListener('keyboardWillShow', () => {
      setKeyboardOpen(true);
      scheduleVisibilityCheck();
    });

    const showDidListener = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardOpen(true);
      scheduleVisibilityCheck();
    });

    const hideWillListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardOpen(false);
    });

    const hideDidListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
    });

    const focusHandler = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches('input, textarea, [contenteditable="true"]')) return;

      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }

      // Unlock the fixed launch-height shell immediately, before Android opens
      // the IME. Native adjustResize can then make the WebView shorter and the
      // focused phone/OTP field can scroll inside that real visible area.
      setInputFocused(true);
      scheduleVisibilityCheck();
    };

    const blurHandler = () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        const active = document.activeElement;
        const stillEditing =
          active instanceof HTMLElement &&
          active.matches('input, textarea, [contenteditable="true"]');
        if (!stillEditing) setInputFocused(false);
      }, 120);
    };

    const viewportHandler = () => {
      if (
        document.documentElement.classList.contains('iftin-keyboard-open') ||
        document.documentElement.classList.contains('iftin-input-focused')
      ) {
        scheduleVisibilityCheck();
      }
    };

    document.addEventListener('focusin', focusHandler);
    document.addEventListener('focusout', blurHandler);
    window.addEventListener('resize', viewportHandler);
    window.visualViewport?.addEventListener('resize', viewportHandler);
    window.visualViewport?.addEventListener('scroll', viewportHandler);

    return () => {
      showWillListener.then((handle) => handle.remove());
      showDidListener.then((handle) => handle.remove());
      hideWillListener.then((handle) => handle.remove());
      hideDidListener.then((handle) => handle.remove());
      document.removeEventListener('focusin', focusHandler);
      document.removeEventListener('focusout', blurHandler);
      window.removeEventListener('resize', viewportHandler);
      window.visualViewport?.removeEventListener('resize', viewportHandler);
      window.visualViewport?.removeEventListener('scroll', viewportHandler);
      timers.forEach((timer) => window.clearTimeout(timer));
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      setKeyboardOpen(false);
      setInputFocused(false);
    };
  }, []);
};
