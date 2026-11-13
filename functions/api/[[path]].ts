// Single entry point for /api/*: a tiny router over the server modules.

import { aiStatus } from '../../server/ai';
import { Ctx, Env, HttpError, body, previewHandoff, desktopApprove, desktopPoll, desktopStart, devLogin, googleCallback, googleLogin, json, loadUser, logout, requireOwner, useInviteHooks } from '../../server/core';
import * as daemon from '../../server/daemon';
import * as calc from '../../server/calc';
import * as calendar from '../../server/calendar';
import * as gather from '../../server/gather';
import * as join from '../../server/join';
import * as admin from '../../server/admin';
import * as credits from '../../server/credits';
import * as figures from '../../server/figures';
import * as lock from '../../server/lock';
import { setting } from '../../server/settings';
import { childOf } from '../../server/members';
import { birthYear } from '../../server/figures-rules';
import * as designImages from '../../server/design-images';
import * as fridge from '../../server/fridge';
import * as groceryAuto from '../../server/grocery-auto';
import * as groceryLists from '../../server/grocery-lists';
import * as fun from '../../server/fun';
import * as notes from '../../server/notes';
import * as food from '../../server/food';
import * as restaurants from '../../server/restaurants';
import * as places from '../../server/places';
import * as goals from '../../server/goals';
import * as researches from '../../server/researches';
import * as writing from '../../server/research-writing';
import * as keto from '../../server/keto';
import * as kitchen from '../../server/kitchen';
import * as world from '../../server/worldrecipes';
import * as mail from '../../server/mail';
import * as music from '../../server/music';
import * as news from '../../server/news';
import * as newsAi from '../../server/newsai';
import * as prefs from '../../server/prefs';
import * as recipeCheck from '../../server/recipecheck';
import * as research from '../../server/research';
import * as sefaria from '../../server/sefaria';
import * as songs from '../../server/songs';
import * as voice from '../../server/voice';
import { ensureSchema } from '../../server/schema';
import * as vault from '../../server/vault';
import * as familyProfile from '../../server/family-profile';
import * as familyFind from '../../server/family-find';
import * as usage from '../../server/usage';
import { featureOf, metered } from '../../server/meter';
import * as weather from '../../server/weather';
import * as discovery from '../../server/discover';
import * as goalSocial from '../../server/goal-social';

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
route('POST', '/api/auth/passkey/options', lock.loginOptions);   // signing in with a passkey (fingerprint, face), no Google
route('POST', '/api/auth/passkey', lock.login);
/* the app lock and the tree lock (the master's, server/lock.ts) */
route('GET', '/api/lock', lock.status);
route('PUT', '/api/lock', lock.save);
route('PUT', '/api/lock/pin', lock.setPin);
route('POST', '/api/lock/lock', lock.lockNow);
route('POST', '/api/lock/unlock', lock.unlock);
route('POST', '/api/lock/passkey/options', lock.passkeyOptions);
route('POST', '/api/lock/passkey', lock.passkeyUnlock);
route('GET', '/api/auth/handoff', previewHandoff);
route('POST', '/api/auth/logout', logout);
route('POST', '/api/auth/desktop/start', desktopStart);
route('GET', '/api/auth/desktop/approve', desktopApprove);
route('GET', '/api/auth/desktop/poll', desktopPoll);
route('GET', '/api/me', async (ctx) => {
  if (!ctx.user) return json(ctx.env.DEV_MODE === '1' ? { user: null, dev: true, devEmail: (ctx.env.OWNER_EMAIL || '').split(',')[0] } : { user: null });
  // The person's preferences come with "who am I", so every page has them before it draws anything.
  // child: under 12 by the birth year the owner set (the year itself stays private)
  return json({ user: ctx.user, ai: aiStatus(ctx.env), prefs: await prefs.prefsFor(ctx.env, ctx.user.email), child: await childOf(ctx.env, ctx.user.email),
    shop: await setting<boolean>(ctx.env, 'money.shop_open').catch(() => false),
    ...(await lock.meLock(ctx.env, ctx.req)) });   // appLock: off | pin | bio (the padlock in the bar); locked: the lock screen   // shop: the owner's switch for prices and buying
});
route('GET', '/api/prefs', prefs.getPrefs);
route('PUT', '/api/prefs/:ns', prefs.putPrefs);

