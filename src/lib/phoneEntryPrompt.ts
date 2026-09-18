import c0 from '@/assets/phoneEntryPromptChunks/0';
import c1 from '@/assets/phoneEntryPromptChunks/1';
import c2 from '@/assets/phoneEntryPromptChunks/2';
import c3 from '@/assets/phoneEntryPromptChunks/3';
import c4 from '@/assets/phoneEntryPromptChunks/4';
import c5 from '@/assets/phoneEntryPromptChunks/5';
import c6 from '@/assets/phoneEntryPromptChunks/6';

// Full 2.23s recording supplied by the user. It is embedded in the web bundle,
// so the phone prompt never depends on a network request.
export const phoneEntryPrompt = `data:audio/mpeg;base64,${c0}${c1}${c2}${c3}${c4}${c5}${c6}`;
