// Which voice speaks for which companion, and how it is directed (the owner's request, 2026-11-13). רַאבַּ"ע alone keeps
// Algenib, the deep and gravelly old sage; each of the default animals has its own light, playful and warm voice.
// Pure logic, tested in test-voice-figures.mjs; voice.ts uses it.

export const EZRA = 'ibn_ezra';
export const EZRA_VOICE = 'Algenib';

// An old man's voice with the Hebrew of the Jews of the East: ח and ע from the throat, as Ibn Ezra himself said them.
// The pace stays lively (the person asked for faster reading; the client can speed playback further, prefs.rate).
const EZRA_STYLE = 'Read this aloud in Hebrew as a very old, wise and kind Mizrahi Jewish sage of about eighty: a deep, slightly gravelly, ' +
  'aged voice with warmth and a hint of a smile, at an easy conversational pace. Use the traditional Mizrahi (Yemenite/Iraqi) ' +
  'pronunciation: say every ח (Het) as a strong pharyngeal [ħ], never like כ or a Western "ch", and every ע (Ayin) as a ' +
  'clear pharyngeal [ʕ] from the throat, never silent like א. Read:';

const cute = (who: string) => `Read this aloud in natural Israeli Hebrew as ${who}: a light, bright, playful and warm voice, ` +
  'friendly and a little cheeky, smiling as it speaks, at a lively pace. Never deep, gruff or old. Read:';

/** the default companions: voice (Gemini's prebuilt set) and directions. The animals speak of themselves in the masculine. */
export const FIGURES: Record<string, { voice: string; style: string; he?: string }> = {
  [EZRA]: { voice: EZRA_VOICE, style: EZRA_STYLE },
  fennec: { he: 'פנק', voice: 'Fenrir', style: cute('a small, excitable desert fennec fox with huge ears, eager to tell what he heard') },
  owl: { he: 'ינשוף', voice: 'Achird', style: cute('a small, friendly and curious young owl who loves finding things out') },
  hedgehog: { he: 'קיפוד', voice: 'Sadachbia', style: cute('a small, lively and tidy hedgehog, soft and sweet inside') },
  lamb: { he: 'טלה', voice: 'Puck', style: cute('a small, gentle and cheerful lamb, patient and upbeat') },
};
/** any other flat figure from the catalogue */
const OTHER = { voice: 'Puck', style: cute('a small, cheerful cartoon companion') };

export const figureOf = (id?: string | null) => (id && FIGURES[id]) || (id ? OTHER : FIGURES[EZRA]);   // no figure: the 3D רַאבַּ"ע

/**
 * The voice a figure speaks in. `asked`: the voice the person chose for this figure (sent by the page); `stored`: the old
 * single saved choice (voice_prefs), made when רַאבַּ"ע was the only companion, so it counts for him alone.
 * Algenib belongs to רַאבַּ"ע: for anyone else it falls back to the figure's own voice.
 */
export function voiceFor(figure: string | null | undefined, asked: string, stored: string, known: (v: string) => boolean): string {
  const f = figureOf(figure), ezra = !figure || figure === EZRA;
  for (const v of ezra ? [asked, stored] : [asked]) if (v && known(v) && (ezra || v !== EZRA_VOICE)) return v;
  return f.voice;
}

/** the picker's sample line, in the figure's own words */
export function sampleLine(figure: string | null | undefined): string {
  if (!figure || figure === EZRA) return 'שלום וברכה, אני אבן עזרא, ושמח לעזור לכם. מה נחפש יחד היום?';   // ח and ע, to hear the accent
  return `היי! אני ${FIGURES[figure]?.he || 'העוזר'}, ואני כאן איתכם. מה עושים היום?`;
}
