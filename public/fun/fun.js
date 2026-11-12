/* בידור: by medium – television, film, live shows, music, games, funny things, books – and it scrolls on without end.
   Every tab but מצחיק shows recommendations only: what it is, why, and where it can be watched, heard, played or booked in
   Israel, with the service's logo (chosen on the server, server/fun.ts; each page kept for twelve hours; the next page reads
   older headlines). מצחיק is what is going round the web: the most popular comedy on YouTube in Israel and in the world,
   played right here, and funny, kind pictures from Reddit. The tab you were on is remembered for you (H.prefs); the first page of
   each tab stays on this device so the board opens at once. */
(async () => {
  const { el, toast } = H;
  await H.requireLogin();
  H.header('בידור');
  const CATS = [
    ['tv', 'טלוויזיה', 'tv', '#cfe7ff'], ['film', 'קולנוע', 'clapper', '#ffd6e0'], ['live', 'הופעות', 'mic', '#ffe0cc'], ['music', 'מוזיקה', 'music', '#e3d9ff'],
    ['games', 'משחקים', 'gamepad', '#d4f2dc'], ['funny', 'מצחיק', 'smile', '#fff0b3'], ['books', 'ספרים', 'book', '#f4d9c4'],
  ];
  const P = H.prefs('fun', { cat: 'tv' });
  const root = document.querySelector('main');
  const tabs = el('nav', { class: 'fun-tabs', role: 'tablist', 'aria-label': 'סוגי הבידור' });
  const board = el('section', { class: 'fun-board', 'aria-live': 'polite' });
  const stamp = el('span', {});
  // a fresh choice on request (the server allows one every ten minutes per tab, since it costs a search-backed AI call)
  const refresh = el('button', { class: 'btn ghost small fun-refresh', type: 'button', title: 'לבחור מחדש עכשיו', onclick: () => open(S.cat, true) },
    el('span', { 'aria-hidden': 'true' }, '↻'), ' רענון');
  const stampRow = el('div', { class: 'fun-stamp muted' }, stamp, refresh);
  const foot = el('div', { class: 'fun-foot' });   // the end of the board: when it comes into view, the next page loads
  root.append(el('div', { class: 'fun' },
    el('header', { class: 'fun-head' },
      el('span', { class: 'fun-logo', 'aria-hidden': 'true' }, H.icon('fun')),
      el('div', {}, el('small', {}, 'בידור'), el('h1', {}, 'מה שווה לראות, לשמוע ולשחק'), el('p', { class: 'muted' }, 'רק המלצות – ואיפה אפשר למצוא אותן בישראל'))),
    tabs, stampRow, board, foot));

  /* a recommendation */
  const logo = (w) => (w.domain ? el('img', { class: 'fun-svc-logo', src: `/api/fun/logo/${w.domain}`, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(el('span', { class: 'fun-svc-dot', 'aria-hidden': 'true' }, (w.name || '?').slice(0, 1))) }) : el('span', { class: 'fun-svc-dot', 'aria-hidden': 'true' }, (w.name || '?').slice(0, 1)));
  function card(p, tint) {
    const where = p.where?.length
      ? el('div', { class: 'fun-where' }, el('small', {}, 'איפה:'), p.where.map((w) => {
          const inner = [logo(w), el('span', { class: 'fun-svc-name' }, w.name), w.note ? el('small', {}, w.note) : ''];
          return w.url ? el('a', { class: 'fun-svc', href: w.url, target: '_blank', rel: 'noopener' }, ...inner) : el('span', { class: 'fun-svc' }, ...inner);
        }))
      : el('p', { class: 'fun-where none muted' }, 'עוד לא ידוע איפה אפשר למצוא את זה בישראל.');
    return el('article', { class: 'fun-card', style: `--tint:${tint}` },
      p.image ? el('a', { class: 'fun-img', href: p.link, target: '_blank', rel: 'noopener', tabindex: -1, 'aria-hidden': 'true' }, el('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.closest('.fun-img').remove() })) : '',
      el('div', { class: 'fun-body' },
        el('div', { class: 'fun-tags' }, p.kind ? el('span', { class: 'fun-kind' }, p.kind) : '', p.family ? el('span', { class: 'fun-age' }, p.family) : '', p.rating ? el('span', { class: 'fun-rate' }, '★ ' + p.rating) : ''),
        el('h3', { dir: 'auto' }, p.title), p.original && p.original !== p.title ? el('p', { class: 'fun-orig', dir: 'ltr' }, p.original) : '',
        p.what ? el('p', { class: 'fun-what' }, p.what) : '',
        p.why ? el('p', { class: 'fun-why' }, p.why) : '',
        where,
        el('a', { class: 'fun-src', href: p.link, target: '_blank', rel: 'noopener' }, 'ההמלצה מ־', p.source, ' ↗')));
  }

  /* something going round the web: a video plays in its card (YouTube, privacy-enhanced); a picture shows whole */
  const views = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} מיליון צפיות` : n >= 1e3 ? `${Math.round(n / 1e3)} אלף צפיות` : n ? `${n} צפיות` : '');
  function viralCard(v) {
    const flag = v.region === 'il' ? el('span', { class: 'fun-flag' }, '🇮🇱 ויראלי בארץ') : el('span', { class: 'fun-flag' }, '🌍 ויראלי בעולם');
    if (v.type === 'video') {
      const media = el('button', { class: 'fun-play', 'aria-label': 'ניגון: ' + v.title, onclick: () => {
        media.replaceWith(el('div', { class: 'fun-frame' }, el('iframe', { src: `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1`, title: v.title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, loading: 'lazy' })));
      } }, el('img', { src: v.thumb, alt: '', loading: 'lazy' }), el('span', { class: 'fun-play-ic', 'aria-hidden': 'true' }, '▶'));
      return el('article', { class: 'fun-card fun-v' }, media, el('div', { class: 'fun-body' },
        el('div', { class: 'fun-tags' }, flag, views(v.views) ? el('span', {}, views(v.views)) : ''),
        el('h3', { dir: 'auto' }, v.title), el('a', { class: 'fun-src', href: v.url, target: '_blank', rel: 'noopener' }, v.channel, ' · YouTube ↗')));
    }
    const img = el('img', { src: v.src, alt: v.title, loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.closest('.fun-card').remove() });
    let media = el('div', { class: 'fun-pic' }, img);
    if (v.video) {   // a video on Reddit: its picture, and a tap plays it in Reddit's own player
      media = el('button', { class: 'fun-play pic', 'aria-label': 'ניגון: ' + v.title, onclick: () => {
        const path = new URL(v.video).pathname;
        media.replaceWith(el('div', { class: 'fun-frame tall' }, el('iframe', { src: `https://www.redditmedia.com${path}?ref_source=embed&ref=share&embed=true&theme=${H.isDark?.() ? 'dark' : 'light'}`, title: v.title, allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, loading: 'lazy', sandbox: 'allow-scripts allow-same-origin allow-popups' })));
      } }, img, el('span', { class: 'fun-play-ic', 'aria-hidden': 'true' }, '▶'));
    }
    return el('article', { class: 'fun-card fun-i' }, media, el('div', { class: 'fun-body' },
      el('div', { class: 'fun-tags' }, flag), el('h3', { dir: 'auto' }, v.title), el('a', { class: 'fun-src', href: v.link, target: '_blank', rel: 'noopener' }, v.source, /^Lemmy/.test(v.source) ? ' ↗' : ' · Reddit ↗')));
  }

  const keep = (cat, d) => { try { localStorage.setItem('fun-' + cat, JSON.stringify(d)); } catch (_) { /* full */ } };
  const kept = (cat) => { try { return JSON.parse(localStorage.getItem('fun-' + cat) || 'null'); } catch (_) { return null; } };
  const ago = (t) => { const h = Math.round((Date.now() - t) / 36e5); return h < 1 ? 'עכשיו' : h === 1 ? 'לפני שעה' : h < 24 ? `לפני ${h} שעות` : `לפני ${Math.round(h / 24)} ימים`; };
  const spinner = (text) => el('p', { class: 'fun-wait muted' }, el('span', { class: 'fun-spin', 'aria-hidden': 'true' }), text);

  /* the state of the open tab, and the next page */
  let S = null, token = 0;
  async function more() {
    if (!S || S.busy || S.done) return;
    S.busy = true;
    const mine = token, [, name, , tint] = CATS.find((c) => c[0] === S.cat);
    foot.replaceChildren(spinner(S.cat === 'funny' ? 'מביא עוד…' : `בוחר עוד המלצות ב${name}…`));
    try {
      if (S.cat === 'funny') {
        const d = await H.api('/api/fun/viral' + (S.cursor ? '?cursor=' + encodeURIComponent(S.cursor) : S.fresh ? '?fresh=1' : ''));
        if (mine !== token) return;
        const fresh = d.items.filter((v) => !S.seen.has(v.id || v.src) && S.seen.add(v.id || v.src));
        board.append(...fresh.map(viralCard));
        S.cursor = d.cursor; S.done = !d.cursor;
        if (S.page === 0) { keep('funny', { items: fresh, cursor: d.cursor, at: Date.now() }); stamp.textContent = 'מה שמסתובב ברשת עכשיו – בארץ ובעולם'; }
      } else {
        const d = await H.api(`/api/fun/picks?cat=${S.cat}&page=${S.page}${S.fresh && S.page === 0 ? '&fresh=1' : ''}`);
        if (S.fresh && S.page === 0 && Date.now() - (d.at || 0) > 60e3) H.toast('הבחירה כאן עודכנה לפני רגע – אפשר לבחור שוב בעוד כמה דקות');
        if (mine !== token) return;
        const key = (p) => (p.original || p.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const fresh = d.picks.filter((p) => !S.seen.has(p.link) && !S.seen.has(key(p)) && S.seen.add(p.link) && S.seen.add(key(p)));
        board.append(...fresh.map((p) => card(p, tint)));
        if (S.page === 0) { keep(S.cat, d); stamp.textContent = `נבחרו ${ago(d.at)}`; }
        S.done = !d.more || !d.picks.length;
      }
      S.page++;
    } catch (_) {
      if (mine !== token) return;
      S.failed = (S.failed || 0) + 1;
      if (S.failed > 2) S.done = true;
      if (!board.childElementCount) board.replaceChildren(el('p', {}, 'לא הצלחתי להביא כרגע. נסו שוב בעוד רגע.'));
    } finally {
      if (mine === token) {
        S.busy = false;
        foot.replaceChildren(S.done ? el('p', { class: 'muted fun-end' }, board.childElementCount ? 'זה הכל לעכשיו – עוד יגיע בקרוב.' : '') : '');
        // still room on the screen: the next page at once
        if (!S.done && foot.getBoundingClientRect().top < innerHeight + 400) more();
      }
    }
  }
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(); }, { rootMargin: '600px 0px' }).observe(foot);

  function open(cat, fresh = false) {
    P.cat = cat; H.savePrefs('fun');
    const [, name, , tint] = CATS.find((c) => c[0] === cat);
    tabs.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.cat === cat; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    token++;
    S = { cat, page: 0, seen: new Set(), busy: false, done: false, cursor: null, fresh };
    refresh.disabled = false;
    board.classList.toggle('viral', cat === 'funny');
    stamp.textContent = '';
    // what this device kept from last time, while the fresh first page comes
    const old = fresh ? null : kept(cat);
    if (fresh) scrollTo({ top: 0, behavior: 'smooth' });
    if (old && cat === 'funny' && old.items?.length) { board.replaceChildren(...old.items.map(viralCard)); old.items.forEach((v) => S.seen.add(v.id || v.src)); S.cursor = old.cursor; S.page = 1; stamp.textContent = 'מה שמסתובב ברשת עכשיו – בארץ ובעולם'; }
    else if (old && old.picks?.length) { board.replaceChildren(...old.picks.map((p) => card(p, tint))); old.picks.forEach((p) => { S.seen.add(p.link); S.seen.add((p.original || p.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')); }); S.page = 1; stamp.textContent = `נבחרו ${ago(old.at)}`; }
    else board.replaceChildren(spinner(cat === 'funny' ? 'מחפש מה הכי ויראלי עכשיו…' : `בוחר את המומלצים ב${name} ובודק איפה אפשר לראות אותם… (עד דקה)`));
    if (!old) { const first = board.firstElementChild; S.page = 0; more().then(() => first?.classList.contains('fun-wait') && first.remove()); }
    else more();
  }
  tabs.append(...CATS.map(([cat, name, ic, tint]) => el('button', { role: 'tab', class: 'fun-tab', 'data-cat': cat, style: `--tint:${tint}`, onclick: () => open(cat) },
    el('span', { class: 'ic' }, H.icon(ic)), el('span', {}, name))));
  open(CATS.some((c) => c[0] === P.cat) ? P.cat : 'tv');

  /* pull to refresh: at the top of the page, a finger drawing the page down past the mark chooses again (like the feeds of
     social apps). The browser's own pull (which would reload the whole page) is turned off here in fun.css. */
  const pull = el('div', { class: 'fun-pull', 'aria-hidden': 'true' }, el('span', {}, '↻'));
  document.body.append(pull);
  const MARK = 80;
  let y0 = null, dy = 0;
  addEventListener('touchstart', (e) => {
    y0 = scrollY <= 0 && e.touches.length === 1 && !document.body.classList.contains('modal-open') ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (scrollY > 0) { y0 = null; dy = 0; }
    const k = Math.min(1, dy / MARK);
    pull.style.setProperty('--pull', String(Math.min(dy, MARK * 1.4)));
    pull.style.setProperty('--turn', `${k * 300}deg`);
    pull.classList.toggle('ready', k >= 1);
    pull.classList.toggle('on', dy > 8);
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 != null && dy >= MARK && S) { pull.classList.add('spin'); open(S.cat, true); setTimeout(() => pull.classList.remove('spin', 'on', 'ready'), 900); }
    else pull.classList.remove('on', 'ready');
    y0 = null; dy = 0;
  }, { passive: true });
})();