/* members (owner) */
route('GET', '/api/members', async (ctx) => {
  requireOwner(ctx);
  await admin.requireAdmin(ctx, 'own');   // and the owner's room is open, from their own account
  const { results } = await ctx.env.DB.prepare('SELECT email, name, he_name, household, role, birth_year, first_seen, approved_at FROM members ORDER BY household, email').all();
  return json({ members: results });
});
route('PUT', '/api/members/:email/name', async (ctx) => {
  requireOwner(ctx);
  await admin.requireAdmin(ctx, 'own');   // and the owner's room is open, from their own account
  const name = heName((await body<{ he_name?: string }>(ctx.req)).he_name);
  await ctx.env.DB.prepare('UPDATE members SET he_name = ? WHERE email = ?').bind(name, decodeURIComponent(ctx.params.email).toLowerCase()).run();
  return json({ ok: true, he_name: name });
});
/** A member's birth year (private: only here, in the owner's room). Under 12 hides horror figures and keeps a child in the family. */
route('PUT', '/api/members/:email/birth-year', async (ctx) => {
  requireOwner(ctx);
  await admin.requireAdmin(ctx, 'own');   // and the owner's room is open, from their own account
  let year: number | null;
  try { year = birthYear((await body<{ birth_year?: unknown }>(ctx.req)).birth_year, Date.now()); } catch { throw new HttpError(400, 'bad_year'); }
  await ctx.env.DB.prepare('UPDATE members SET birth_year = ? WHERE email = ?').bind(year, decodeURIComponent(ctx.params.email).toLowerCase()).run();
  return json({ ok: true, birth_year: year });
});
/** The owner approves a member (after their first sign-in, core.ts firstSignIn): full access – the AI with no limit and every
    special feature (admin.FEATURES). Undo: mark them limited, or take a feature away, in the room. */
