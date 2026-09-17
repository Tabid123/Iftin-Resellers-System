import c0 from '@/assets/phoneEntryPromptChunks/0';
import c1 from '@/assets/phoneEntryPromptChunks/1';
import c2 from '@/assets/phoneEntryPromptChunks/2';
import c3 from '@/assets/phoneEntryPromptChunks/3';
import c4 from '@/assets/phoneEntryPromptChunks/4';
import c5 from '@/assets/phoneEntryPromptChunks/5';
import c6 from '@/assets/phoneEntryPromptChunks/6';

// Full 2.23s recording supplied by the user. Playback receives one continuous source.
export const phoneEntryPrompt = `data:audio/mpeg;base64,${c0}${c1}${c2}${c3}${c4}${c5}${c6}`;

// Pre-create and decode the prompt before the user taps the phone field. Creating
// Audio only inside pointerdown can lose the browser/WebView user-activation window
// while a data URL is being decoded, which made playback silently fail on some devices.
let preparedPrompt: HTMLAudioElement | null = null;

const getPreparedPrompt = () => {
  if (typeof window === 'undefined') return null;
  if (!preparedPrompt) {
    preparedPrompt = new Audio(phoneEntryPrompt);
    preparedPrompt.preload = 'auto';
    preparedPrompt.volume = 1;
    preparedPrompt.load();
  }
  return preparedPrompt;
};

export const playPreparedPhoneEntryPrompt = () => {
  const audio = getPreparedPrompt();
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  void audio.play().catch((error) => {
    console.warn('[phone-entry-prompt] playback failed', error);
  });
};

if (typeof document !== 'undefined') {
  getPreparedPrompt();
  // Use click because it is a reliable browser/WebView user gesture. Only the
  // actual phone-number input triggers the voice; code fields and page load do not.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === 'phone') {
      playPreparedPhoneEntryPrompt();
    }
  });
}
