import { createFileRoute } from '@tanstack/react-router';

const AUDIO_SOURCES = {
  phone: 'https://iftinagents.com/__l5e/assets-v1/035ae08a-83c5-483c-a7a7-fc834544cf83/phone-number-prompt.wav',
  otp: 'https://iftinagents.com/__l5e/assets-v1/bd53b427-602d-4cdb-9102-ac6c3d065c12/otp-code-prompt.wav',
  offline: 'https://iftinagents.com/__l5e/assets-v1/d208b555-c658-4bb2-9ad9-fb3aeac0e72f/offline-mode-prompt.wav',
} as const;

type AudioKind = keyof typeof AUDIO_SOURCES;

export const Route = createFileRoute('/api/public/audio-prompt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind = (url.searchParams.get('kind') || '').trim().toLowerCase() as AudioKind;
        const source = AUDIO_SOURCES[kind];

        if (!source) {
          return new Response('Unknown audio prompt', {
            status: 400,
            headers: { 'Cache-Control': 'no-store' },
          });
        }

        try {
          const upstream = await fetch(source, {
            redirect: 'follow',
            headers: { Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1' },
          });

          if (!upstream.ok || !upstream.body) {
            return new Response('Audio prompt unavailable', {
              status: 502,
              headers: { 'Cache-Control': 'no-store' },
            });
          }

          return new Response(upstream.body, {
            status: 200,
            headers: {
              'Content-Type': upstream.headers.get('content-type') || 'audio/wav',
              // Asset IDs are immutable. Long-lived caching lets Android WebView
              // replay the prompt after it has been preloaded once while online.
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*',
              'Cross-Origin-Resource-Policy': 'cross-origin',
            },
          });
        } catch {
          return new Response('Audio prompt unavailable', {
            status: 502,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
      },
    },
  },
});
