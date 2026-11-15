// /overlay/ – this page's script, moved out of the HTML so the site can forbid inline scripts (CSP script-src 'self', security review 2026-11-15 M2).

(async () => {
  const desk = window.helperDesktop;   // provided by the desktop program (preload); absent in a normal browser
  const r = await H.me();
  if (!r.user) {
    const box = H.el('div', { class: 'signin' }, 'צריך להתחבר פעם אחת: לחצו על סמל האוהל ליד השעון ← "התחברות".');
    document.body.append(box);
    desk?.setInteractive(true);
    return;
  }
  const d = await H.loadDaemon();
  // He lives in his tent on the home page; he comes to the desktop only after he was asked along ("come with me to the computer").
  // Until then (and after he is sent home) the program checks now and then whether he was asked.
  const prefs = H.prefs('daemon', H.DAEMON_DEFAULTS, 'helper.daemon.prefs');
  async function waitForInvite() {
    for (;;) {
      try {
        const all = await H.api('/api/prefs', { noRedirect: true });
        if (all?.prefs?.daemon?.data) Object.assign(prefs, all.prefs.daemon.data);
      } catch (_) { /* offline: try again later */ }
      if (prefs.follow) break;
      await new Promise((r) => setTimeout(r, 20000));
    }
    // a fresh page is the simplest clean start for the companion
    if (!(await d.mount(null, { overlay: true }))) setTimeout(waitForInvite, 20000);
  }
  window.addEventListener('helper:daemon-home', () => location.reload());
  if (prefs.follow) await d.mount(null, { overlay: true }); else waitForInvite();
  // Clicks pass through the window to the desktop, except over the companion, its balloon and its panel.
  let interactive = null;
  const set = (on) => { if (on !== interactive) { interactive = on; desk?.setInteractive(on); } };
  window.addEventListener('mousemove', (e) => {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    // while he is held, the window keeps the mouse (or the release would be lost and he'd stay stuck)
    set(!!(H.daemon?.holding || t?.closest('.dm-stage, .dm-balloon, .dm-panel:not([hidden]), .dm-tab, .toast')));
  }, { passive: true });
  set(false);
})();
