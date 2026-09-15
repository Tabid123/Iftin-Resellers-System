import { useEffect } from 'react';

export function useVisualViewport() {
  useEffect(() => {
    if (!window.visualViewport) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${window.visualViewport!.height}px`
      );
    };

    // Height changes matter when the keyboard/orientation changes. Normal page
    // scrolling does not change the value we need, so don't write CSS on every
    // visualViewport scroll event — that caused avoidable style/layout work
    // while the user was tapping or scrolling around the persistent nav.
    window.visualViewport.addEventListener('resize', updateHeight);
    updateHeight();

    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight);
    };
  }, []);
}
