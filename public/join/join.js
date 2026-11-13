/* הזמנה לאוהל – a personal link the owner made in the back door (server/join.ts). The key is after the # (never sent in
   an address, so it stays out of logs). The page says who it was made for and offers "כניסה עם Google": the server keeps
   the key on this device for twenty minutes, and the sign-in that comes back admits a new member once, into a household
   of their own. Nothing of the family is shown here or opens to them. The look is design's (.jn-card, .jn-who, .jn-fine). */
(() => {
  const { el, toast } = H;
  const root = document.querySelector('main');
  const key = location.hash.slice(1).split(/[?&]/)[0];
  // the key leaves the address bar at once (a screenshot or a shared screen does not carry it); it stays in this page
  if (key) history.replaceState(null, '', location.pathname);
  async function call(path) {
    const r = await fetch('/api/join/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'error'); e.code = d.error; throw e; }
    return d;
  }
  const card = (...body) => root.replaceChildren(el('section', { class: 'card jn-card' }, el('h1', {}, 'הזמנה לאוהל'), ...body));
  const SAY = {
    redeemed: 'כבר נכנסו לאוהל בהזמנה הזו. כל הזמנה עובדת פעם אחת.',
    expired: 'ההזמנה הזו פגה. בקשו מבעל האוהל הזמנה חדשה.',
    cancelled: 'ההזמנה הזו בוטלה.',
    unknown: 'הקישור לא תקין. בקשו מבעל האוהל לשלוח אותו שוב.',
  };

  async function draw() {
    if (!key) return card(el('p', {}, 'הקישור לא שלם. בקשו מבעל האוהל לשלוח אותו שוב.'));
    let d;
    try { d = await call('check'); }
    catch (e) { return card(el('p', {}, e.code === 'too_many_tries' ? 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' : 'משהו השתבש. נסו שוב בעוד רגע.')); }
    if (d.member) return card(el('p', {}, 'אתם כבר באוהל.'), el('a', { class: 'btn primary', href: '/' }, 'לאוהל'));
    if (d.status !== 'sent') return card(el('p', {}, SAY[d.status] || SAY.unknown));
    const go = el('button', { class: 'btn primary', type: 'button', onclick: () => start(go) }, 'כניסה עם Google');
    card(
      el('p', { class: 'jn-who' }, `שלום ${d.name}, הוזמנת לאוהל: מקום אחד לכלים של היום־יום – קניות, מתכונים, חדשות, מוזיקה ועוד, עם עוזר חכם.`),
      d.email ? el('p', {}, 'ההזמנה לחשבון ', el('bdi', { dir: 'ltr' }, d.email), '. היכנסו עם החשבון הזה.') : null,
      go,
      el('p', { class: 'muted small jn-fine' }, 'ההזמנה אישית ועובדת פעם אחת. תקבלו מקום משלכם באוהל, עם קרדיט התחלתי לעוזר החכם. שום דבר של משפחה אחרת לא נפתח בפניכם.'));
  }
  async function start(btn) {
    btn.disabled = true;
    try { location.href = (await call('start')).url; }
    catch (e) { btn.disabled = false; toast(e.code === 'closed' ? 'ההזמנה כבר לא פתוחה.' : 'משהו השתבש. נסו שוב.'); if (e.code === 'closed') draw(); }
  }
  draw();
})();