route('POST', '/api/members/:email/approve', async (ctx) => {
  const me = requireOwner(ctx);
  await admin.requireAdmin(ctx, 'own');   // and the owner's room is open, from their own account
  const email = decodeURIComponent(ctx.params.email).toLowerCase();
  const m = await ctx.env.DB.prepare('SELECT email FROM members WHERE email = ?').bind(email).first();
  if (!m) throw new HttpError(404, 'Not found');
  const now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE members SET approved_at = ? WHERE email = ?').bind(now, email),
    ctx.env.DB.prepare('UPDATE ai_allowance SET limited = 0, updated_by = ?, updated_at = ? WHERE email = ?').bind(me.email, now, email),
    ...admin.FEATURES.map((f) => ctx.env.DB.prepare('INSERT OR IGNORE INTO user_features (email, feature, by_email, created_at) VALUES (?, ?, ?, ?)').bind(email, f.key, me.email, now)),
  ]);
  return json({ ok: true, approved_at: now });
});
/** The Hebrew name the helper calls someone by: set by the family's owner (on the admin page). */
const heName = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (s && !/^[\u0590-\u05FF'"׳״\- ]+$/.test(s)) throw new HttpError(400, 'השם צריך להיות באותיות עבריות');
  return s || null;
};
route('POST', '/api/members', async (ctx) => {
  requireOwner(ctx);
  await admin.requireAdmin(ctx, 'own');   // and the owner's room is open, from their own account
  const b = await body<{ email: string; name?: string; he_name?: string; household?: string; role?: string }>(ctx.req);
  const he = heName(b.he_name);
  const email = (b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Invalid email');
  const household = (b.household || 'family').trim().slice(0, 40) || 'family';
  const role = b.role === 'owner' ? 'owner' : 'member';
  await ctx.env.DB.prepare(
    `INSERT INTO members (email, name, he_name, household, role, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, name), he_name = COALESCE(excluded.he_name, he_name), household = excluded.household, role = excluded.role`,
  ).bind(email, b.name?.trim() || null, he, household, role, Date.now()).run();
  return json({ ok: true });
});
route('DELETE', '/api/members/:email', async (ctx) => {
  const me = requireOwner(ctx);
  await admin.requireAdmin(ctx, 'own');   // and the owner's room is open, from their own account
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
route('GET', '/api/daemon/figures', figures.list);           // paid figures: what this person has, and the price
route('POST', '/api/daemon/figures/:id/buy', figures.buy);   // { confirm: true }: the family for nothing, others from their credits

/* songbook */
route('GET', '/api/songs/search', songs.search);
route('GET', '/api/songs/page', songs.page);
route('GET', '/api/songs/lookup', songs.lookup);
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
route('POST', '/api/groceries/lists', groceryLists.createList);
route('DELETE', '/api/groceries/lists/:id', groceryLists.deleteList);
route('POST', '/api/groceries/lists/:id/restore', groceryLists.restoreList);
route('POST', '/api/groceries/lists/:id/save', groceryLists.saveList);
route('POST', '/api/groceries/lists/:id/use', groceryLists.useList);
route('GET', '/api/groceries/auto', groceryAuto.autoList);   // the automatic list from the fridge: suggestions only (ai-features)
route('GET', '/api/recipes', kitchen.listRecipes);
route('POST', '/api/recipes', kitchen.saveRecipe);
route('PUT', '/api/recipes/:id', kitchen.saveRecipe);
route('DELETE', '/api/recipes/:id', kitchen.deleteRecipe);
route('POST', '/api/recipes/import', kitchen.importRecipe);
route('GET', '/api/recipes/world', world.search);
route('GET', '/api/recipes/world/stream', world.searchStream);
route('POST', '/api/recipes/world/open', world.open);
route('POST', '/api/recipes/check', recipeCheck.checkRecipe);

/* notes (each person's own) */
route('GET', '/api/notes', notes.list);
route('POST', '/api/notes', notes.create);
route('PUT', '/api/notes/:id', notes.update);
route('DELETE', '/api/notes/:id', notes.remove);
route('GET', '/api/notes/drive', notes.driveStatus);
route('POST', '/api/notes/:id/drive', notes.toDrive);

/* בידור: recommendations by medium, with where to watch */
route('GET', '/api/fun/picks', fun.picks);
route('GET', '/api/fun/viral', fun.viral);
route('GET', '/api/fun/logo/:domain', fun.logo);

/* the family's days in the calendar (shared) */
route('GET', '/api/calendar/events', calendar.list);
route('POST', '/api/calendar/events', calendar.create);
route('PUT', '/api/calendar/events/:id', calendar.update);
route('DELETE', '/api/calendar/events/:id', calendar.remove);

/* Sefaria, through our own lasting copy */
route('GET', '/api/sefaria/.+', sefaria.proxy);

/* the Torah researcher of פרשת השבוע */
route('POST', '/api/research/ask', research.ask);
route('POST', '/api/research/search', research.search);
route('POST', '/api/research/translate', research.translate);
route('POST', '/api/research/word', research.word);

/* the smart calculator */
route('POST', '/api/calc/solve', calc.solve);
route('GET', '/api/calc/rates', calc.currencyRates);

/* fridges (shared by the whole family) */
route('GET', '/api/fridges', fridge.listFridges);
route('POST', '/api/fridges', fridge.createFridge);
route('PUT', '/api/fridges/:id', fridge.renameFridge);
route('DELETE', '/api/fridges/:id', fridge.deleteFridge);
route('GET', '/api/fridges/:id/items', fridge.listItems);
route('POST', '/api/fridges/:id/ops', fridge.applyOps);
route('GET', '/api/fridges/:id/history', fridge.history);
route('GET', '/api/food/highlights', food.highlights);
route('GET', '/api/restaurants', restaurants.list);
route('GET', '/api/restaurants/search', places.status);
route('POST', '/api/restaurants/search', places.search);
route('POST', '/api/restaurants', restaurants.save);
route('PUT', '/api/restaurants/:id', restaurants.save);
route('DELETE', '/api/restaurants/:id', restaurants.remove);
route('POST', '/api/restaurants/:id/fav', restaurants.fav);
route('POST', '/api/restaurants/:id/visit', restaurants.visit);
route('GET', '/api/goals', goals.list);
route('POST', '/api/goals', goals.create);
route('GET', '/api/goals/template', goals.template);
route('POST', '/api/goals/review', goals.review);
route('POST', '/api/goals/ai/plan', goals.aiPlan);
route('POST', '/api/goals/ai/stuck', goals.aiStuck);
route('PUT', '/api/goals/:id', goals.update);
route('DELETE', '/api/goals/:id', goals.remove);
route('POST', '/api/goals/:id/processes', goals.addProcess);
route('PUT', '/api/goals/processes/:id', goals.editProcess);
route('DELETE', '/api/goals/processes/:id', goals.removeProcess);
route('POST', '/api/goals/processes/:id/steps', goals.addStep);
route('PUT', '/api/goals/steps/:id', goals.editStep);
route('DELETE', '/api/goals/steps/:id', goals.removeStep);
route('GET', '/api/research/list', researches.list);
route('GET', '/api/research/find', researches.find);
route('POST', '/api/research/new', researches.create);
route('GET', '/api/research/r/:id', researches.get);
route('PUT', '/api/research/r/:id', researches.update);
route('DELETE', '/api/research/r/:id', researches.remove);
route('GET', '/api/research/r/:id/export', researches.exportResearch);
route('POST', '/api/research/r/:id/notes', researches.addNote);
route('DELETE', '/api/research/r/:id/notes/:noteId', researches.removeNote);
route('GET', '/api/research/of-note/:noteId', researches.ofNote);
route('POST', '/api/research/r/:id/threads', researches.addThread);
route('PUT', '/api/research/threads/:id', researches.editThread);
route('DELETE', '/api/research/threads/:id', researches.removeThread);
route('POST', '/api/research/r/:id/sources', researches.addSource);
route('PUT', '/api/research/sources/:id', researches.editSource);
route('DELETE', '/api/research/sources/:id', researches.removeSource);
route('POST', '/api/research/r/:id/goal', writing.asGoal);
route('POST', '/api/research/r/:id/done', writing.setDone);
route('GET', '/api/research/r/:id/journal', writing.journal);
route('PUT', '/api/research/r/:id/journal', writing.writeJournal);
route('GET', '/api/research/r/:id/drafts', writing.drafts);
route('POST', '/api/research/r/:id/drafts', writing.newDraft);
route('POST', '/api/research/r/:id/ai/directions', writing.aiDirections);
route('POST', '/api/research/r/:id/ai/draft', writing.aiDraft);
route('GET', '/api/research/drafts/:id', writing.getDraft);
route('PUT', '/api/research/drafts/:id', writing.saveDraft);
route('DELETE', '/api/research/drafts/:id', writing.removeDraft);
route('GET', '/api/research/drafts/:id/export', writing.exportDraft);
route('POST', '/api/research/drafts/:id/drive', writing.draftToDrive);
route('POST', '/api/research/r/:id/ai/search', writing.aiSearch);
route('POST', '/api/research/r/:id/ai/compare', writing.aiCompare);
route('POST', '/api/research/sources/:id/ai/summary', writing.aiSummary);
route('POST', '/api/research/drafts/:id/ai/edit', writing.aiEdit);
route('PUT', '/api/research/r/:id/notes/:noteId', researches.editNote);
route('PUT', '/api/research/r/:id/notes/:noteId/share', researches.shareNote);
route('POST', '/api/research/r/:id/members', researches.invite);
route('POST', '/api/research/r/:id/join', researches.join);
route('PUT', '/api/research/r/:id/members/:email', researches.setRole);
route('DELETE', '/api/research/r/:id/members/:email', researches.removeMember);
route('POST', '/api/research/r/:id/comments', researches.comment);
route('DELETE', '/api/research/comments/:id', researches.removeComment);
route('POST', '/api/research/history/:id/restore', researches.restore);

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

/* the family vault (server/vault): unlock, the tree, documents and pictures, the audit log */
route('GET', '/api/vault/status', vault.status);
route('POST', '/api/vault/lock', vault.lock);
route('POST', '/api/vault/unlock/fresh', vault.unlockFresh);
route('POST', '/api/vault/unlock/options', vault.unlockOptions);
route('POST', '/api/vault/unlock', vault.unlockPasskey);
route('POST', '/api/vault/passkeys/options', vault.passkeyOptions);
route('POST', '/api/vault/passkeys', vault.passkeyAdd);
route('GET', '/api/vault/passkeys', vault.passkeyList);
route('DELETE', '/api/vault/passkeys/:id', vault.passkeyRemove);
route('GET', '/api/vault/tree', vault.tree);
route('POST', '/api/vault/people', vault.personSave);
route('GET', '/api/vault/people/:id', vault.personGet);
route('PUT', '/api/vault/people/:id', vault.personSave);
route('DELETE', '/api/vault/people/:id', vault.personDelete);
route('POST', '/api/vault/links', vault.linkAdd);
route('PUT', '/api/vault/links/:id', vault.linkSave);
route('DELETE', '/api/vault/links/:id', vault.linkDelete);
route('GET', '/api/vault/people/:id/items', vault.items);
route('POST', '/api/vault/items', vault.itemAdd);
route('GET', '/api/vault/items/:id/file', vault.itemFile);
route('PUT', '/api/vault/items/:id', vault.itemSave);
route('DELETE', '/api/vault/items/:id', vault.itemDelete);
route('POST', '/api/vault/items/:id/restore', vault.itemRestore);
route('GET', '/api/vault/audit', vault.auditLog);

/* the AI cost report (owner) */
route('GET', '/api/usage', usage.report);
route('GET', '/api/vault/backups', vault.backups);
route('POST', '/api/vault/backups/run', vault.backupsRun);
route('POST', '/api/vault/backups/drive/disconnect', vault.driveDisconnect);

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
route('GET', '/api/music/spotify/token', music.playerToken);
route('GET', '/api/music/spotify/devices', music.devices);
route('GET', '/api/music/spotify/queue', music.queue);
route('POST', '/api/music/spotify/cmd', music.command);
route('GET', '/api/music/spotify/search', music.search);
route('GET', '/api/music/spotify/playlists', music.playlists);
route('GET', '/api/music/youtube/search', music.youtubeSearch);

/* the family tree, stage 2 (ai-features, docs/family-forest.md): heads, links between trees, privacy, the joined trees */
route('GET', '/api/vault/roles', vault.roles);
route('PUT', '/api/vault/roles', vault.roleSave);
route('PUT', '/api/vault/household', vault.householdSave);
route('PUT', '/api/vault/people/:id/privacy', vault.privacySave);
route('GET', '/api/vault/bridges', vault.bridges);
route('POST', '/api/vault/bridges', vault.bridgeAsk);
route('POST', '/api/vault/bridges/:id/approve', vault.bridgeApprove);
route('POST', '/api/vault/bridges/:id/consent', vault.bridgeConsent);
route('POST', '/api/vault/bridges/:id/decline', vault.bridgeDecline);
route('DELETE', '/api/vault/bridges/:id', vault.bridgeRevoke);
route('GET', '/api/vault/forest', vault.forest);
route('GET', '/api/vault/related', vault.related);

/* the calendar as a live link for Google, Apple or Outlook (ai-features) */
route('GET', '/api/calendar/feed', calendar.feedStatus);
route('POST', '/api/calendar/feed', calendar.feedCreate);
route('DELETE', '/api/calendar/feed', calendar.feedRevoke);
route('GET', '/api/calendar/feed/:token', calendar.feed);

/* the family gathering (ai-features, docs/business/gathering.md): the host's side, and the invitation (no sign-in) */
route('GET', '/api/gather', gather.list);
route('POST', '/api/gather', gather.create);
route('GET', '/api/gather/ideas', gather.ideasList);
route('GET', '/api/gather/:id', gather.get);
route('PUT', '/api/gather/:id', gather.save);
route('POST', '/api/gather/:id/cancel', gather.cancel);
route('POST', '/api/gather/:id/reopen', gather.reopen);
route('POST', '/api/gather/:id/items', gather.itemAdd);
route('DELETE', '/api/gather/:id/items/:item', gather.itemDelete);
route('DELETE', '/api/gather/:id/comments/:comment', gather.commentDelete);
route('GET', '/api/gather/invite/:token', gather.invite);
route('POST', '/api/gather/invite/:token/rsvp', gather.rsvp);
route('POST', '/api/gather/invite/:token/items', gather.inviteItemAdd);
route('POST', '/api/gather/invite/:token/items/:item/:action', gather.inviteItemTake);
route('POST', '/api/gather/invite/:token/comments', gather.inviteComment);
route('DELETE', '/api/gather/invite/:token/comments/:comment', gather.inviteCommentDelete);
route('GET', '/api/gather/invite/:token/ics', gather.inviteIcs);
route('POST', '/api/gather/invite/:token/event', gather.inviteEvent);
route('POST', '/api/gather/invite/:token/join', join.inviteJoin);
useInviteHooks({ admit: join.admitFromInvite, joined: join.joinedAs });   // a guest signs in from the invitation (master, server/join.ts)

/* the owner's room (ai-features, server/admin.ts): entered with the owner's biometric; messages and features for everyone */
route('GET', '/api/admin/status', admin.status);
route('POST', '/api/admin/enter/options', admin.enterOptions);
route('POST', '/api/admin/enter', admin.enter);
route('POST', '/api/admin/leave', admin.leave);
route('POST', '/api/admin/ping', admin.ping);
route('POST', '/api/admin/stay', admin.stay);
route('GET', '/api/admin/overview', admin.overview);
route('POST', '/api/admin/ledger', admin.ledgerAdd);
route('PUT', '/api/admin/ledger/:id', admin.ledgerSave);
route('DELETE', '/api/admin/ledger/:id', admin.ledgerDelete);
route('GET', '/api/admin/settings', admin.settingsList);
route('PUT', '/api/admin/settings', admin.settingsSave);
route('GET', '/api/admin/supers', admin.supersList);
route('PUT', '/api/admin/supers', admin.supersSave);
route('GET', '/api/admin/messages', admin.messagesList);
route('POST', '/api/admin/messages', admin.messageSend);
route('POST', '/api/admin/messages/:id/stop', admin.messageStop);
route('GET', '/api/admin/features', admin.featuresList);
route('PUT', '/api/admin/features', admin.featuresSave);
route('GET', '/api/admin/audit', admin.auditList);
route('GET', '/api/messages', admin.messagesForMe);
route('POST', '/api/messages/:id/read', admin.messageRead);
route('GET', '/api/me/features', admin.myFeatures);

/* the AI allowance (ai-features, server/credits.ts): a person's own services, and the room's view of everyone's */
route('GET', '/api/me/ai', credits.mine);
route('PUT', '/api/me/ai/keys', credits.keySave);
route('DELETE', '/api/me/ai/keys/:provider', credits.keyDelete);
route('GET', '/api/admin/allowances', admin.allowances);

/* design's image tool (ai-features, server/design-images.ts): the owner only; pictures through Gemini, kept in MEDIA */
route('GET', '/api/design/images', designImages.list);
route('POST', '/api/design/images', designImages.make);
route('GET', '/api/design/images/:batch/:i', designImages.picture);
route('PUT', '/api/admin/allowances', admin.allowanceSave);
route('GET', '/api/admin/gifts', admin.gifts);
route('POST', '/api/admin/gifts', admin.giftAdd);

/* the family tree on a trusted device (ai-features, server/vault/access.ts): the person's recognized devices */
route('GET', '/api/vault/devices', vault.devices);
route('DELETE', '/api/vault/devices/:id', vault.deviceRevoke);

/* the weather (ai-features, server/weather.ts): Open-Meteo for the person's city */
route('GET', '/api/weather', weather.get);

/* discovery (ai-features, server/discover.ts): which tools a person has found – the home page's count, the "סייר" badge */
route('POST', '/api/visits', discovery.visit);
route('GET', '/api/discover', discovery.discover);
route('POST', '/api/welcome/done', discovery.welcomed);

/* shared goals and encouragement (ai-features, server/goal-social.ts): the household's feed, hearts and advice */
route('GET', '/api/goals/feed', goalSocial.feed);
route('POST', '/api/goals/posts/:id/heart', goalSocial.heart);
route('POST', '/api/goals/posts/:id/advice', goalSocial.advise);
route('POST', '/api/goals/advice/:id/heart', goalSocial.heartAdvice);

/* the owner's room, the family batch (ai-features, server/admin.ts): usage from tool_visits, and the feedback inbox */
route('GET', '/api/admin/usage', admin.usage);
route('GET', '/api/admin/feedback', admin.feedbackList);
route('PUT', '/api/admin/feedback/:id', admin.feedbackSave);
route('POST', '/api/feedback', admin.feedbackSend);
/* the family profile (server/family-profile.ts): read only through its view filter */
route('GET', '/api/family/profile', familyProfile.get);                       // ?t=invitation link | ?h=household
route('PUT', '/api/family/profile', familyProfile.save);                      // a head saves, anyone else suggests
route('POST', '/api/family/profile/open', familyProfile.open);                // { tribe?, link?: 'make' | 'remove' }
route('POST', '/api/family/profile/suggestions/:id', familyProfile.decide);   // { approve }
route('PUT', '/api/family/profile/cover', familyProfile.coverPut);
route('GET', '/api/family/profile/cover', familyProfile.coverGet);
route('GET', '/api/family/find', familyFind.find);                             // ?q=&kin=1&users=1: חיפוש ביער
route('GET', '/api/family/card', familyFind.card);                             // ?id=: a member card in view mode

export const onRequest: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  // Same-origin check for state-changing calls (CSRF protection on top of SameSite cookies): the Origin header must be ours,
  // and where a browser sends no Origin, its Fetch Metadata must not say the request came from another site.
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if (origin ? origin !== url.origin : site === 'cross-site' || site === 'same-site') return json({ error: 'Bad origin' }, 403);
  }
  for (const [method, re, keys, h] of routes) {
    if (method !== request.method) continue;
    const m = re.exec(url.pathname);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, m[i + 1]]));
    try {
      await ensureSchema(env);
      const user = await loadUser(env, request);
      // the app lock: a locked session reaches only the lock itself, /api/me and signing in and out (423 app_locked)
      if (user) await lock.gate(env, request, user.email, url.pathname, waitUntil);
      // every AI call made while answering is metered: who, from which feature (server/meter.ts)
      return await metered({ env, email: user?.email || null, feature: featureOf(url.pathname), waitUntil }, () => h({ req: request, env, url, params, user, waitUntil }));
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error('API error', url.pathname, err instanceof Error ? err.stack || err.message : err);
      return json({ error: 'server_error' }, 500);
    }
  }
  return json({ error: 'Not found' }, 404);
};

