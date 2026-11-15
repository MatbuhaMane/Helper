/* A push to everyone, from the back door (the owner, 2026-11-15). The pure rules: what may be sent. */
export const TITLE_MAX = 60, BODY_MAX = 200, ALL_PER_DAY = 3, TEST_PER_DAY = 20;

export interface Clean { title: string; body: string; url: string; mode: 'test' | 'all' }
export function cleanBroadcast(raw: { title?: unknown; body?: unknown; link?: unknown; mode?: unknown }): Clean {
  const strip = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const title = strip(raw.title, TITLE_MAX), body = strip(raw.body, BODY_MAX);
  if (!title) throw new Error('title_required');
  if (!body) throw new Error('body_required');
  if (String(raw.title ?? '').trim().length > TITLE_MAX) throw new Error('title_long');
  if (String(raw.body ?? '').trim().length > BODY_MAX) throw new Error('body_long');
  // a page of the app only: one slash, then not another slash or a backslash (those turn into another site)
  const link = String(raw.link ?? '').trim();
  if (link && (link.length > 200 || link.startsWith('//') || link.startsWith('/\\') || !/^\/[^\s\u0000-\u001f]*$/.test(link))) throw new Error('link_bad');
  const mode = raw.mode === 'all' ? 'all' : raw.mode === 'test' ? 'test' : '';
  if (!mode) throw new Error('mode_bad');
  return { title, body, url: link || '/', mode };
}
