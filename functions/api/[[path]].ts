// Single entry point for /api/*: a tiny router over the server modules.

import { aiStatus } from '../../server/ai';
import { Ctx, Env, HttpError, body, desktopApprove, desktopPoll, desktopStart, devLogin, googleCallback, googleLogin, json, loadUser, logout, requireOwner } from '../../server/core';
import * as daemon from '../../server/daemon';
import * as keto from '../../server/keto';
import * as kitchen from '../../server/kitchen';
import * as world from '../../server/worldrecipes';
import * as mail from '../../server/mail';
import * as music from '../../server/music';
import * as news from '../../server/news';
import * as newsAi from '../../server/newsai';
import * as prefs from '../../server/prefs';
import * as recipeCheck from '../../server/recipecheck';
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
route('GET', '/api/me', async (ctx) => {
  if (!ctx.user) return json(ctx.env.DEV_MODE === '1' ? { user: null, dev: true, devEmail: (ctx.env.OWNER_EMAIL || '').split(',')[0] } : { user: null });
  // The person's preferences come with "who am I", so every page has them before it draws anything.
  return json({ user: ctx.user, ai: aiStatus(ctx.env), prefs: await prefs.prefsFor(ctx.env, ctx.user.email) });
});
route('GET', '/api/prefs', prefs.getPrefs);
route('PUT', '/api/prefs/:ns', prefs.putPrefs);

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
route('GET', '/api/recipes/world', world.search);
route('GET', '/api/recipes/world/stream', world.searchStream);
route('POST', '/api/recipes/world/open', world.open);
route('POST', '/api/recipes/check', recipeCheck.checkRecipe);

/* ketosis */
route('GET', '/api/keto', keto.getState);
route('PUT', '/api/keto/settings', keto.putSettings);
route('POST', '/api/keto/meals', keto.saveMeal);
route('PUT', '/api/keto/meals/:id', keto.saveMeal);
route('DELETE', '/api/keto/meals/:id', keto.deleteMeal);
route('PUT', '/api/keto/weights', keto.putWeight);
route('DELETE', '/api/keto/weights/:day', keto.deleteWeight);
route('GET', '/api/keto/foods', keto.listFoods);
route('POST', '/api/keto/foods/estimate', keto.estimateFoods);
route('PUT', '/api/keto/foods', keto.putFood);
route('POST', '/api/keto/recipe', keto.recipeNutrition);

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
route('POST', '/api/news/translate', news.translate);
route('GET', '/api/news/search', news.searchHistory);
route('GET', '/api/news/older', news.olderItems);
route('POST', '/api/news/titles', newsAi.translateTitles);
route('POST', '/api/news/corroborate', newsAi.corroborate);
route('POST', '/api/news/verify', newsAi.verify);
route('GET', '/api/news/websearch', newsAi.webSearch);
route('POST', '/api/news/find-sources', newsAi.findSources);

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

/* music: Spotify as a remote for the person's own Spotify app; YouTube search */
route('GET', '/api/music/status', music.status);
route('GET', '/api/music/spotify/login', music.login);
route('GET', '/api/music/spotify/callback', music.callback);
route('POST', '/api/music/spotify/disconnect', music.disconnect);
route('GET', '/api/music/spotify/state', music.state);
route('GET', '/api/music/spotify/devices', music.devices);
route('POST', '/api/music/spotify/cmd', music.command);
route('GET', '/api/music/spotify/search', music.search);
route('GET', '/api/music/spotify/playlists', music.playlists);
route('GET', '/api/music/youtube/search', music.youtubeSearch);

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

