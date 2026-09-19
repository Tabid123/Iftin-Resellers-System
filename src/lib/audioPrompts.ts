export type AudioPromptKind = 'phone' | 'otp' | 'offline';

const PRODUCTION_AUDIO_ORIGIN = 'https://iftinagents.com';

const DIRECT_AUDIO_SOURCES: Record<AudioPromptKind, string> = {
  phone: 'https://iftinagents.com/__l5e/assets-v1/035ae08a-83c5-483c-a7a7-fc834544cf83/phone-number-prompt.wav',
  otp: 'https://iftinagents.com/__l5e/assets-v1/bd53b427-602d-4cdb-9102-ac6c3d065c12/otp-code-prompt.wav',
  offline: 'https://iftinagents.com/__l5e/assets-v1/d208b555-c658-4bb2-9ad9-fb3aeac0e72f/offline-mode-prompt.wav',
};

const audioPool: Partial<Record<AudioPromptKind, HTMLAudioElement>> = {};
let activePrompt: HTMLAudioElement | null = null;

function isNativeLocalOrigin() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  const protocol = window.location.protocol;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'file:'
  );
}

function primarySource(kind: AudioPromptKind) {
  if (kind === 'phone') return phoneEntryPrompt;

  const path = `/api/public/audio-prompt?kind=${kind}`;
  return isNativeLocalOrigin() ? `${PRODUCTION_AUDIO_ORIGIN}${path}` : path;
}

function configureAudio(audio: HTMLAudioElement, src: string) {
  audio.preload = 'auto';
  audio.volume = 1;
  audio.muted = false;
  audio.playsInline = true;
  audio.src = src;
  audio.load();
}

function getOrCreatePrompt(kind: AudioPromptKind) {
  if (typeof window === 'undefined') return null;

  const existing = audioPool[kind];
  if (existing) return existing;

  const audio = new Audio();
  configureAudio(audio, primarySource(kind));
  audioPool[kind] = audio;
  return audio;
}

/**
 * Warm every recording early, but never call play() here.
 * Actual playback is always started from a real user gesture.
 */
export function primeAudioPrompts() {
  if (typeof window === 'undefined') return;
  getOrCreatePrompt('phone');
  getOrCreatePrompt('otp');
  getOrCreatePrompt('offline');
}

async function playElement(audio: HTMLAudioElement) {
  if (activePrompt && activePrompt !== audio) {
    activePrompt.pause();
  }

  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Metadata may not be loaded yet; play() can still start at the beginning.
  }

  activePrompt = audio;
  await audio.play();
}

/**
 * Start playback synchronously from the caller's click/tap handler.
 * The module-level audio elements intentionally survive route changes, so the
 * Offline prompt is not cut off when Verify navigates to /offline-mode.
 */
export function playAudioPrompt(kind: AudioPromptKind) {
  const audio = getOrCreatePrompt(kind);
  if (!audio) return Promise.resolve(false);

  const attempt = playElement(audio)
    .then(() => true)
    .catch(async (error) => {
      // If the proxy/source itself failed, retry the immutable production asset.
      // Do not retry NotAllowedError: that means the caller lost user activation.
      if (
        kind !== 'phone' &&
        error instanceof DOMException &&
        error.name !== 'NotAllowedError'
      ) {
        try {
          configureAudio(audio, DIRECT_AUDIO_SOURCES[kind]);
          await playElement(audio);
          return true;
        } catch (retryError) {
          console.warn(`[audio-prompt:${kind}] fallback playback failed`, retryError);
          return false;
        }
      }

      console.warn(`[audio-prompt:${kind}] playback failed`, error);
      return false;
    });

  return attempt;
}
