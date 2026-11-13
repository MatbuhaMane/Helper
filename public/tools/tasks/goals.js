/* ניהול מטרות (vision's spec v1, docs/vision/goals.md): the dashboard of goals and their path; a new goal in five steps
   (what and why – written or spoken · its length · processes from a template or ✨ · the first three steps · the rhythm
   with the rest day); "היום" with 2–3 small steps; a goal's processes as checklists; "נתקעתי" (a guided question, or ✨);
   the "why" coming back after two quiet days; the weekly minute on the day before the rest day; and the badges.
   Without AI: templates, guided questions and the browser's own speech-to-text. ✨ (the person's own AI or credit):
   breaking a goal into processes, and small versions of a stuck step. The server: /api/goals (server/goals.ts).
   The look is design's (.gl-*); the inline rules only hold the layout until then. */
(async () => {
  const { el, api, toast } = H;
  const { user } = await H.requireLogin();
  H.header('ניהול מטרות');
  const root = document.querySelector('main');
  const KIND = { short: 'קצרה', regular: 'רגילה', long: 'ארוכת טווח' };
  const KIND_HINT = { short: 'פחות מיום', regular: 'ימים עד חודשים', long: 'יותר משנה' };
  const WD = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const WD_NAME = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const REST_NAME = (r) => (r === 6 ? 'שבת' : r === null ? 'בלי יום מנוחה' : 'יום ' + WD_NAME[r]);
  const ROW = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px';
  let D = null, openGoal = null;

  /* ---------- the AI: ✨, or an invitation when none is left ---------- */
  let aiP = null;
  const noAi = () => (aiP ||= api('/api/me/ai').then((me) => !!me.out && !Object.keys(me.keys || {}).length).catch(() => false));
  const invite = () => H.loadOnce('/assets/ai-invite.js').then(() => H.aiInvite?.()).catch(() => toast('אפשר לחבר AI בהגדרות ← חיבור לשירותים'));
  const sparkle = (label, run) => {
    const b = el('button', { class: 'btn ai-up', type: 'button', onclick: async () => { if (await noAi()) return invite(); b.disabled = true; const t = b.textContent; b.textContent = 'רגע…'; try { await run(); } catch (e) { if (e?.code !== 'ai_credit_needed') toast('זה לא הצליח כרגע'); } b.disabled = false; b.textContent = t; } }, label);
    noAi().then((out) => b.classList.toggle('offer', out));
    return b;
  };

  /* ---------- speaking instead of typing: the browser's own speech-to-text (on the device, no AI) ---------- */
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function mic(target) {
    if (!Rec) return null;
    let rec = null;
    const b = el('button', { class: 'btn ghost small gl-mic', type: 'button', 'aria-label': 'להקליט במקום לכתוב', title: 'להקליט במקום לכתוב', onclick: () => {
      if (rec) { rec.stop(); return; }
      rec = new Rec(); rec.lang = 'he-IL'; rec.interimResults = true; rec.continuous = true;
      const before = target.value ? target.value.replace(/\s*$/, ' ') : '';
      rec.onresult = (e) => { target.value = before + [...e.results].map((r) => r[0].transcript).join(' '); target.dispatchEvent(new Event('input')); };
      rec.onend = () => { rec = null; b.textContent = '🎤'; b.setAttribute('aria-pressed', 'false'); };
      rec.onerror = (e) => { if (e.error === 'not-allowed') toast('צריך לאשר לדפדפן גישה למיקרופון'); };
      rec.start(); b.textContent = '⏹'; b.setAttribute('aria-pressed', 'true');
    } }, '🎤');
    return b;
  }

  /* ---------- data ---------- */
  async function load() { D = await api('/api/goals'); celebrate(D.badges.fresh); draw(); }
  const catalog = () => new Map(D.catalog.map((b) => [b.id, b]));
  function celebrate(ids) {
    if (!ids?.length) return;
    const c = catalog();
    for (const id of ids) { const b = c.get(id); if (b) toast(`🏅 קיבלת badge: ${b.name}`); }
  }
  const progress = (g) => { const all = g.processes.flatMap((p) => p.steps); return { done: all.filter((s) => s.done).length, all: all.length }; };
  const goalOf = (id) => D.goals.find((g) => g.id === id);

  async function toggleStep(s, done) {
    try {
      const r = await api(`/api/goals/steps/${s.id}`, { method: 'PUT', body: { done } });
      if (done) {
        celebrate(r.fresh);
        const g = goalOf(s.goal);
        if (r.goalDone && g?.status === 'active') setTimeout(() => askDone(g), 300);
      }
      await load();
    } catch (e) { toast(e.message || 'לא נשמר'); }
  }
  function askDone(g) {
    H.modal(el('h2', {}, '🎉 כל הצעדים סומנו'), el('p', {}, `השגת את "${g.title}"?`),
      el('div', { style: ROW },
        el('button', { class: 'btn primary', type: 'button', onclick: async () => { H.closeModal(); await api(`/api/goals/${g.id}`, { method: 'PUT', body: { status: 'done' } }); await load(); toast('האוהל עומד 🎉'); } }, 'כן, השגתי!'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'עוד לא – אוסיף צעדים')));
  }

  /* ---------- the dashboard ---------- */
  function draw() {
    if (openGoal && goalOf(openGoal)) return drawGoal(goalOf(openGoal));
    openGoal = null;
    const active = D.goals.filter((g) => g.status === 'active'), done = D.goals.filter((g) => g.status === 'done');
    root.replaceChildren(el('div', { class: 'gl' },
      el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'),
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap' },
        el('h1', {}, 'ניהול מטרות'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => wizard() }, '+ מטרה חדשה')),
      D.why ? whyCard(D.why) : null,
      D.review ? el('section', { class: 'card gl-review-due' }, el('b', {}, '🗓 דקה לסיכום השבוע'), el('p', { class: 'muted', style: 'margin:0' }, 'מה הלך טוב, מה נתקע, ומה משנים. דקה אחת, לפני יום המנוחה.'),
        el('div', {}, el('button', { class: 'btn small', type: 'button', onclick: weeklyReview }, 'לסיכום'))) : null,
      todayCard(),
      el('section', { class: 'gl-pulse card' },
        el('div', {}, el('small', { class: 'muted' }, 'השבוע'), el('div', {}, `${D.week.done} מתוך ${D.week.of}`),
          el('small', { class: 'muted' }, D.rest === null ? 'ימים עם צעד' : `ימים עם צעד (${REST_NAME(D.rest)} לא נספר)`)),
        el('div', {}, el('small', { class: 'muted' }, 'רצף'), el('div', {}, D.streak ? `🔥 ${D.streak}` : '—'),
          el('small', { class: 'muted' }, D.rest === null ? 'ימים ברצף' : `יום המנוחה לא שובר רצף`)),
        el('div', {}, el('small', { class: 'muted' }, 'badges'), el('div', {}, `🏅 ${D.badges.earned.length}`),
          el('button', { class: 'btn ghost small', type: 'button', onclick: badgesGallery }, 'לכל ה־badges'))),
      el('h2', {}, 'המטרות שלי'),
      active.length ? el('div', { class: 'gl-goals' }, active.map(goalCard))
        : emptyState(),
      done.length ? el('details', { class: 'gl-done' }, el('summary', {}, `🏕 מטרות שהושגו (${done.length})`),
        el('div', { style: 'display:grid;gap:8px;margin-top:8px' }, done.map(goalCard))) : null,
      el('p', { class: 'small muted' }, 'יום המנוחה שלי: ', el('b', {}, REST_NAME(D.rest)), ' · ', el('button', { class: 'linklike', type: 'button', style: 'background:none;border:0;color:var(--primary);cursor:pointer;font:inherit;text-decoration:underline', onclick: restPicker }, 'שינוי'))));
  }
  function emptyState() {
    return el('div', { class: 'card gl-empty' },
      el('p', { style: 'margin:0' }, 'עוד אין כאן מטרות.'),
      el('p', { class: 'muted', style: 'margin:0' }, 'כותבים מטרה ולמה היא חשובה, והאוהל עוזר לחלק אותה לתהליכים ולצעדים קטנים, יום אחרי יום.'),
      el('div', { style: ROW + ';justify-content:center' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => wizard() }, '+ המטרה הראשונה'),
        // the owner's own first goal: the tent itself (the spec's first goal and example)
        user.role === 'owner' ? el('button', { class: 'btn', type: 'button', onclick: () => wizard({ title: 'הָאֹהֶל: מוצר שעוזר למשפחה ומפרנס', why: 'לעזור לבני המשפחה לנהל את חייהם ולשמור על קשר, ושזה יפרנס ויאפשר להמשיך ליצור.', kind: 'long', template: 'ohel' }) }, '⛺ להתחיל במטרה של האוהל') : null));
  }
  function goalCard(g) {
    const p = progress(g), pct = p.all ? Math.round((100 * p.done) / p.all) : 0;
    const procDone = g.processes.filter((x) => x.steps.length && x.steps.every((s) => s.done)).length;
    return el('button', { class: 'card gl-goal', type: 'button', onclick: () => { openGoal = g.id; draw(); scrollTo(0, 0); } },
      el('div', { style: 'display:flex;gap:8px;align-items:start' }, el('b', { dir: 'auto', style: 'flex:1;font-size:1.05rem' }, g.title), el('small', { class: 'gl-kind ' + g.kind }, KIND[g.kind])),
      g.why ? el('small', { class: 'muted', dir: 'auto', style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, g.why) : null,
      el('div', { class: 'gl-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'התקדמות' },
        el('span', { style: `inline-size:${pct}%` })),
      el('small', { class: 'muted' }, `${p.done} מתוך ${p.all} צעדים · תהליך ${Math.min(procDone + 1, g.processes.length || 1)} מתוך ${g.processes.length || 1}`, g.due ? ` · עד ${new Date(g.due).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}` : ''));
  }
  function todayCard() {
    if (D.isRest) return el('section', { class: 'card gl-today rest' }, el('b', {}, '🌿 היום ' + REST_NAME(D.rest)), el('p', { class: 'muted', style: 'margin:0' }, 'יום מנוחה. הוא לא שובר שום רצף, והמנוחה עצמה נחשבת.'));
    const items = D.today;
    return el('section', { class: 'card gl-today' },
      el('b', {}, '☀ היום'),
      items.length ? el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, items.map((s) => stepRow(s, { showGoal: true })))
        : el('p', { class: 'muted', style: 'margin:0' }, D.goals.some((g) => g.status === 'active') ? 'אין צעדים פתוחים להיום. אפשר להוסיף צעד באחת המטרות.' : 'כשתהיה מטרה, כאן יופיעו שניים־שלושה צעדים קטנים להיום.'),
      // one open thread of the research assistant for today (the same all day, another tomorrow)
      D.thread ? el('a', { class: 'gl-thread', href: `/tools/research/?r=${encodeURIComponent(D.thread.research)}`, style: 'display:block;text-decoration:none;color:inherit;border-block-start:1px dashed var(--line);padding-block-start:8px' },
        el('small', { class: 'muted' }, '🧵 חוט אחד להיום · ' + D.thread.researchTitle), el('span', { dir: 'auto', style: 'display:block' }, D.thread.text)) : null);
  }
  function stepRow(s, { showGoal = false } = {}) {
    const box = el('input', { type: 'checkbox', checked: s.done, 'aria-label': 'סימון: ' + s.text, onchange: (e) => toggleStep(s, e.target.checked) });
    const g = goalOf(s.goal);
    return el('li', { class: 'gl-step' + (s.done ? ' done' : '') + (s.small ? ' small' : ''), style: 'display:flex;align-items:start;gap:8px' },
      box,
      el('span', { style: 'flex:1;min-inline-size:0' + (s.done ? ';text-decoration:line-through;opacity:.65' : '') },
        el('span', { dir: 'auto' }, (s.small ? '⏱ ' : '') + s.text), showGoal && g ? el('small', { class: 'muted', style: 'display:block' }, g.title) : null),
      s.done ? null : el('button', { class: 'btn ghost small gl-stuck', type: 'button', title: 'הצעד גדול מדי? נפרק אותו לגרסה של חמש דקות', onclick: () => stuck(s) }, 'נתקעתי'));
  }
  function whyCard(w) {
    return el('section', { class: 'card gl-why' },
      el('small', { class: 'muted' }, 'זוכרים למה?'),
      el('b', { dir: 'auto' }, w.title),
      el('p', { dir: 'auto', style: 'margin:0;font-size:1.1rem' }, '“' + w.why + '”'),
      w.step ? el('ul', { style: 'list-style:none;margin:0;padding:0' }, stepRow({ ...w.step, goal: w.goal })) : null);
  }

  /* ---------- one goal: its processes as checklists ---------- */
  function drawGoal(g) {
    const p = progress(g), pct = p.all ? Math.round((100 * p.done) / p.all) : 0;
    root.replaceChildren(el('div', { class: 'gl gl-one' },
      el('button', { class: 'folder-back', type: 'button', onclick: () => { openGoal = null; draw(); } }, '‹ כל המטרות'),
      el('div', { style: 'display:grid;gap:6px' },
        el('h1', { dir: 'auto' }, g.title),
        g.why ? el('p', { class: 'gl-why-line', dir: 'auto', style: 'margin:0;font-size:1.05rem' }, '“' + g.why + '”') : null,
        el('small', { class: 'muted' }, `${KIND[g.kind]} · ${p.done} מתוך ${p.all} צעדים`, g.due ? ` · עד ${new Date(g.due).toLocaleDateString('he-IL')}` : '',
          g.days?.length ? ' · ' + g.days.map((d) => WD[d]).join(' ') : '', g.time ? ' · ' + g.time : ''),
        el('div', { class: 'gl-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'התקדמות', style: 'block-size:10px' },
          el('span', { style: `inline-size:${pct}%` }))),
      ...g.processes.map((pr, i) => processCard(g, pr, i)),
      el('div', { style: ROW },
        el('button', { class: 'btn small', type: 'button', onclick: async () => {
          const title = prompt('שם התהליך החדש:'); if (!title?.trim()) return;
          await api(`/api/goals/${g.id}/processes`, { body: { title } }); await load();
        } }, '+ תהליך'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => editGoal(g) }, '✎ עריכת המטרה'),
        g.status === 'active' ? el('button', { class: 'btn small ghost', type: 'button', onclick: () => askDone(g) }, '🏁 השגתי') : el('button', { class: 'btn small ghost', type: 'button', onclick: async () => { await api(`/api/goals/${g.id}`, { method: 'PUT', body: { status: 'active' } }); await load(); } }, 'להחזיר לפעילות'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: async () => { if (!confirm(`למחוק את "${g.title}"?`)) return; await api(`/api/goals/${g.id}`, { method: 'DELETE' }); openGoal = null; await load(); toast('המטרה נמחקה'); } }, 'מחיקה'))));
  }
  function processCard(g, pr, i) {
    const done = pr.steps.filter((s) => s.done).length;
    const add = el('input', { type: 'text', dir: 'auto', placeholder: '+ צעד חדש (Enter)', 'aria-label': 'צעד חדש בתהליך ' + pr.title, style: 'font:inherit;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);inline-size:100%' });
    add.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && add.value.trim()) { await api(`/api/goals/processes/${pr.id}/steps`, { body: { text: add.value.trim() } }); await load(); } });
    return el('section', { class: 'card gl-process' + (pr.steps.length && done === pr.steps.length ? ' done' : '') },
      el('div', { style: 'display:flex;align-items:center;gap:8px' },
        el('b', { dir: 'auto', style: 'flex:1' }, `${i + 1}. ${pr.title}`), el('small', { class: 'muted' }, `${done}/${pr.steps.length}`),
        el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'שינוי שם התהליך', title: 'שינוי שם', onclick: async () => { const t = prompt('שם התהליך:', pr.title); if (t?.trim()) { await api(`/api/goals/processes/${pr.id}`, { method: 'PUT', body: { title: t } }); await load(); } } }, '✎'),
        el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'מחיקת התהליך', title: 'מחיקה', onclick: async () => { if (confirm(`למחוק את התהליך "${pr.title}" ואת הצעדים שבו?`)) { await api(`/api/goals/processes/${pr.id}`, { method: 'DELETE' }); await load(); } } }, '🗑')),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:6px' }, pr.steps.map((s) => {
        const row = stepRow(s);
        row.append(el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'מחיקת הצעד', title: 'מחיקה', onclick: async () => { await api(`/api/goals/steps/${s.id}`, { method: 'DELETE' }); await load(); } }, '✕'));
        return row;
      })),
      add);
  }
  function editGoal(g) {
    const title = el('input', { type: 'text', value: g.title, dir: 'auto', style: 'font:inherit;padding:8px 12px' });
    const why = el('textarea', { rows: 3, dir: 'auto', style: 'font:inherit;padding:8px 12px' }, g.why);
    const due = el('input', { type: 'date', value: g.due || '' });
    let kind = g.kind, days = g.days ? [...g.days] : [];
    const kinds = chips(Object.entries(KIND).map(([k, n]) => [k, n]), () => kind, (v) => { kind = v; });
    const daysRow = dayPicker(() => days, (v) => { days = v; });
    const time = el('input', { type: 'time', value: g.time || '' });
    H.modal(el('h2', {}, 'עריכת המטרה'),
      el('div', { style: 'display:grid;gap:10px' }, field('המטרה', title), field('למה זה חשוב לי', why), field('אורך', kinds), field('תאריך יעד (לא חובה)', due), field('הימים', daysRow), field('שעה (לא חובה)', time),
        el('div', { style: ROW }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          await api(`/api/goals/${g.id}`, { method: 'PUT', body: { title: title.value, why: why.value, kind, due: due.value || null, days: days.length ? days : null, time: time.value || null } });
          H.closeModal(); await load();
        } }, 'שמירה'))));
  }

  /* ---------- small pieces ---------- */
  const field = (label, input) => el('label', { style: 'display:grid;gap:4px' }, el('span', { class: 'small muted' }, label), input);
  function chips(options, get, set) {
    const box = el('div', { role: 'radiogroup', style: ROW });
    const draw = () => box.replaceChildren(...options.map(([v, n, hint]) => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(get() === v),
      style: get() === v ? 'background:var(--primary);border-color:var(--primary);color:var(--chalk-raised,#f7f6f0)' : null, onclick: () => { set(v); draw(); } }, n, hint ? el('small', { style: 'opacity:.75' }, ' · ' + hint) : null)));
    draw();
    return box;
  }
  function dayPicker(get, set) {
    const box = el('div', { role: 'group', 'aria-label': 'הימים', style: ROW });
    const draw = () => box.replaceChildren(...WD.map((n, d) => {
      const rest = D.rest === d, on = get().includes(d);
      return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), disabled: rest, title: rest ? 'יום המנוחה' : WD_NAME[d],
        style: on ? 'background:var(--primary);border-color:var(--primary);color:var(--chalk-raised,#f7f6f0)' : rest ? 'opacity:.5' : null,
        onclick: () => { const v = get(); set(on ? v.filter((x) => x !== d) : [...v, d].sort()); draw(); } }, rest ? n + ' 🌿' : n);
    }));
    draw();
    return box;
  }

  /* ---------- a new goal, in five steps ---------- */
  async function wizard(seed = {}) {
    const G = { title: seed.title || '', why: seed.why || '', kind: seed.kind || 'regular', due: '', processes: [], template: seed.template || null, days: [], time: '' };
    let step = 1;
    const body = el('div', { style: 'display:grid;gap:12px' });
    const head = el('h2', {});
    const dots = el('div', { 'aria-hidden': 'true', style: 'display:flex;gap:6px' });
    const nav = el('div', { style: ROW });
    const titles = ['', 'מה ולמה', 'כמה זמן', 'התהליכים', 'ההתחלה', 'הקצב'];
    async function show() {
      head.textContent = `מטרה חדשה · ${titles[step]}`;
      dots.replaceChildren(...[1, 2, 3, 4, 5].map((k) => el('span', { style: `inline-size:24px;block-size:6px;border-radius:9px;background:${k <= step ? 'var(--primary)' : 'var(--line)'}` })));
      const back = step > 1 ? el('button', { class: 'btn ghost', type: 'button', onclick: () => { step--; show(); } }, '→ חזרה') : null;
      if (step === 1) {
        const t = el('textarea', { rows: 2, dir: 'auto', placeholder: 'למשל: לרוץ 5 ק"מ עד הפסח', 'aria-label': 'המטרה', style: 'font:inherit;padding:10px 12px;inline-size:100%' }, G.title);
        const w = el('textarea', { rows: 3, dir: 'auto', placeholder: 'משפט אחד: למה זה חשוב לי?', 'aria-label': 'למה זה חשוב', style: 'font:inherit;padding:10px 12px;inline-size:100%' }, G.why);
        t.oninput = () => { G.title = t.value; }; w.oninput = () => { G.why = w.value; };
        body.replaceChildren(
          field('המטרה', el('div', { style: 'display:flex;gap:6px;align-items:start' }, t, mic(t))),
          field('למה זה חשוב לי', el('div', { style: 'display:flex;gap:6px;align-items:start' }, w, mic(w))),
          !Rec ? el('small', { class: 'muted' }, 'בדפדפן הזה אין הקלטה. אפשר לכתוב.') : el('small', { class: 'muted' }, '🎤 מקליטים במקום לכתוב: הדפדפן הופך את הדיבור לטקסט, במכשיר עצמו.'));
        nav.replaceChildren(el('button', { class: 'btn primary', type: 'button', onclick: () => { if (!G.title.trim()) return toast('כתבו את המטרה'); step = 2; show(); } }, 'הלאה ←'));
        setTimeout(() => t.focus(), 30);
      } else if (step === 2) {
        const due = el('input', { type: 'date', value: G.due, onchange: (e) => { G.due = e.target.value; } });
        body.replaceChildren(field('אורך המטרה', chips(Object.entries(KIND).map(([k, n]) => [k, n, KIND_HINT[k]]), () => G.kind, (v) => { G.kind = v; })), field('תאריך יעד (לא חובה)', due));
        nav.replaceChildren(back, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          // the processes: the template that fits (or the chosen one), unless already chosen
          if (!G.processes.length) {
            const t = await api(G.template ? `/api/goals/template?id=${G.template}` : `/api/goals/template?text=${encodeURIComponent(G.title + ' ' + G.why)}`);
            G.processes = t.template.processes.map((p) => ({ title: p.title, steps: [...p.steps] })); G.template = t.template.id; G.templates = t.all; G.method = 'template';
          }
          step = 3; show();
        } }, 'הלאה ←'));
      } else if (step === 3) {
        const list = el('div', { style: 'display:grid;gap:10px' });
        const drawList = () => list.replaceChildren(...G.processes.map((p, i) => el('div', { class: 'card', style: 'padding:10px 12px;display:grid;gap:6px' },
          el('div', { style: 'display:flex;gap:6px' },
            el('input', { type: 'text', value: p.title, dir: 'auto', 'aria-label': 'שם התהליך', style: 'flex:1;font:inherit;font-weight:600;padding:6px 10px', oninput: (e) => { p.title = e.target.value; } }),
            el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'הסרת התהליך', onclick: () => { G.processes.splice(i, 1); drawList(); } }, '✕')),
          el('textarea', { rows: Math.max(2, p.steps.length), dir: 'auto', 'aria-label': 'הצעדים, שורה לכל צעד', style: 'font:inherit;padding:6px 10px', oninput: (e) => { p.steps = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); } }, p.steps.join('\n')))),
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => { G.processes.push({ title: 'תהליך חדש', steps: [] }); drawList(); } }, '+ תהליך'));
        drawList();
        const pick = el('select', { 'aria-label': 'תבנית', style: 'font:inherit;padding:6px 10px', onchange: async (e) => {
          const t = await api(`/api/goals/template?id=${e.target.value}`); G.processes = t.template.processes.map((p) => ({ title: p.title, steps: [...p.steps] })); G.template = t.template.id; G.method = 'template'; drawList(); note.replaceChildren();
        } }, (G.templates || []).map((t) => el('option', { value: t.id, selected: t.id === G.template }, t.name)), el('option', { value: 'generic', selected: G.template === 'generic' }, 'כללית'));
        const note = el('div');
        if (G.method === 'ai') note.append(el('p', { class: 'ai-note' }, '✨ הוצע בעזרת העוזר החכם'));
        body.replaceChildren(
          el('p', { class: 'muted', style: 'margin:0' }, 'המטרה מחולקת לתהליכים, ולכל תהליך צעדים קטנים (שורה לכל צעד). אפשר לשנות הכול.'),
          el('div', { class: 'ai-pair' }, field('תבנית', pick), sparkle('✨ פירוק חכם', async () => {
            const r = await api('/api/goals/ai/plan', { body: { title: G.title, why: G.why, kind: G.kind } });
            G.processes = r.processes; G.method = 'ai'; drawList(); note.replaceChildren(el('p', { class: 'ai-note' }, '✨ הוצע בעזרת העוזר החכם'));
          })), note, list);
        nav.replaceChildren(back, el('button', { class: 'btn primary', type: 'button', onclick: () => { G.processes = G.processes.filter((p) => p.title.trim()); if (!G.processes.length) return toast('צריך לפחות תהליך אחד'); step = 4; show(); } }, 'הלאה ←'));
      } else if (step === 4) {
        const first = G.processes[0];
        while (first.steps.length < 3) first.steps.push('');
        const inputs = first.steps.slice(0, 3).map((s, i) => el('input', { type: 'text', value: s, dir: 'auto', placeholder: `צעד ${i + 1}`, 'aria-label': `צעד ${i + 1}`, style: 'font:inherit;padding:8px 12px', oninput: (e) => { first.steps[i] = e.target.value; } }));
        body.replaceChildren(el('p', { class: 'muted', style: 'margin:0' }, `שלושת הצעדים הראשונים בתהליך "${first.title}". קטנים מספיק כדי להתחיל עוד היום.`), ...inputs);
        nav.replaceChildren(back, el('button', { class: 'btn primary', type: 'button', onclick: () => { first.steps = first.steps.map((x) => x.trim()).filter(Boolean); step = 5; show(); } }, 'הלאה ←'));
      } else if (step === 5) {
        const time = el('input', { type: 'time', value: G.time, onchange: (e) => { G.time = e.target.value; } });
        body.replaceChildren(
          field('באילו ימים עובדים על המטרה (בלי בחירה: כל יום חוץ מיום המנוחה)', dayPicker(() => G.days, (v) => { G.days = v; })),
          field('באיזו שעה (לא חובה)', time),
          el('p', { class: 'small muted', style: 'margin:0' }, `יום המנוחה: ${REST_NAME(D.rest)}. הוא לא שובר רצף.`));
        nav.replaceChildren(back, el('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const r = await api('/api/goals', { body: { title: G.title.trim(), why: G.why.trim(), kind: G.kind, due: G.due || null, days: G.days.length ? G.days : null, time: G.time || null, template: G.method === 'template' ? G.template : null, processes: G.processes } });
            H.closeModal(); openGoal = r.id; await load(); toast('יתד ראשונה בקרקע ⛺');
          } catch (err) { toast(err.message || 'לא נשמר'); e.currentTarget.disabled = false; }
        } }, 'יוצאים לדרך ⛺'));
      }
    }
    H.modal(head, dots, body, nav);
    show();
  }

  /* ---------- נתקעתי: a step too big becomes its 5-minute version ---------- */
  async function stuck(s) {
    const t = await api('/api/goals/template?id=generic').catch(() => ({ stuck: { prompts: ['מה הדבר הראשון שאפשר לעשות בחמש דקות?'], starters: [] } }));
    const g = goalOf(s.goal);
    const q = t.stuck.prompts[Math.floor(Math.random() * t.stuck.prompts.length)];
    const input = el('input', { type: 'text', dir: 'auto', placeholder: 'הגרסה של חמש דקות…', 'aria-label': 'הגרסה הקטנה של הצעד', style: 'font:inherit;padding:8px 12px' });
    const ideas = el('div', { style: ROW });
    const save = async () => {
      if (!input.value.trim()) return input.focus();
      const pid = g.processes.find((p) => p.steps.some((x) => x.id === s.id))?.id;
      await api(`/api/goals/processes/${pid}/steps`, { body: { text: input.value.trim(), small: true, before: s.id } });
      H.closeModal(); await load(); toast('⏱ צעד של חמש דקות נוסף להיום');
    };
    H.modal(el('h2', {}, 'נתקעתי'),
      el('p', { class: 'muted', style: 'margin:0' }, 'הצעד: ', el('b', { dir: 'auto' }, s.text)),
      el('p', { style: 'margin:8px 0 4px' }, q),
      el('div', { style: ROW }, t.stuck.starters.map((st) => el('button', { class: 'chip', type: 'button', onclick: () => { input.value = st; input.focus(); } }, st + '…'))),
      input,
      el('div', { class: 'ai-pair' }, el('button', { class: 'btn primary', type: 'button', onclick: save }, 'להוסיף כצעד ראשון'),
        sparkle('✨ הצעות', async () => {
          const r = await api('/api/goals/ai/stuck', { body: { step: s.text, goal: g?.title || '' } });
          ideas.replaceChildren(...r.steps.map((x) => el('button', { class: 'chip', type: 'button', onclick: () => { input.value = x; input.focus(); } }, x)), el('p', { class: 'ai-note', style: 'flex-basis:100%' }, '✨ הוצע בעזרת העוזר החכם'));
        })),
      ideas);
    setTimeout(() => input.focus(), 30);
  }

  /* ---------- the weekly minute ---------- */
  function weeklyReview() {
    const a = (ph) => el('textarea', { rows: 2, dir: 'auto', placeholder: ph, style: 'font:inherit;padding:8px 12px' });
    const good = a('מה הלך טוב השבוע?'), stuckT = a('מה נתקע?'), change = a('מה משנים בשבוע הבא?');
    H.modal(el('h2', {}, 'דקה לסיכום השבוע'),
      el('p', { class: 'muted', style: 'margin:0' }, `השבוע: ${D.week.done} מתוך ${D.week.of} ימים עם צעד${D.streak ? ` · רצף ${D.streak}` : ''}.`),
      field('מה הלך טוב', good), field('מה נתקע', stuckT), field('מה משנים', change),
      el('div', { style: ROW }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        await api('/api/goals/review', { body: { good: good.value, stuck: stuckT.value, change: change.value } }); H.closeModal(); await load(); toast('נשמר. שבוע טוב 🌿');
      } }, 'שמירה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'אחר כך')));
  }

  /* ---------- the badges: earned in colour, the rest with how to earn them, the secret ones a silhouette ---------- */
  function badgesGallery() {
    const got = new Map(D.badges.earned.map((b) => [b.id, b.at]));
    const GROUPS = [['start', 'התחלה ועקביות'], ['progress', 'התקדמות'], ['tools', 'הכלים באוהל'], ['family', 'משפחה וחברים']];
    const patch = (b) => {
      const has = got.has(b.id), hidden = b.secret && !has;
      const how = hidden ? 'badge סודי' : has ? `${b.how} · קיבלת ב־${new Date(got.get(b.id)).toLocaleDateString('he-IL')}` : b.soon ? `${b.how} (בקרוב)` : b.how;
      return el('button', { type: 'button', class: 'gl-badge' + (has ? ' on' : '') + (hidden ? ' secret' : '') + (b.soon ? ' soon' : ''), title: how, 'aria-label': (hidden ? 'badge סודי' : b.name) + ': ' + how,
        style: `display:grid;gap:4px;justify-items:center;padding:10px;border-radius:16px;border:1px dashed var(--line-strong);background:${has ? 'color-mix(in srgb, var(--primary) 14%, var(--card))' : 'var(--card)'};font:inherit;color:inherit;cursor:help;${has ? '' : 'opacity:.6'}`,
        onclick: (e) => { const n = e.currentTarget.querySelector('.how'); n.hidden = !n.hidden; } },
        el('span', { 'aria-hidden': 'true', style: 'font-size:1.8rem' + (hidden ? ';filter:brightness(0);opacity:.4' : '') }, hidden ? '🏅' : has ? '🏅' : '○'),
        el('b', { style: 'font-size:.85rem;text-align:center' }, hidden ? '???' : b.name),
        el('small', { class: 'how muted', hidden: true, style: 'font-size:.75rem;text-align:center' }, how));
    };
    H.modal(el('h2', {}, `🏅 badges · ${got.size}`),
      el('p', { class: 'small muted', style: 'margin:0' }, 'לחיצה על badge מראה איך משיגים אותו. הסודיים נשארים צללית עד שמקבלים אותם.'),
      // (a group with nothing to earn yet – the family's, until the shared goals – is not shown)
      ...GROUPS.filter(([k]) => D.catalog.some((b) => b.group === k)).map(([k, n]) => el('section', {}, el('h3', { style: 'margin:10px 0 6px' }, n),
        el('div', { style: 'display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(110px,1fr))' }, D.catalog.filter((b) => b.group === k).map(patch)))));
  }

  /* ---------- the rest day ---------- */
  function restPicker() {
    const gp = H.prefs('goals', {});
    H.modal(el('h2', {}, 'יום המנוחה שלי'),
      el('p', { class: 'muted', style: 'margin:0' }, 'יום המנוחה לא שובר רצף, ואין בו צעדים. ברירת המחדל לפי הדת שבהגדרות.'),
      el('div', { style: 'display:grid;gap:6px' },
        el('button', { class: 'btn', type: 'button', onclick: () => pick(undefined) }, 'לפי ההגדרות (הדת)'),
        ...[6, 5, 0].map((d) => el('button', { class: 'btn ghost', type: 'button', onclick: () => pick(d) }, 'יום ' + WD_NAME[d])),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => pick(null) }, 'בלי יום מנוחה')));
    async function pick(v) {
      if (v === undefined) delete gp.rest; else gp.rest = v;
      H.savePrefs('goals');
      // the server reckons the streaks by it: sent now, not in a moment
      await api('/api/prefs/goals', { method: 'PUT', body: { data: { ...gp }, at: Date.now() } }).catch(() => {});
      H.closeModal(); await load();
    }
  }

  try { await load(); } catch (e) { root.replaceChildren(el('p', {}, 'המטרות לא נטענו. נסו שוב בעוד רגע.')); }
})();
