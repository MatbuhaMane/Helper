// What the voice reads, as opposed to what the screen shows (server/voice.ts; the same rule in daemon.js for the browser's
// voice). The name רַאבַּ"ע, in any spelling – with or without niqqud, with " or ״ or '' – is read as one word, "רַאבַּע":
// with its gershayim a speech engine spells out the letters or reads "ראב ע". Tests: server/test-speech-text.mjs.

const N = '[\\u0591-\\u05C7]*';   // the niqqud and cantillation marks between the letters
const RABA = new RegExp(`ר${N}א${N}ב${N}(?:["״׳']{1,2})${N}ע${N}`, 'g');
export const SPOKEN_RABA = 'רַאבַּע';

/** the text for a speech engine */
export function forSpeech(text: string): string {
  return String(text || '').replace(RABA, SPOKEN_RABA);
}
