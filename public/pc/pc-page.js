// /pc/ – this page's script, moved out of the HTML so the site can forbid inline scripts (CSP script-src 'self', security review 2026-11-15 M2).

H.header('סידור המחשב', '💻');
H.requireLogin().then(() => H.gate('/pc/'));   // a beta app: only for whom the back door opened it
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.getElementById('rules').textContent); H.toast('ההוראות הועתקו ✓'); }
  catch (_) { H.toast('סמני את הטקסט והעתיקי ידנית'); }
});
