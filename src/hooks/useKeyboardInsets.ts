import { useEffect, useState } from 'react';
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

const scrollFocusedFieldIntoView = (keyboardHeight: number) => {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return;

  const field = activeElement.closest('input, textarea, [contenteditable="true"]');
  if (!(field instanceof HTMLElement)) return;

  const scroller = field.closest('.iftin-route-viewport') as HTMLElement | null;

  // First restore the old, reliable behavior: center the focused field in the
  // scrollable storefront as soon as the keyboard appears.
  field.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });

  // Then clamp it to the actually visible keyboard viewport. On modern Android
  // visualViewport is authoritative; only subtract keyboardHeight as a fallback
  // when visualViewport is unavailable, otherwise the keyboard gets counted twice.
  requestAnimationFrame(() => {
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewport
      ? viewport.offsetTop + viewport.height
      : Math.max(1, window.innerHeight - keyboardHeight);

    const scrollerRect = scroller?.getBoundingClientRect();
    const visibleTop = Math.max(scrollerRect?.top ?? 0, viewportTop) + 24;
    const visibleBottom = Math.min(scrollerRect?.bottom ?? viewportBottom, viewportBottom) - 24;
    const rect = field.getBoundingClientRect();

    let delta = 0;
    if (rect.bottom > visibleBottom) delta = rect.bottom - visibleBottom;
    else if (rect.top < visibleTop) delta = rect.top - visibleTop;

    if (delta === 0) return;

    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'auto' });
    } else {
      window.scrollBy({ top: delta, behavior: 'auto' });
    }
  });
};

export const useKeyboardInsets = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let currentKeyboardHeight = 0;

    const revealFocusedField = (height: number) => {
      [0, 70, 180, 320].forEach((delay) => {
        window.setTimeout(() => scrollFocusedFieldIntoView(height), delay);
      });
    };

    const handleShow = (info: KeyboardInfo) => {
      const height = Math.max(0, info.keyboardHeight || 0);
      currentKeyboardHeight = height;
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);
      setKeyboardInset(height);
      revealFocusedField(height);
    };

    const handleHide = () => {
      currentKeyboardHeight = 0;
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      setKeyboardInset(0);
    };

    const showListener = Keyboard.addListener('keyboardWillShow', handleShow);
    const didShowListener = Keyboard.addListener('keyboardDidShow', handleShow);
    const hideListener = Keyboard.addListener('keyboardWillHide', handleHide);
    const didHideListener = Keyboard.addListener('keyboardDidHide', handleHide);

    const handleFocusIn = () => {
      if (currentKeyboardHeight <= 0) return;
      revealFocusedField(currentKeyboardHeight);
    };

    const handleViewportResize = () => {
      if (currentKeyboardHeight <= 0) return;
      scrollFocusedFieldIntoView(currentKeyboardHeight);
    };

    document.addEventListener('focusin', handleFocusIn);
    window.visualViewport?.addEventListener('resize', handleViewportResize, { passive: true });

    return () => {
      showListener.then(handle => handle.remove());
      didShowListener.then(handle => handle.remove());
      hideListener.then(handle => handle.remove());
      didHideListener.then(handle => handle.remove());
      document.removeEventListener('focusin', handleFocusIn);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      setKeyboardInset(0);
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
};
