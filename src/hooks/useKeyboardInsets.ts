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
  const anchor = active.closest<HTMLElement>('[data-keyboard-anchor]') ?? active;
  const rect = anchor.getBoundingClientRect();
  const margin = 20;

  if (rect.bottom > visibleBottom - margin || rect.top < visibleTop + margin) {
    anchor.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });

    // scrollIntoView can target the locked document instead of the route/modal
    // scroller in Android WebView. Correct the nearest real scroll container too.
    const corrected = anchor.getBoundingClientRect();
    const delta = corrected.bottom - (visibleBottom - margin);
    if (delta > 0) {
      let parent = anchor.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (/auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
          parent.scrollBy({ top: delta + margin, behavior: 'auto' });
          return;
        }
        parent = parent.parentElement;
      }
      window.scrollBy({ top: delta + margin, behavior: 'auto' });
    }
  }
};

const updateVisibleHeight = () => {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--iftin-visible-height', `${Math.max(1, Math.round(height))}px`);
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
      updateVisibleHeight();
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
        updateVisibleHeight();
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
      document.documentElement.style.removeProperty('--iftin-visible-height');
    };
  }, []);
};
