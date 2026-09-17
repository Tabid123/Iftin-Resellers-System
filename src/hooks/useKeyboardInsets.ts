import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

const KEYBOARD_CLASS = 'iftin-keyboard-open';

const setKeyboardInset = (height: number) => {
  document.documentElement.style.setProperty('--iftin-keyboard-inset', `${Math.max(0, Math.round(height))}px`);
  document.documentElement.classList.toggle(KEYBOARD_CLASS, height > 0);
};

const scrollFocusedFieldIntoView = (keyboardHeight: number) => {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return;

  const field = activeElement.closest('input, textarea, [contenteditable="true"]');
  if (!(field instanceof HTMLElement)) return;

  const scroller = field.closest('.iftin-route-viewport') as HTMLElement | null;
  const viewport = window.visualViewport;
  const keyboardTopFromHeight = window.innerHeight - keyboardHeight;
  const visibleBottom = Math.min(
    scroller?.getBoundingClientRect().bottom ?? window.innerHeight,
    viewport ? viewport.offsetTop + viewport.height : window.innerHeight,
    keyboardTopFromHeight > 0 ? keyboardTopFromHeight : window.innerHeight,
  ) - 24;
  const visibleTop = Math.max(scroller?.getBoundingClientRect().top ?? 0, viewport?.offsetTop ?? 0) + 24;
  const rect = field.getBoundingClientRect();

  if (rect.bottom <= visibleBottom && rect.top >= visibleTop) return;

  const targetDelta = rect.bottom > visibleBottom
    ? rect.bottom - visibleBottom
    : rect.top - visibleTop;

  if (scroller) {
    scroller.scrollTo({ top: scroller.scrollTop + targetDelta, behavior: 'smooth' });
    return;
  }

  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

export const useKeyboardInsets = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const showListener = Keyboard.addListener('keyboardWillShow', (info: KeyboardInfo) => {
      const height = Math.max(0, info.keyboardHeight || 0);
      setKeyboardHeight(height);
      setIsKeyboardVisible(true);
      setKeyboardInset(height);

      [80, 180, 320].forEach((delay) => {
        window.setTimeout(() => scrollFocusedFieldIntoView(height), delay);
      });
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      setKeyboardInset(0);
    });

    return () => {
      showListener.then(handle => handle.remove());
      hideListener.then(handle => handle.remove());
      setKeyboardInset(0);
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
};
