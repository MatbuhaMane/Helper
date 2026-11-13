// The reports inbox (תיבת פניות), the pure rules: what a report keeps, the states, and who may see a thread.
// No database here, so server/test-reports.mjs can run it with node.   The handlers are in server/reports.ts.

import { HttpError } from './core';

export const STATES = ['new', 'working', 'done'] as const;          // חדשה · בטיפול · טופלה
export type State = (typeof STATES)[number];
export const isState = (s: unknown): s is State => STATES.includes(s as State);

/** what a report is: a problem (תקלה) or an idea for doing better (הצעה לשיפור); an older report, or none given, is a problem */
export const KINDS = ['bug', 'idea'] as const;
export type Kind = (typeof KINDS)[number];
export const kindOf = (k: unknown): Kind => (k === 'idea' ? 'idea' : 'bug');

export const TEXT_MAX = 1000, REPLY_MAX = 2000;
export const SHOT_MAX = 900_000;                                    // the data URL's length (a JPEG of ~650 KB)
export const RATE = { max: 12, windowMs: 864e5 };                   // reports a person may send in a day

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** the phone, a tablet or a computer, from the browser's user agent (only this word is kept, never the whole string) */
export function deviceOf(ua: string, width: number): 'phone' | 'tablet' | 'pc' {
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'phone';
  return width > 0 && width < 600 ? 'phone' : 'pc';
}

export interface ReportIn { kind: Kind; text: string; path: string; title: string; theme: 'light' | 'dark' | null; width: number | null; shot: string | null }

/** what a member sends, cleaned: the text, the page (a path of this app only, never another site's address), the theme,
 *  the width, and a screenshot only when it is a picture data URL of a sane size */
export function cleanReport(b: Record<string, unknown>): ReportIn {
  const text = clean(b.text, TEXT_MAX).replace(/ {3,}/g, '  ');
  if (!text) throw new HttpError(400, 'text_required');
  let path = clean(b.path, 300);
  if (!/^\/(?!\/)[^\s]*$/.test(path)) path = '/';                       // a path inside the app; //evil.com is not one
  const w = Math.round(Number(b.width));
  const shot = typeof b.shot === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.shot) && b.shot.length <= SHOT_MAX ? b.shot : null;
  return {
    kind: kindOf(b.kind), text, path,
    title: clean(b.title, 80),
    theme: b.theme === 'dark' || b.theme === 'light' ? b.theme : null,
    width: Number.isFinite(w) && w > 0 && w < 20000 ? w : null,
    shot,
  };
}

export const cleanReply = (t: unknown) => {
  const s = clean(t, REPLY_MAX).replace(/[\u000b\u000c]/g, ' ');
  if (!s) throw new HttpError(400, 'text_required');
  return s;
};

/* ---------------- who sees what ---------------- */

export type Report = { id: string; email: string }
export interface Msg { id: string; report: string; by_team: number; text: string; at: number }

/** a member sees a report only if they sent it; anyone else (another member, the same household, a head) gets nothing,
 *  as if it did not exist (404). The owner reads every report only through the back door (requireAdmin), never here. */
export const memberMaySee = (r: Report | null | undefined, email: string) => !!r && !!email && r.email === email;

/** the thread a member gets: their own report and the replies to it, or null (the handler answers 404) */
export function memberThread(r: Report | null | undefined, msgs: Msg[], email: string) {
  if (!memberMaySee(r, email)) return null;
  return {
    report: publicReport(r!),
    messages: msgs.filter((m) => m.report === r!.id).map((m) => ({ id: m.id, team: !!m.by_team, text: m.text, at: m.at })),
  };
}
/** what of a report goes back to the person who sent it (no internal fields: who in the team read it, notes, the key of the picture) */
export function publicReport(r: Report) {
  const { id, kind, text, path, title, state, created_at, device, theme, width, has_shot } = r as unknown as Record<string, unknown>;
  return { id, kind: kindOf(kind), text, path, title, state, created_at, device, theme, width, has_shot: !!has_shot };
}

/** the member's own list: unread when the team wrote after the member last opened it */
export function unreadForMember(r: { last_team_at?: number | null; seen_at?: number | null }) {
  return !!r.last_team_at && (!r.seen_at || r.last_team_at > r.seen_at);
}
/** the team's list: unread when the member's report (or the last word from them) came after the team last opened it */
export function unreadForTeam(r: { created_at: number; read_at?: number | null }) {
  return !r.read_at || r.read_at < r.created_at;
}

/** a reply moves a new report to בטיפול; a report already טופלה stays so (the owner closes it, a reply does not reopen it) */
export const stateAfterReply = (s: State): State => (s === 'new' ? 'working' : s);

/** initials for the face in the list (two letters of the name, or of the email) */
export function initials(name: string | null | undefined, email: string) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words[0][0] + words[1][0];
  if (words.length === 1) return words[0].slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}
