/* A push to everyone, from the back door (the owner, 2026-11-15). FLAGGED: touches people (a broadcast).
   Owner's own account only. A test goes only to the owner's devices; "to everyone" asks for a confirm that shows the
   numbers, is limited to a few a day, and goes through pushTo, which keeps each person's quiet hours, Shabbat and קודש.
   Every send is in the admin log. */
import { Ctx, HttpError, body, json } from './core';
import { log, requireAdmin } from './admin';
import { rateLimit } from './vault';
import { pushTo } from './push';
import { ALL_PER_DAY, TEST_PER_DAY, cleanBroadcast } from './broadcast-rules';

const BAD: Record<string, string> = { title_required: 'title_required', body_required: 'body_required', title_long: 'title_long', body_long: 'body_long', link_bad: 'link_bad', mode_bad: 'mode_bad' };

/** how many people and devices a send to everyone would try, and the owner's own devices for a test */
async function counts(ctx: Ctx, mine: string[]) {
  const all = await ctx.env.DB.prepare('SELECT COUNT(DISTINCT email) AS people, COUNT(*) AS devices FROM push_subs').first<{ people: number; devices: number }>();
  const own = mine.length
    ? await ctx.env.DB.prepare(`SELECT COUNT(*) AS devices FROM push_subs WHERE email IN (${mine.map(() => '?').join(',')})`).bind(...mine).first<{ devices: number }>()
    : { devices: 0 };
  return { people: all?.people || 0, devices: all?.devices || 0, mine: own?.devices || 0, perDay: ALL_PER_DAY };
}

export async function audience(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  return json(await counts(ctx, [a.by.toLowerCase()]));
}

export async function send(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const raw = await body<Record<string, unknown>>(ctx.req);
  let c; try { c = cleanBroadcast(raw); } catch (e) { throw new HttpError(400, BAD[(e as Error).message] || 'bad_request'); }
  const mine = [a.by.toLowerCase()];
  if (c.mode === 'test') {
    await rateLimit(ctx, 'broadcast-test:' + a.by, TEST_PER_DAY, 864e5);
    const n = await pushTo(ctx.env, mine, { title: c.title, body: c.body, url: c.url, kind: 'test', tag: 'broadcast-test' });
    await log(ctx, a, 'push:test', `${c.title.slice(0, 40)} → ${n} devices`);
    return json({ sent: n, people: 1 });
  }
  // everyone: counted and limited first, then sent. A person's own quiet hours / Shabbat hold the push for their summary.
  await rateLimit(ctx, 'broadcast-all', ALL_PER_DAY, 864e5);
  const { results } = await ctx.env.DB.prepare('SELECT DISTINCT email FROM push_subs').all<{ email: string }>();
  const emails = results.map((r) => r.email);
  const n = await pushTo(ctx.env, emails, { title: c.title, body: c.body, url: c.url, kind: 'family', tag: 'broadcast' });
  await log(ctx, a, 'push:all', `${c.title.slice(0, 40)} → ${emails.length} people, ${n} devices`);
  return json({ sent: n, people: emails.length });
}
