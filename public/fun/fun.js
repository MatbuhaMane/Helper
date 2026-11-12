/* בידור: recommendations only, by medium – television, film, live shows, music, games, funny things, books.
   Each card says what it is and why it is recommended, and where it can be watched, heard, played or booked in Israel, with the
   logo of the service. The picks are chosen on the server (server/fun.ts) and kept for twelve hours. The tab you were on is
   remembered for you (H.prefs), and the last picks of each tab stay on this device so the board opens at once. */
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
  const stamp = el('p', { class: 'fun-stamp muted' });
  root.append(el('div', { class: 'fun' },
    el('header', { class: 'fun-head' },
      el('span', { class: 'fun-logo', 'aria-hidden': 'true' }, H.icon('fun')),
      el('div', {}, el('small', {}, 'בידור'), el('h1', {}, 'מה שווה לראות, לשמוע ולשחק'), el('p', { class: 'muted' }, 'רק המלצות – ואיפה אפשר למצוא אותן בישראל'))),
    tabs, stamp, board));

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
  const keep = (cat, d) => { try { localStorage.setItem('fun-' + cat, JSON.stringify(d)); } catch (_) { /* full */ } };
  const kept = (cat) => { try { return JSON.parse(localStorage.getItem('fun-' + cat) || 'null'); } catch (_) { return null; } };
  const ago = (t) => { const h = Math.round((Date.now() - t) / 36e5); return h < 1 ? 'עכשיו' : h === 1 ? 'לפני שעה' : h < 24 ? `לפני ${h} שעות` : `לפני ${Math.round(h / 24)} ימים`; };

  function draw(d, tint) {
    stamp.textContent = d ? `${d.picks.length} המלצות · נבחרו ${ago(d.at)}` : '';
    if (!d) return;
    board.replaceChildren(...(d.picks.length ? d.picks.map((p) => card(p, tint)) : [el('p', { class: 'muted' }, 'אין כרגע המלצות בקטגוריה הזו. נסו שוב מאוחר יותר.')]));
  }
  let token = 0;
  async function open(cat, fresh) {
    P.cat = cat; H.savePrefs('fun');
    const [, name, , tint] = CATS.find((c) => c[0] === cat);
    tabs.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.cat === cat; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    const mine = ++token;
    const old = kept(cat);
    if (old) draw(old, tint);
    else board.replaceChildren(el('p', { class: 'fun-wait muted' }, el('span', { class: 'fun-spin', 'aria-hidden': 'true' }), `בוחר את המומלצים ב${name} ובודק איפה אפשר לראות אותם… (עד דקה)`));
    try {
      const d = await H.api(`/api/fun/picks?cat=${cat}${fresh ? '&fresh=1' : ''}`);
      if (mine !== token) return;
      keep(cat, d); draw(d, tint);
    } catch (_) {
      if (mine !== token) return;
      if (!old) board.replaceChildren(el('p', {}, 'לא הצלחתי להביא המלצות כרגע. נסו שוב בעוד רגע.'));
      else toast('מוצגות ההמלצות האחרונות שנשמרו');
    }
  }
  tabs.append(...CATS.map(([cat, name, ic, tint]) => el('button', { role: 'tab', class: 'fun-tab', 'data-cat': cat, style: `--tint:${tint}`, onclick: () => open(cat) },
    el('span', { class: 'ic' }, H.icon(ic)), el('span', {}, name))));
  open(CATS.some((c) => c[0] === P.cat) ? P.cat : 'tv');
})();
