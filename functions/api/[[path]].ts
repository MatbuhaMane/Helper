// Single entry point for /api/*: a tiny router over the server modules.

import { aiStatus } from '../../server/ai';
import { Ctx, Env, HttpError, body, desktopApprove, desktopPoll, desktopStart, devLogin, googleCallback, googleLogin, json, loadUser, logout, requireOwner } from '../../server/core';
import * as daemon from '../../server/daemon';
import * as kitchen from '../../server/kitchen';
import * as mail from '../../server/mail';
import * as news from '../../server/news';
import * as songs from '../../server/songs';
import * as voice from '../../server/voice';
import { ensureSchema } from '../../server/schema';

type Handler = (ctx: Ctx) => Promise<Response> | Response;
const routes: [string, RegExp, string[], Handler][] = [];
function route(method: string, path: string, h: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push([method, re, keys, h]);
}

/* auth & me */
route('GET', '/api/auth/login', googleLogin);
route('GET', '/api/auth/callback', googleCallback);
route('GET', '/api/auth/dev', devLogin);
route('POST', '/api/auth/logout', logout);
route('POST', '/api/auth/desktop/start', desktopStart);
route('GET', '/api/auth/desktop/approve', desktopApprove);
route('GET', '/api/auth/desktop/poll', desktopPoll);
route('GET', '/api/me', (ctx) => {
  if (!ctx.user) return json(ctx.env.DEV_MODE === '1' ? { user: null, dev: true, devEmail: (ctx.env.OWNER_EMAIL || '').split(',')[0] } : { user: null });
  return json({ user: ctx.user, ai: aiStatus(ctx.env) });
});

/* members (owner) */
route('GET', '/api/members', async (ctx) => {
  requireOwner(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT email, name, household, role FROM members ORDER BY household, email').all();
  return json({ members: results });
});
route('POST', '/api/members', async (ctx) => {
  requireOwner(ctx);
  const b = await body<{ email: string; name?: string; household?: string; role?: string }>(ctx.req);
  const email = (b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Invalid email');
  const household = (b.household || 'family').trim().slice(0, 40) || 'family';
  const role = b.role === 'owner' ? 'owner' : 'member';
  await ctx.env.DB.prepare(
    `INSERT INTO members (email, name, household, role, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, name), household = excluded.household, role = excluded.role`,
  ).bind(email, b.name?.trim() || null, household, role, Date.now()).run();
  return json({ ok: true });
});
route('DELETE', '/api/members/:email', async (ctx) => {
  const me = requireOwner(ctx);
  const email = decodeURIComponent(ctx.params.email).toLowerCase();
  if (email === me.email) throw new HttpError(400, 'You cannot remove yourself');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM members WHERE email = ?').bind(email),
    ctx.env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(email),
    ctx.env.DB.prepare('DELETE FROM google_tokens WHERE email = ?').bind(email),
  ]);
  return json({ ok: true });
});

/* daemon */
route('GET', '/api/daemon', daemon.getDaemon);
route('POST', '/api/daemon/chat', daemon.chat);
route('POST', '/api/daemon/reset', daemon.resetChat);
route('GET', '/api/daemon/form/:slug', daemon.formImage);

/* songbook */
route('GET', '/api/songs/search', songs.search);
route('GET', '/api/songs/page', songs.page);
route('GET', '/api/songs/health', songs.health);
route('GET', '/api/songs', songs.list);
route('POST', '/api/songs', songs.save);
route('PUT', '/api/songs/:id', songs.save);
route('DELETE', '/api/songs/:id', songs.remove);

/* his voice */
route('GET', '/api/voice/voices', voice.listVoices);
route('GET', '/api/voice/pref', voice.getPref);
route('PUT', '/api/voice/pref', voice.setPref);
route('POST', '/api/voice/say', voice.say);
route('GET', '/api/voice/sample/:voice', voice.sample);

/* groceries & recipes */
route('GET', '/api/groceries', kitchen.listGroceries);
route('POST', '/api/groceries/ops', kitchen.applyGroceryOps);
route('GET', '/api/recipes', kitchen.listRecipes);
route('POST', '/api/recipes', kitchen.saveRecipe);
route('PUT', '/api/recipes/:id', kitchen.saveRecipe);
route('DELETE', '/api/recipes/:id', kitchen.deleteRecipe);
route('POST', '/api/recipes/import', kitchen.importRecipe);

/* news */
route('GET', '/api/news/feeds', news.listFeeds);
route('POST', '/api/news/feeds', news.addFeed);
route('PATCH', '/api/news/feeds/:id', news.updateFeed);
route('DELETE', '/api/news/feeds/:id', news.deleteFeed);
route('GET', '/api/news/items', news.listItems);
route('GET', '/api/news/starred', news.starredItems);
route('POST', '/api/news/state', news.setState);
route('GET', '/api/news/article', news.article);
route('POST', '/api/news/summary', news.summarize);

/* mail organizer */
route('GET', '/api/mail/status', mail.mailStatus);
route('POST', '/api/mail/disconnect', mail.disconnect);
route('GET', '/api/mail/overview', mail.overview);
route('POST', '/api/mail/plan', mail.plan);
route('GET', '/api/mail/plans/:id', mail.getPlan);
route('POST', '/api/mail/plans/:id/step', mail.applyStep);
route('POST', '/api/mail/plans/:id/undo', mail.undo);
route('POST', '/api/mail/plans/:id/cancel', mail.cancelPlan);
route('GET', '/api/mail/history', mail.history);

export const onRequest: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  // Same-origin check for state-changing calls (CSRF protection on top of SameSite cookies).
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Bad origin' }, 403);
  }
  for (const [method, re, keys, h] of routes) {
    if (method !== request.method) continue;
    const m = re.exec(url.pathname);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, m[i + 1]]));
    try {
      await ensureSchema(env);
      const user = await loadUser(env, request);
      return await h({ req: request, env, url, params, user, waitUntil });
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error('API error', url.pathname, err instanceof Error ? err.stack || err.message : err);
      return json({ error: 'server_error' }, 500);
    }
  }
  return json({ error: 'Not found' }, 404);
};

