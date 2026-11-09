import type { ReadingPrompt, RecordingProject } from '../types/recording';

// Original starter prompts. This is NOT a phonetically complete speech corpus.
export const STARTER_PROMPTS: ReadingPrompt[] = [
  { id: 'welcome', category: 'Everyday phrases', text: 'Hello, and welcome. It is good to have you here.' },
  { id: 'thanks', category: 'Everyday phrases', text: 'Thank you for listening. I hope you enjoy the rest of your day.' },
  { id: 'ready', category: 'Everyday phrases', text: 'Everything is ready. We can begin whenever you are.' },
  { id: 'wait', category: 'Everyday phrases', text: 'Please wait a moment while I check the details.' },
  { id: 'morning', category: 'Clear vowels', text: 'The morning light fell across the open window.' },
  { id: 'garden', category: 'Clear vowels', text: 'A small green bird flew over the quiet garden.' },
  { id: 'tea', category: 'Clear vowels', text: 'We shared a warm cup of tea before leaving home.' },
  { id: 'road', category: 'Clear vowels', text: 'The road curves gently around the blue lake.' },
  { id: 'folder', category: 'Consonant transitions', text: 'Please bring the blue folder to the front desk.' },
  { id: 'peach', category: 'Consonant transitions', text: 'She chose a fresh peach and a small orange.' },
  { id: 'bridge', category: 'Consonant transitions', text: 'The old bridge shook as the heavy truck passed.' },
  { id: 'weather', category: 'Consonant transitions', text: 'They thought the weather would change by Thursday.' },
  { id: 'question', category: 'Questions & rhythm', text: 'Would you like me to read that sentence again?' },
  { id: 'where', category: 'Questions & rhythm', text: 'Where did you put the keys to the front door?' },
  { id: 'story', category: 'Questions & rhythm', text: 'At first the room was silent. Then someone began to laugh.' },
  { id: 'contrast', category: 'Questions & rhythm', text: 'I asked for the red book, not the blue one.' },
  { id: 'numbers', category: 'Numbers in words', text: 'We counted seventeen tickets before the train arrived.' },
  { id: 'time', category: 'Numbers in words', text: 'The meeting starts at half past nine on Monday morning.' },
  { id: 'price', category: 'Numbers in words', text: 'The total is two hundred and forty rand, including delivery.' },
  { id: 'finish', category: 'Everyday phrases', text: 'That is the end of this recording. Thank you, and goodbye.' },
];

export function createRecordingProject(): RecordingProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name: 'My first voice', language: 'English', accent: '',
    permissionConfirmed: false, createdAt: now, updatedAt: now,
    prompts: STARTER_PROMPTS.map(prompt => ({ ...prompt })), recordings: {},
  };
}
