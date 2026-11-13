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

/* ---- automatic niqqud for the voice (the owner: always, for what is read aloud; the screen is not touched) ---- */

const HEB = /[א-ת]/g, POINTS = /[ְ-ׇּׁׂ]/g;
/** whether a line needs niqqud: Hebrew in it, and not already pointed (under one mark for every three letters) */
export function needsNiqqud(text: string): boolean {
  const letters = (text.match(HEB) || []).length;
  return letters >= 2 && (text.match(POINTS) || []).length * 3 < letters;
}

/** the parts a vocalizer must not touch – the name as the owner approved it – put aside as @@1@@, @@2@@… */
export function protect(text: string): { text: string; kept: string[] } {
  const kept: string[] = [];
  const out = text.split(SPOKEN_RABA).reduce((acc, part, i) => (i ? acc + `@@${kept.push(SPOKEN_RABA)}@@` + part : part), '');
  return { text: out, kept };
}
/** and back; a vocalized answer that lost a token, or changed the letters, is not used */
export function restore(pointed: string, original: string, kept: string[]): string {
  const back = kept.reduce((t, k, i) => t.replace(`@@${i + 1}@@`, k), pointed);
  // (pointed Hebrew drops the vav and yod of full spelling – בוקר → בֹּקֶר – so those two may come and go; nothing else may)
  const bare = (s: string) => s.replace(/[֑-ׇ]/g, '').replace(/[וי]/g, '').replace(/\s+/g, ' ').trim();
  return /@@\d+@@/.test(back) || bare(back) !== bare(original) ? original : back;
}
