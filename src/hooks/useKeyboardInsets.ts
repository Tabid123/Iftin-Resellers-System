import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardInfo } from '@capacitor/keyboard';

export const useKeyboardInsets = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const showListener = Keyboard.addListener('keyboardWillShow', (info: KeyboardInfo) => {
      console.log('Keyboard will show, height:', info.keyboardHeight);
      setKeyboardHeight(info.keyboardHeight);
      setIsKeyboardVisible(true);
      
      // Only scroll to focused element - Capacitor's Keyboard plugin handles resize
      setTimeout(() => {
        const activeElement = document.activeElement;
        if (activeElement && 'scrollIntoView' in activeElement) {
          (activeElement as HTMLElement).scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }, 100);
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      console.log('Keyboard will hide');
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    });

    return () => {
      showListener.then(handle => handle.remove());
      hideListener.then(handle => handle.remove());
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
};
