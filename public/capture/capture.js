/* "שיתוף אל האוהל": the page the phone's share sheet opens (the master adds share_target to manifest.json, GET with
   title, text and url). What came is shown to check, and kept as a note: in the research assistant's inbox, or straight
   into one of the researches (the research assistant, docs/vision/research.md). Files come later. */
(async () => {
  const { el, api, toast } = H;
  const qs = new URLSearchParams(location.search);
  await H.requireLogin();
  H.header('שמירה לאוהל');
  const root = document.querySelector('main');
  // phones put the link into "text" as often as into "url": take the first link from either
  const rawText = (qs.get('text') || '').trim();
  const link = (qs.get('url') || '').trim() || (rawText.match(/https?:\/\/\S+/) || [''])[0];
  const text = rawText.replace(link, '').trim();
  const title = el('input', { type: 'text', dir: 'auto', value: (qs.get('title') || '').trim().slice(0, 200), placeholder: 'כותרת (תיכתב לבד אם תשאירו ריק)', 'aria-label': 'כותרת' });
  const body = el('textarea', { rows: 6, dir: 'auto', 'aria-label': 'מה נשמר' });
  body.value = text;
  let researches = [];
  try { researches = (await api('/api/research/list')).researches; } catch (_) { /* the inbox still works */ }
  const where = el('select', { 'aria-label': 'לאן' }, el('option', { value: '' }, '📥 לתיבת הנכנסים של עוזר המחקר'), researches.map((r) => el('option', { value: r.id }, '🔬 ' + r.title)));
  const save = el('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!title.value.trim() && !body.value.trim() && !link) return toast('אין מה לשמור');
    save.disabled = true;
    try {
      const n = (await api('/api/notes', { body: { title: title.value.trim(), body: body.value.trim() || link, source: link ? { url: link, title: title.value.trim() || link } : null, inbox: !where.value } })).note;
      if (where.value) await api(`/api/research/r/${where.value}/notes`, { body: { noteId: n.id } });
      root.replaceChildren(el('section', { class: 'card cap-done', style: 'max-inline-size:560px;margin:24px auto;padding:20px;display:grid;gap:10px;text-align:center' },
        el('b', { style: 'font-size:1.2rem' }, '✓ נשמר'), el('p', { class: 'muted', style: 'margin:0' }, where.value ? 'הפתק נמצא במחקר.' : 'הפתק מחכה בתיבת הנכנסים, למיון.'),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center' },
          el('a', { class: 'btn primary', href: where.value ? `/tools/research/?r=${where.value}` : '/tools/research/' }, 'לעוזר המחקר'),
          el('a', { class: 'btn ghost', href: `/tools/notes/?open=${n.id}` }, 'לפתק'))));
    } catch (e) { toast(e.message || 'לא נשמר'); save.disabled = false; }
  } }, 'שמירה');
  root.append(el('section', { class: 'card cap', style: 'max-inline-size:560px;margin:16px auto;padding:18px;display:grid;gap:10px' },
    el('h1', { style: 'margin:0;font-size:1.4rem' }, '📥 שמירה לאוהל'),
    el('label', { class: 'field' }, el('span', {}, 'כותרת'), title),
    el('label', { class: 'field' }, el('span', {}, 'מה נשמר'), body),
    link ? el('p', { class: 'small', style: 'margin:0', dir: 'auto' }, '🔗 ', el('a', { href: link, target: '_blank', rel: 'noopener' }, link)) : null,
    el('label', { class: 'field' }, el('span', {}, 'לאן'), where),
    el('div', {}, save)));
})();
