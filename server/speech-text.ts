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

/* ---- the person's own name, as they want it said (settings: me.nameSpoken, e.g. מִישָׁאֵל) ---- */

const NIQQUD = /[֑-ׇ]/g;
/** a pointed name, cleaned: Hebrew letters and niqqud only (anything else is not a name to say) */
export function spokenName(v: unknown): string {
  const s = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return /^[א-ת֑-ׇ '״"׳-]+$/.test(s) && /[א-ת]{2}/.test(s) ? s : '';
}
/** the name in a line (plain or pointed, after a prefix letter such as ו or ל) read as `spoken` */
export function speakName(text: string, spoken: string): string {
  const letters = spoken.replace(NIQQUD, '');
  if (!spoken || letters.length < 2) return text;
  const body = [...letters].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + N).join('');
  const re = new RegExp(`(^|[^\\u05D0-\\u05EA\\u0591-\\u05C7])((?:[והבכלמש]${N}){0,3})${body}(?![\\u05D0-\\u05EA])`, 'g');   // (ו, ל, ול, וכשל…)
  return text.replace(re, (_m, before: string, prefix: string | undefined) => before + (prefix || '') + spoken);
}

/* ---- automatic niqqud for the voice (the owner: always, for what is read aloud; the screen is not touched) ---- */

const HEB = /[א-ת]/g, POINTS = /[ְ-ׇּׁׂ]/g;
/** whether a line needs niqqud: Hebrew in it, and not already pointed (under one mark for every three letters) */
export function needsNiqqud(text: string): boolean {
  const letters = (text.match(HEB) || []).length;
  return letters >= 2 && (text.match(POINTS) || []).length * 3 < letters;
}

/** the parts a vocalizer must not touch – רַאבַּ"ע as the owner approved it, the person's name as they set it – put
    aside as @@1@@, @@2@@… */
export function protect(text: string, names: string[] = []): { text: string; kept: string[] } {
  const kept: string[] = [];
  let out = text;
  for (const name of [SPOKEN_RABA, ...names].filter(Boolean)) {
    out = out.split(name).reduce((acc, part, i) => (i ? acc + `@@${kept.push(name)}@@` + part : part), '');
  }
  return { text: out, kept };
}
/** and back; a vocalized answer that lost a token, or changed the letters, is not used */
export function restore(pointed: string, original: string, kept: string[]): string {
  const back = kept.reduce((t, k, i) => t.replace(`@@${i + 1}@@`, k), pointed);
  // (pointed Hebrew drops the vav and yod of full spelling – בוקר → בֹּקֶר – so those two may come and go; nothing else may)
  const bare = (s: string) => s.replace(/[֑-ׇ]/g, '').replace(/[וי]/g, '').replace(/\s+/g, ' ').trim();
  return /@@\d+@@/.test(back) || bare(back) !== bare(original) ? original : back;
}
