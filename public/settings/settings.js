/* הגדרות – a person's own settings. "חיבור לשירותים": connect their own AI (Claude or Gemini – the key is checked with the
   provider, kept sealed on the server, and from then on their AI requests go with it and need no credit), or get credits
   (not yet: no payment flow). For the owner's family the AI is on the owner, with no limit. (server/credits.ts) */
(async () => {
  const { el, api, toast } = H;
  H.header('הגדרות');
  const { user } = await H.requireLogin();
  const root = document.querySelector('main');
  const ERR = { bad_key: 'המפתח לא נראה נכון. בדקו שהעתקתם את כולו.', key_refused: 'הספק לא קיבל את המפתח. בדקו שהוא פעיל.' };
  const say = (e) => toast(ERR[e?.code] || e?.message || 'משהו השתבש');
  const PROVIDERS = [
    { id: 'claude', name: 'Claude (Anthropic)', where: 'console.anthropic.com → API Keys', placeholder: 'sk-ant-…' },
    { id: 'gemini', name: 'Gemini (Google)', where: 'aistudio.google.com → Get API key', placeholder: 'AIza…' },
  ];

  /* recognized devices: where the family tree opens with no unlock (30 days from each use). Removing one ends that at
     once – and, if asked, signs it out too (server/vault/index.ts devices). */
  const devicesBox = el('section', { id: 'devices', class: 'st-devices' });
  async function drawDevices() {
    let list = [];
    try { list = (await api('/api/vault/devices')).devices; } catch (e) { return devicesBox.replaceChildren(); }
    const day = (t) => (t ? new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
    const remove = async (d, signout) => {
      if (!confirm(signout ? `להסיר את ${d.label} ולהתנתק בו?` : `להסיר את ${d.label}? בפעם הבאה העץ יבקש שוב אישור שם.`)) return;
      try { await api('/api/vault/devices/' + encodeURIComponent(d.id) + (signout ? '?signout=1' : ''), { method: 'DELETE' }); toast('הוסר'); if (d.here && signout) return H.logout(); drawDevices(); } catch (e) { say(e); }
    };
    devicesBox.replaceChildren(
      el('h2', {}, 'מכשירים מוכרים'),
      el('p', { class: 'muted' }, 'במכשירים האלה עץ המשפחה נפתח בלי לבקש אישור, עד 30 יום מהשימוש האחרון. מסמכים, פרטיות, קישור עצים ומחיקה מבקשים אישור בכל פעם.'),
      list.length ? el('ul', { class: 'st-device-list' }, list.map((d) => el('li', { class: 'card st-device' },
        el('b', {}, d.label), d.here ? el('small', { class: 'st-here' }, ' · המכשיר הזה') : null,
        el('p', { class: 'muted small' }, `מוכר מ־${day(d.since)} · שימוש אחרון ${day(d.used)}`),
        el('div', { class: 'st-acts' },
          el('button', { class: 'btn small ghost', type: 'button', onclick: () => remove(d, false) }, 'הסרת ההכרה'),
          el('button', { class: 'btn small ghost', type: 'button', onclick: () => remove(d, true) }, 'הסרה והתנתקות')))))
        : el('p', { class: 'muted small' }, 'עוד אין. מכשיר נעשה מוכר כשפותחים בו את עץ המשפחה בפעם הראשונה.'));
  }

  async function draw() {
    let me;
    try { me = await api('/api/me/ai'); } catch (e) { return say(e); }
    const row = (p) => {
      const has = me.keys[p.id];
      const key = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', dir: 'ltr', placeholder: p.placeholder, 'aria-label': 'המפתח של ' + p.name });
      return el('div', { class: 'card st-service' },
        el('h3', {}, p.name),
        has ? [el('p', {}, `מחובר (מפתח שמסתיים ב־${has.hint.replace('…', '')})`),
          el('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm('לנתק את ' + p.name + '?')) return; try { await api('/api/me/ai/keys/' + p.id, { method: 'DELETE' }); toast('נותק'); draw(); } catch (e) { say(e); } } }, 'ניתוק')]
          : el('form', { class: 'st-key', onsubmit: async (e) => {
            e.preventDefault();
            const b = e.target.querySelector('button'); b.disabled = true;
            try { await api('/api/me/ai/keys', { method: 'PUT', body: { provider: p.id, key: key.value } }); toast('מחובר'); draw(); } catch (err) { say(err); b.disabled = false; }
          } }, el('label', {}, 'מפתח API', key), el('button', { class: 'btn small primary' }, 'חיבור'),
            el('p', { class: 'muted small' }, 'את המפתח מקבלים ב־', el('bdi', { dir: 'ltr' }, p.where), '. הוא נשמר מוצפן, ומשמש רק לבקשות שלך.')));
    };
    root.replaceChildren(el('section', { class: 'st' },
      el('h1', {}, 'הגדרות'),
      el('section', { class: 'card st-account' },
        el('h2', {}, 'החשבון'),
        el('p', {}, user.he_name || user.name || ''), el('p', { class: 'muted small', dir: 'ltr' }, user.email),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => H.logout() }, 'התנתקות')),
      el('section', { id: 'services', class: 'st-services' },
        el('h2', {}, 'חיבור לשירותים'),
        el('p', { class: 'muted' }, me.limited
          ? 'אפשר לחבר את שירות ה־AI שלך, ואז העוזר החכם משתמש בו – בלי הגבלה ובלי קרדיטים. או להוסיף קרדיט.'
          : 'ה־AI של האוהל פתוח לך בלי הגבלה. אם תרצה, אפשר לחבר גם שירות משלך, והבקשות שלך ילכו דרכו.'),
        // amounts only for whoever bought credit or got a gift (the owner's decision); on the trial, only when it ran out
        me.left_ils !== null ? el('p', { class: 'small' }, me.left_ils > 0 ? `נשאר לך קרדיט בשווי כ־₪${me.left_ils}.` : 'הקרדיט נגמר. חברו שירות משלכם, או הוסיפו קרדיט.')
          : me.out ? el('p', { class: 'small' }, 'כדי להמשיך עם העוזר החכם, חברו שירות משלכם, או הוסיפו קרדיט.') : null,
        ...PROVIDERS.map(row),
        el('div', { class: 'card st-service' }, el('h3', {}, 'ChatGPT (OpenAI)'), el('p', { class: 'muted small' }, 'בקרוב: האוהל עוד לא מדבר עם ChatGPT.')),
        el('div', { class: 'card st-service' }, el('h3', {}, 'קרדיט'), el('p', { class: 'muted small' }, 'בקרוב: קניית קרדיט לשימוש ב־AI של האוהל. בינתיים אפשר לחבר שירות משלכם.'),
          el('button', { class: 'btn small', type: 'button', disabled: true }, 'קניית קרדיט')))));
    root.querySelector('.st')?.append(devicesBox);
    drawDevices();
    if (location.hash === '#services') document.getElementById('services')?.scrollIntoView({ block: 'start' });
  }
  draw();
})();
