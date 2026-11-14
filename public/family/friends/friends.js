/* חברים, "the family you choose" (vision batch 27; the look in docs/design/friends.md, the rules in server/friends-rules.ts).
   A friendship needs both sides: a request by email that the other accepts, or a one-time link (7 days) the other opens.
   The page never gets an email back: friends and requests come by opaque ids and names. The link's token rides in the
   #hash (#i=<token>), so it never reaches a server log or a Referer. A child under 12 has no friends from outside the family. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('חברים');
  const root = document.querySelector('main');
  const sec = el('section', { class: 'fr' });
  root.append(sec);

  const av = (f) => el('span', { class: 'fr-av', style: `--c:${f.c}`, 'aria-hidden': 'true' }, f.ini);
  const tokenFromHash = () => (location.hash.match(/^#i=([A-Za-z0-9_-]{24,64})$/) || [])[1] || null;
  let d = null, link = null, filter = '';

  async function load() {
    try { d = await api('/api/friends'); } catch (e) { sec.replaceChildren(el('p', { class: 'notice' }, e.message || 'לא הצלחנו לטעון')); return; }
    draw();
  }

  /* ---------- an invitation that arrived by link ---------- */
  function invitation() {
    const token = tokenFromHash();
    if (!token) return null;
    const box = el('div', { class: 'fr-section' }, el('p', { class: 'muted' }, 'בודקים את ההזמנה…'));
    (async () => {
      let r;
      try { r = await api('/api/friends/link/' + token); } catch (e) { box.replaceChildren(el('p', { class: 'notice' }, e.message || 'לא הצלחנו לבדוק את ההזמנה')); return; }
      const done = (msg) => { history.replaceState(null, '', location.pathname); box.replaceChildren(el('p', { class: 'muted' }, msg)); };
      if (r.state === 'self') return done('זה הקישור שלכם. שלחו אותו למי שתרצו להתחבר אליו.');
      if (r.state === 'child') return done('ילדים מתחת לגיל 12 מתחברים רק עם המשפחה.');
      if (r.state !== 'ok') return done('הקישור הזה כבר לא פעיל. בקשו קישור חדש.');
      const yes = el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        yes.disabled = true;
        try { const a = await api('/api/friends/link/' + token, { method: 'POST' }); done(`אתם חברים עם ${a.name} עכשיו.`); toast('אתם חברים עכשיו'); load(); }
        catch (e) { yes.disabled = false; toast(e.status === 410 ? 'הקישור כבר לא פעיל' : e.message || 'לא הצלחנו'); }
      } }, 'אישור');
      box.replaceChildren(el('h3', {}, 'הזמנה'),
        el('ul', { class: 'fr-reqs' }, el('li', { class: 'fr-req' },
          el('div', {}, el('b', { dir: 'auto' }, r.name), el('small', {}, 'מזמין/ה אתכם להיות חברים')),
          el('div', { class: 'fr-req-acts' }, yes, el('button', { class: 'btn', type: 'button', onclick: () => done('ההזמנה לא אושרה.') }, 'לא עכשיו')))));
    })();
    return box;
  }

  /* ---------- the page ---------- */
  function draw() {
    const search = el('input', { class: 'fr-search', type: 'search', 'aria-label': 'חיפוש חברים', placeholder: 'חיפוש לפי שם', value: filter, dir: 'auto',
      oninput: () => { filter = search.value.trim(); drawGrid(); } });
    const head = el('header', { class: 'fr-head' }, el('h2', {}, 'חברים'), d.friends.length > 5 ? search : null,
      el('p', { class: 'muted' }, 'המשפחה שבוחרים. חברים רואים רק מה שפרסמתם ל"חברים ומשפחה" או לכולם, ויכולים לכתוב לכם.'));
    const kids = [head];
    const inv = invitation();
    if (d.child) {
      kids.push(el('p', { class: 'dm-kid-note' }, 'ילדים מתחת לגיל 12 מקבלים הודעות רק מהמשפחה, ולכן חברים מחוץ למשפחה מחכים לגיל 12.'));
      sec.replaceChildren(...kids);
      return;
    }
    kids.push(inviteBox());
    for (const f of d.found) kids.push(el('div', { class: 'fr-found' }, av(f),
      el('div', {}, el('b', {}, 'גילינו שאתם קרובים!'), el('small', { dir: 'auto' }, `${f.name} גם במשפחה, בעץ המחובר לשלכם.`)),
      el('a', { class: 'btn', href: '/family/' }, 'לעץ')));
    if (d.incoming.length || d.outgoing.length) kids.push(el('div', { class: 'fr-section' }, el('h3', {}, 'בקשות'),
      el('ul', { class: 'fr-reqs' },
        d.incoming.map((r) => el('li', { class: 'fr-req' }, av(r), el('div', {}, el('b', { dir: 'auto' }, r.name), el('small', {}, 'רוצה להתחבר')),
          el('div', { class: 'fr-req-acts' },
            el('button', { class: 'btn primary', type: 'button', onclick: () => act(r, 'accept') }, 'אישור'),
            el('button', { class: 'btn', type: 'button', onclick: () => act(r, 'remove') }, 'לא עכשיו')))),
        d.outgoing.map((r) => el('li', { class: 'fr-req out' }, av(r), el('div', {}, el('b', { dir: 'auto' }, r.name), el('small', {}, 'מחכה לאישור')),
          el('div', { class: 'fr-req-acts' }, el('button', { class: 'btn', type: 'button', onclick: () => act(r, 'remove') }, 'ביטול')))))));
    grid = el('ul', { class: 'fr-grid' });
    empty = el('p', { class: 'fr-empty' }, 'עוד אין חברים. שלחו קישור או בקשה, וכשהצד השני יאשר, החבר יופיע כאן.');
    kids.push(el('div', { class: 'fr-section' }, el('h3', {}, 'החברים שלי'), grid, empty));
    if (inv) kids.splice(1, 0, inv);
    sec.replaceChildren(...kids);
    drawGrid();
  }
  let grid = null, empty = null;
  function drawGrid() {
    if (!grid) return;
    const list = d.friends.filter((f) => !filter || f.name.includes(filter));
    empty.hidden = list.length > 0;
    if (filter && !list.length) empty.textContent = 'אין חבר בשם הזה.';
    grid.replaceChildren(...list.map((f) => el('li', { class: 'fr-card' }, av(f),
      el('b', { dir: 'auto' }, f.name, f.kin ? el('span', { class: 'fr-kin' }, 'גם משפחה') : null),
      el('small', {}, f.since ? 'חברים מ' + new Date(f.since).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) : ''),
      el('a', { class: 'fr-talk', href: '/messages/?to=' + encodeURIComponent(f.id), 'aria-label': 'שיחה עם ' + f.name, title: 'שיחה עם ' + f.name }),
      el('a', { class: 'btn ghost small', href: '/family/story/?f=' + encodeURIComponent(f.id) }, 'המוזיאון'),
      el('button', { type: 'button', onclick: () => act(f, 'end') }, 'הסרה'))));
  }

  /* ---------- inviting: a one-time link, or a request by email ---------- */
  function inviteBox() {
    const code = el('code', { dir: 'ltr' }, link ? link.url : '');
    const copy = async () => { try { await navigator.clipboard.writeText(link.url); toast('הקישור הועתק'); } catch (_) { prompt('הקישור:', link.url); } };
    const make = el('button', { class: 'btn', type: 'button', onclick: async () => {
      make.disabled = true;
      try { link = await api('/api/friends/link', { method: 'POST' }); draw(); copy(); }
      catch (e) { make.disabled = false; toast(e.status === 429 ? 'יותר מדי קישורים. נסו שוב בעוד שעה.' : e.message || 'לא הצלחנו'); }
    } }, link ? 'קישור חדש' : 'יצירת קישור');
    const email = el('input', { type: 'email', dir: 'ltr', inputmode: 'email', autocomplete: 'off', placeholder: 'name@example.com', 'aria-label': 'כתובת המייל של מי שרוצים להתחבר אליו' });
    const ask = el('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!email.checkValidity() || !email.value.trim()) { toast('כתבו כתובת מייל'); email.focus(); return; }
      ask.disabled = true;
      try { await api('/api/friends', { body: { email: email.value } }); email.value = ''; toast('אם יש לאדם הזה חשבון באוהל, הבקשה מחכה לו.'); load(); }
      catch (e) { toast(e.status === 429 ? 'יותר מדי בקשות. נסו שוב בעוד שעה.' : e.message || 'לא הצלחנו'); }
      finally { ask.disabled = false; }
    } }, 'שליחת בקשה');
    return el('div', { class: 'fr-invite' },
      el('p', {}, 'קישור הזמנה עובד פעם אחת, למשך שבוע. מי שפותח אותו מאשר, וכך שני הצדדים הסכימו.'),
      link ? code : null,
      link ? el('button', { class: 'btn', type: 'button', onclick: copy }, 'העתקה') : null,
      make,
      el('p', {}, 'או בקשה לפי מייל (רק למי שכבר באוהל):'), email, ask);
  }

  async function act(r, what) {
    if (what === 'end' && !confirm(`להסיר את ${r.name} מהחברים? זה מסיר לשני הצדדים.`)) return;
    try {
      if (what === 'accept') await api(`/api/friends/${encodeURIComponent(r.id)}/accept`, { method: 'POST' });
      else await api(`/api/friends/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      toast(what === 'accept' ? 'אתם חברים עכשיו' : what === 'end' ? 'הוסר מהחברים' : 'בוצע');
      load();
    } catch (e) { toast(e.status === 403 ? 'ילדים מתחת לגיל 12 מתחברים רק עם המשפחה.' : e.message || 'לא הצלחנו'); }
  }

  addEventListener('hashchange', () => { if (tokenFromHash() && d) draw(); });
  await load();
})();
