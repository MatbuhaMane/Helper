/* The music player: docked in the app's menu (the top bar on a PC, the tab bar on a phone), can be pulled out to
   float anywhere and folded to a small record, and goes back to the menu with one press.

   Two sources:
   - Spotify, the way Waze does it: the music plays in the person's own Spotify app (so on a phone it keeps playing
     when they switch apps), and this is its remote: what's playing, play/pause, skip, volume, which device, search.
   - YouTube: plays here, in YouTube's own player (which must stay visible, so a small video card shows while it plays).
     On a PC it keeps playing with the window minimised. On a phone YouTube stops when the app is left (YouTube's rule).

   So the music carries on between the hub's screens, the engine (state + YouTube player) lives in the page where it
   started; when YouTube is playing and the person opens another screen, that screen loads inside this page (a
   full-size frame) instead of replacing it. The frame's own copy of this script finds the engine above it and only
   draws the controls. */
(() => {
  const { el, api, toast } = H;
  const P = H.prefs('music', { source: 'spotify', mode: 'menu', folded: false, recent: [] });
  const save = () => H.savePrefs('music');
  const parentEngine = (() => { try { return window.parent !== window && window.parent.H?.musicEngine; } catch (_) { return null; } })();
  const E = parentEngine || createEngine();
  if (!parentEngine) H.musicEngine = E;

  /* ===================================== the engine ===================================== */
  function createEngine() {
    const listeners = new Set();
    const st = { source: P.source, playing: false, title: '', artist: '', art: '', progress: 0, duration: 0, at: Date.now(), device: null, volume: 70,
      spotify: { configured: false, connected: false, active: false }, yt: { id: '', queue: [], index: -1 }, error: '' };
    const emit = () => listeners.forEach((f) => { try { f(st); } catch (_) { listeners.delete(f); } });
    let pollT = 0;

    async function status() {
      try {
        const s = await api('/api/music/status', { noRedirect: true });
        st.spotify.configured = s.spotify.configured; st.spotify.connected = s.spotify.connected; st.ytSearch = s.youtube.search;
      } catch (_) { /* offline */ }
      emit();
      if (st.spotify.connected) poll();
    }

    /* ---- Spotify, as a remote ---- */
    async function poll() {
      clearTimeout(pollT);
      if (!st.spotify.connected) return;
      if (st.source === 'spotify' || !st.yt.id) {
        try {
          const s = await api('/api/music/spotify/state', { noRedirect: true });
          st.spotify.active = !!s.active;
          if (st.source === 'spotify' || (!st.yt.id && s.active)) {
            if (!st.yt.id && s.active && st.source !== 'spotify') st.source = 'spotify';
            if (st.source === 'spotify') {
              st.playing = !!s.playing; st.progress = s.progress || 0; st.at = Date.now(); st.device = s.device;
              st.duration = s.track?.duration || 0; st.title = s.track?.title || ''; st.artist = s.track?.artist || ''; st.art = s.track?.art || '';
              st.uri = s.track?.uri || '';
              if (s.device?.volume != null) st.volume = s.device.volume;
            }
          }
          st.error = '';
        } catch (e) {
          if (/not_connected/.test(e.message)) st.spotify.connected = false;
        }
        emit();
      }
      // often while it plays and someone is looking, rarely otherwise
      const looking = document.visibilityState === 'visible';
      pollT = setTimeout(poll, !looking ? 30000 : st.playing && st.source === 'spotify' ? 5000 : 12000);
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });

    async function spCmd(action, extra = {}) {
      try {
        await api('/api/music/spotify/cmd', { body: { action, ...extra }, noRedirect: true });
      } catch (e) {
        if (/no_active_device/.test(e.message)) {
          // No Spotify playing anywhere: ask where to play (never wake a TV or a speaker on our own), or to open the Spotify app.
          const d = await api('/api/music/spotify/devices', { noRedirect: true }).catch(() => ({ devices: [] }));
          if (action === 'pause') { st.playing = false; emit(); return false; }
          st.pending = { action, extra };
          st.error = d.devices.length ? 'pick_device' : 'no_device';
          emit(); return false;
        } else if (/premium/.test(e.message)) { st.error = 'premium'; emit(); return false; }
        else { toast('ספוטיפיי לא ענה, נסו שוב'); return false; }
      }
      setTimeout(poll, 450);
      return true;
    }

    /* ---- YouTube, played here ---- */
    let yt = null, ytReady = null, ytTick = 0;
    function loadYT() {
      ytReady ||= new Promise((resolve) => {
        const host = el('div', { class: 'mu-video', 'aria-label': 'נגן YouTube' },
          el('div', { class: 'mu-video-bar' }, el('b', {}, 'YouTube'), el('span', { class: 'spacer' }),
            el('button', { class: 'mini', type: 'button', title: 'להעביר לצד השני', 'aria-label': 'להעביר את הווידאו לצד השני', onclick: () => host.classList.toggle('other') }, '⇆'),
            el('button', { class: 'mini', type: 'button', title: 'לעצור ולסגור', 'aria-label': 'לעצור ולסגור את הווידאו', onclick: () => closeYT() }, '✕')),
          el('div', { id: 'mu-yt' }));
        document.body.append(host);
        window.onYouTubeIframeAPIReady = () => {
          yt = new YT.Player('mu-yt', {
            width: 224, height: 126, playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: {
              onReady: () => resolve(yt),
              onStateChange: (e) => {
                if (e.data === YT.PlayerState.ENDED) next();
                st.playing = e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING;
                syncYT(); emit();
              },
              onError: () => { toast('הסרטון הזה לא מתנגן מחוץ ליוטיוב, עוברים לבא'); next(); },
            },
          });
        };
        document.head.append(el('script', { src: 'https://www.youtube.com/iframe_api' }));
      });
      return ytReady;
    }
    function syncYT() {
      if (!yt?.getCurrentTime) return;
      st.progress = (yt.getCurrentTime() || 0) * 1000; st.duration = (yt.getDuration() || 0) * 1000; st.at = Date.now();
      st.volume = yt.getVolume?.() ?? st.volume;
    }
    async function playYT(video, queue) {
      st.source = 'youtube'; P.source = 'youtube'; save();
      if (queue) { st.yt.queue = queue; st.yt.index = Math.max(0, queue.findIndex((v) => v.id === video.id)); }
      else { st.yt.queue = [video]; st.yt.index = 0; }
      st.yt.id = video.id; st.title = video.title; st.artist = video.channel || ''; st.art = video.art || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
      remember({ kind: 'yt', ...video });
      if (st.spotify.active && st.playing === true) spCmd('pause');   // one music at a time
      await loadYT();
      document.body.classList.add('mu-has-video');
      yt.loadVideoById(video.id);
      media();
      clearInterval(ytTick); ytTick = setInterval(() => { if (st.source === 'youtube') { syncYT(); emit(); } }, 1000);
      emit();
    }
    function closeYT() {
      try { yt?.stopVideo(); } catch (_) { /* ignore */ }
      st.yt = { id: '', queue: [], index: -1 }; st.playing = false; st.title = ''; st.artist = ''; st.art = '';
      document.body.classList.remove('mu-has-video');
      clearInterval(ytTick);
      st.source = 'spotify'; P.source = 'spotify'; save();
      emit(); poll();
    }
    function next() { if (st.source === 'spotify') return spCmd('next'); const q = st.yt.queue; if (st.yt.index < q.length - 1) playYT(q[st.yt.index + 1], q); }
    function prev() {
      if (st.source === 'spotify') return spCmd('prev');
      if (yt && yt.getCurrentTime() > 4) { yt.seekTo(0, true); return; }
      const q = st.yt.queue; if (st.yt.index > 0) playYT(q[st.yt.index - 1], q);
    }
    function toggle() {
      if (st.source === 'youtube') { if (!yt) return; st.playing ? yt.pauseVideo() : yt.playVideo(); return; }
      st.playing = !st.playing; emit();      // answer at once; the next poll corrects it
      spCmd(st.playing ? 'play' : 'pause');
    }
    function seek(ms) {
      st.progress = ms; st.at = Date.now(); emit();
      if (st.source === 'youtube') yt?.seekTo(ms / 1000, true); else spCmd('seek', { position: ms });
    }
    let volT;
    function volume(v) {
      st.volume = v; emit();
      if (st.source === 'youtube') yt?.setVolume(v);
      else { clearTimeout(volT); volT = setTimeout(() => spCmd('volume', { volume: v }), 250); }
    }
    function playSpotify(item, context) {
      st.source = 'spotify'; P.source = 'spotify'; save();
      if (st.yt.id) { try { yt.pauseVideo(); } catch (_) { /* ignore */ } }
      remember({ kind: 'sp', uri: item.uri, title: item.title, artist: item.artist || item.by || '', art: item.art });
      st.title = item.title; st.artist = item.artist || item.by || ''; st.art = item.art; st.playing = true; emit();
      return item.uri.startsWith('spotify:playlist') ? spCmd('play', { context: item.uri }) : spCmd('play', context ? { context, uri: item.uri } : { uri: item.uri });
    }
    function remember(x) {
      P.recent = [x, ...(P.recent || []).filter((r) => (r.uri || r.id) !== (x.uri || x.id))].slice(0, 12); save();
    }
    /** The phone's lock screen and the keyboard's media keys (for YouTube; Spotify's app has its own). */
    function media() {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: st.title, artist: st.artist, artwork: st.art ? [{ src: st.art, sizes: '320x180' }] : [] });
      navigator.mediaSession.setActionHandler('play', () => yt?.playVideo());
      navigator.mediaSession.setActionHandler('pause', () => yt?.pauseVideo());
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
    }
    status();
    return { st, on: (f) => { listeners.add(f); f(st); }, off: (f) => listeners.delete(f), status, poll, spCmd, playYT, closeYT, playSpotify, next, prev, toggle, seek, volume,
      setSource: (s) => { st.source = s; P.source = s; save(); if (s === 'spotify') poll(); emit(); } };
  }

  /* ===================================== the controls ===================================== */
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const now = (st) => Math.min(st.duration || Infinity, st.progress + (st.playing && st.source === 'spotify' ? Date.now() - st.at : 0));
  const ICON = {
    play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    next: '<path d="M6 6l9 6-9 6z" fill="currentColor" stroke="none"/><path d="M18 6v12"/>',
    prev: '<path d="M18 6l-9 6 9 6z" fill="currentColor" stroke="none"/><path d="M6 6v12"/>',
    expand: '<path d="M6 15l6-6 6 6"/>',
    float: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 15l6-6M10 9h5v5"/>',
    dock: '<path d="M4 20h16"/><path d="M12 4v11M7 10l5 5 5-5"/>',
    fold: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>',
    device: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  };
  const ic = (n) => el('span', { class: 'mu-ic', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24">${ICON[n]}</svg>` });
  const btn = (name, label, onclick, cls = '') => el('button', { class: 'mu-btn ' + cls, type: 'button', title: label, 'aria-label': label, onclick }, ic(name));

  // Everything that shows the state registers a painter; one listener paints them all.
  const painters = [];
  function paint(st) { for (const p of painters) p(st); }
  E.on(paint);
  window.addEventListener('pagehide', () => E.off(paint));
  setInterval(() => paint(E.st), 1000);    // the progress moves between polls

  // Spotify's answers that need the person (where to play, open the app, Premium) — whichever controls were pressed.
  painters.push((st) => {
    if (!st.error || document.visibilityState !== 'visible') return;
    const e = st.error; st.error = '';
    if (st.playing && e !== 'premium') st.playing = false;
    if (e === 'pick_device') showDevices(st.pending);
    if (e === 'no_device') showNoDevice();
    if (e === 'premium') toast('ספוטיפיי מאפשר שליטה רק לחשבון פרימיום מלא');
  });

  /** A compact now-playing unit (art, title, controls); used in the menu, the strip and the floating card. */
  function unit(kind) {
    const art = el('span', { class: 'mu-art' });
    const title = el('b', { class: 'mu-title' }), artist = el('small', { class: 'mu-artist' });
    const play = btn('play', 'נגן', () => E.toggle(), 'main');
    const bar = el('span', { class: 'mu-bar' }, el('i'));
    const node = el('div', { class: 'mu-unit ' + kind },
      art, el('span', { class: 'mu-text', role: 'button', tabindex: '0', title: 'לפתוח את הנגן', onclick: () => openPanel(), onkeydown: (e) => { if (e.key === 'Enter') openPanel(); } }, title, artist),
      el('span', { class: 'mu-ctls', dir: 'ltr' }, btn('prev', 'הקודם', () => E.prev()), play, btn('next', 'הבא', () => E.next())), bar);
    painters.push((st) => {
      const has = !!st.title;
      node.classList.toggle('empty', !has);
      node.classList.toggle('playing', st.playing);
      title.textContent = has ? st.title : 'מוזיקה';
      artist.textContent = has ? st.artist : st.spotify.connected ? 'ספוטיפיי מחובר · לחצו לבחירה' : 'ספוטיפיי ויוטיוב';
      art.style.backgroundImage = st.art ? `url("${st.art}")` : '';
      play.replaceChildren(ic(st.playing ? 'pause' : 'play'));
      play.setAttribute('aria-label', st.playing ? 'השהיה' : 'נגן'); play.title = play.getAttribute('aria-label');
      bar.firstChild.style.inlineSize = st.duration ? `${(now(st) / st.duration) * 100}%` : '0';
    });
    return node;
  }

  /* ---- 1. its home: the menu ---- */
  let menuSpot = null, strip = null;
  function mountMenu() {
    const appbar = document.querySelector('.appbar'), tabbar = document.querySelector('.tabbar');
    if (!appbar) return false;
    // PC: a pill in the top bar
    menuSpot = el('div', { class: 'mu-menu', 'data-guide': 'music', 'data-guide-label': 'נגן המוזיקה' }, unit('pill'),
      btn('float', 'לשחרר את הנגן מהתפריט', () => setMode('float'), 'undock'));
    const anchor = appbar.querySelector('.theme-switch') || appbar.querySelector('.userchip');
    appbar.insertBefore(menuSpot, anchor);
    dragOut(menuSpot.querySelector('.mu-art'));
    // phone: an item in the tab bar, and a slim strip on top of the tab bar while something is loaded
    if (tabbar) {
      const rec = el('button', { class: 'mu-tab', type: 'button', 'aria-label': 'מוזיקה', onclick: () => openPanel() }, el('span', { class: 'mu-disc' }, ic('note')), el('span', {}, 'מוזיקה'));
      tabbar.append(rec);
      strip = el('div', { class: 'mu-strip' }, unit('strip'), btn('float', 'לשחרר את הנגן', () => setMode('float'), 'undock'));
      tabbar.prepend(strip);
      dragOut(strip.querySelector('.mu-art'));
      painters.push((st) => { rec.classList.toggle('playing', st.playing); strip.hidden = !st.title || P.mode !== 'menu'; document.body.classList.toggle('mu-strip-on', !strip.hidden); });
    }
    return true;
  }

  /* ---- 2. pulled out: a floating card that can be folded to a record ---- */
  let float = null;
  function mountFloat() {
    float = el('div', { class: 'mu-float', hidden: true, role: 'region', 'aria-label': 'נגן המוזיקה' },
      el('div', { class: 'mu-grip', 'aria-hidden': 'true' }),
      unit('card'),
      el('div', { class: 'mu-float-acts' },
        btn('fold', 'לקפל לתקליט', () => { P.folded = !P.folded; save(); paintFloat(); }, 'foldbtn'),
        btn('dock', 'בחזרה לתפריט', () => setMode('menu'))));
    const disc = el('button', { class: 'mu-record', type: 'button', 'aria-label': 'לפתוח את הנגן', onclick: () => { if (moved) return; P.folded = false; save(); paintFloat(); } }, el('span', { class: 'mu-art' }));
    float.append(disc);
    document.body.append(float);
    painters.push((st) => { disc.firstChild.style.backgroundImage = st.art ? `url("${st.art}")` : ''; float.classList.toggle('playing', st.playing); });
    let moved = false;
    float.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button:not(.mu-record), .mu-text, .mu-bar')) return;
      const r = float.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, x0 = e.clientX, y0 = e.clientY;
      moved = false;
      float.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        moved = true;
        place(ev.clientX - dx, ev.clientY - dy);
      };
      const up = () => { float.removeEventListener('pointermove', mv); float.removeEventListener('pointerup', up); float.removeEventListener('pointercancel', up); if (moved) rememberSpot(); setTimeout(() => { moved = false; }, 0); };
      float.addEventListener('pointermove', mv); float.addEventListener('pointerup', up); float.addEventListener('pointercancel', up);
    });
    window.addEventListener('resize', () => { if (!float.hidden) restoreSpot(); });
  }
  function place(x, y) {
    const r = float.getBoundingClientRect();
    x = Math.max(6, Math.min(innerWidth - r.width - 6, x)); y = Math.max(6, Math.min(innerHeight - r.height - 6, y));
    float.style.left = x + 'px'; float.style.top = y + 'px';
  }
  // where it floats is this screen's business (a phone and a PC differ), so it stays on this device
  function rememberSpot() { const r = float.getBoundingClientRect(); try { localStorage.setItem('helper.music.spot', JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch (_) { /* ignore */ } }
  function restoreSpot() {
    let s = null; try { s = JSON.parse(localStorage.getItem('helper.music.spot') || 'null'); } catch (_) { /* ignore */ }
    // first time: low on the screen, clear of the menu and of YouTube's video card
    if (s) place(s.x * innerWidth, s.y * innerHeight); else place(innerWidth - float.offsetWidth - 16, innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 0) - (E.st.yt.id ? 360 : 170));
  }
  function paintFloat() {
    if (!float) return;
    float.hidden = P.mode !== 'float';
    float.classList.toggle('folded', !!P.folded);
    if (!float.hidden) requestAnimationFrame(restoreSpot);
    if (menuSpot) menuSpot.hidden = P.mode !== 'menu';
    paint(E.st);
  }
  function setMode(m) {
    P.mode = m; if (m === 'menu') P.folded = false; save();
    paintFloat();
    if (m === 'menu') toast('הנגן חזר למקום שלו בתפריט');
  }
  /** Dragging the art out of the menu pulls the player out to float where it is dropped. */
  function dragOut(handle) {
    if (!handle) return;
    handle.title = 'גררו כדי לשחרר את הנגן';
    handle.addEventListener('pointerdown', (e) => {
      const x0 = e.clientX, y0 = e.clientY;
      handle.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 24) return;
        cleanup(); P.mode = 'float'; P.folded = false; save(); paintFloat();
        requestAnimationFrame(() => { place(ev.clientX - 30, ev.clientY - 30); rememberSpot(); });
      };
      const cleanup = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', cleanup); handle.removeEventListener('pointercancel', cleanup); };
      handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', cleanup); handle.addEventListener('pointercancel', cleanup);
    });
  }

  /* ---- 3. the big panel: now playing, Spotify and YouTube ---- */
  let panel = null;
  function buildPanel() {
    const art = el('div', { class: 'mu-bigart' });
    const title = el('h2', { class: 'mu-bigtitle' }), artist = el('p', { class: 'mu-bigartist' });
    const seek = el('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'מיקום בשיר', class: 'mu-seek' });
    const tNow = el('small'), tDur = el('small');
    const play = btn('play', 'נגן', () => E.toggle(), 'main big');
    const vol = el('input', { type: 'range', min: 0, max: 100, value: 70, 'aria-label': 'עוצמת קול', class: 'mu-vol' });
    const devBtn = el('button', { class: 'btn ghost small mu-devbtn', type: 'button', onclick: () => showDevices() }, ic('device'), el('span', {}, 'מכשיר'));
    let seeking = false;
    seek.addEventListener('input', () => { seeking = true; });
    seek.addEventListener('change', () => { seeking = false; E.seek((seek.value / 1000) * E.st.duration); });
    vol.addEventListener('input', () => E.volume(+vol.value));

    const tabs = el('div', { class: 'mu-tabs', role: 'tablist' });
    const body = el('div', { class: 'mu-body' });
    const mkTab = (id, label) => el('button', { class: 'mu-tabbtn', role: 'tab', type: 'button', 'data-tab': id, onclick: () => showTab(id) }, label);
    tabs.append(mkTab('spotify', 'ספוטיפיי'), mkTab('youtube', 'יוטיוב'), mkTab('recent', 'אחרונים'));

    panel = el('section', { class: 'mu-panel', hidden: true, role: 'dialog', 'aria-label': 'נגן המוזיקה' },
      el('div', { class: 'mu-phead' }, el('b', {}, 'מוזיקה'), el('span', { class: 'spacer' }),
        btn(P.mode === 'menu' ? 'float' : 'dock', 'לשחרר מהתפריט / להחזיר', () => setMode(P.mode === 'menu' ? 'float' : 'menu')),
        btn('x', 'סגירה', () => closePanel())),
      el('div', { class: 'mu-now' }, art,
        el('div', { class: 'mu-nowtext' }, title, artist,
          el('div', { class: 'mu-time', dir: 'ltr' }, tNow, seek, tDur),
          el('div', { class: 'mu-ctl', dir: 'ltr' }, btn('prev', 'הקודם', () => E.prev()), play, btn('next', 'הבא', () => E.next())),
          el('div', { class: 'mu-volrow' }, ic('speaker'), vol, devBtn))),
      tabs, body);
    document.body.append(panel);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

    painters.push((st) => {
      if (panel.hidden) return;
      title.textContent = st.title || 'עוד לא בחרתם מה לשמוע';
      artist.textContent = st.title ? st.artist + (st.source === 'spotify' && st.device ? ` · ב${st.device.name}` : st.source === 'youtube' ? ' · יוטיוב' : '') : 'חפשו שיר או פלייליסט למטה';
      art.style.backgroundImage = st.art ? `url("${st.art}")` : '';
      art.classList.toggle('spin', st.playing);
      play.replaceChildren(ic(st.playing ? 'pause' : 'play'));
      play.setAttribute('aria-label', st.playing ? 'השהיה' : 'נגן');
      if (!seeking) seek.value = st.duration ? Math.round((now(st) / st.duration) * 1000) : 0;
      tNow.textContent = fmt(now(st)); tDur.textContent = fmt(st.duration);
      if (document.activeElement !== vol) vol.value = st.volume;
      devBtn.hidden = st.source !== 'spotify' || !st.spotify.connected;
    });

    function showTab(id) {
      tabs.querySelectorAll('.mu-tabbtn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      body.replaceChildren();
      if (id === 'spotify') spotifyTab(body);
      if (id === 'youtube') youtubeTab(body);
      if (id === 'recent') recentTab(body);
    }
    panel.showTab = showTab;
  }

  function searchBox(placeholder, run) {
    const input = el('input', { type: 'search', placeholder, 'aria-label': placeholder, dir: 'auto' });
    const out = el('div', { class: 'mu-results' });
    const go = async () => {
      const q = input.value.trim(); if (!q) return;
      out.replaceChildren(el('p', { class: 'muted mu-wait' }, 'מחפש…'));
      try { await run(q, out); } catch (e) { out.replaceChildren(el('p', { class: 'muted' }, 'החיפוש לא הצליח: ' + e.message)); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return { node: el('div', { class: 'mu-search' }, el('div', { class: 'mu-sbox' }, ic('search'), input, el('button', { class: 'btn primary small', type: 'button', onclick: go }, 'חיפוש')), out), input, out };
  }
  const row = (item, sub, onplay, extra) => el('button', { class: 'mu-row', type: 'button', onclick: onplay },
    el('span', { class: 'mu-rowart', style: item.art ? `background-image:url("${item.art}")` : '' }),
    el('span', { class: 'mu-rowtext' }, el('b', { dir: 'auto' }, item.title), el('small', { dir: 'auto' }, sub)), extra || null);

  function spotifyTab(body) {
    const s = E.st.spotify;
    if (!s.configured) {
      body.append(el('div', { class: 'mu-note' }, el('b', {}, 'ספוטיפיי עוד לא הוגדר בעוזר.'),
        el('p', {}, 'מנהל המשפחה צריך לרשום פעם אחת את העוזר אצל ספוטיפיי (Client ID). אחרי זה כל אחד מחבר את החשבון שלו בלחיצה.')));
      return;
    }
    if (!s.connected) {
      body.append(el('div', { class: 'mu-note' }, el('b', {}, 'חברו את ספוטיפיי שלכם'),
        el('p', {}, 'כמו בווייז: המוזיקה מתנגנת באפליקציית ספוטיפיי שלכם (גם כשעוברים לאפליקציה אחרת), ומכאן שולטים בה. צריך חשבון פרימיום.'),
        el('a', { class: 'btn primary', href: '/api/music/spotify/login?next=' + encodeURIComponent(location.pathname) }, 'חיבור לספוטיפיי')));
      return;
    }
    const sb = searchBox('שיר, אמן או פלייליסט בספוטיפיי', async (q, out) => {
      const r = await api('/api/music/spotify/search?q=' + encodeURIComponent(q), { noRedirect: true });
      out.replaceChildren(
        ...(r.tracks.length ? [el('h3', {}, 'שירים'), ...r.tracks.map((t) => row(t, t.artist, () => E.playSpotify(t)))] : []),
        ...(r.playlists.length ? [el('h3', {}, 'פלייליסטים'), ...r.playlists.map((p) => row(p, `${p.by} · ${p.count} שירים`, () => E.playSpotify(p)))] : []),
        ...(!r.tracks.length && !r.playlists.length ? [el('p', { class: 'muted' }, 'לא נמצא כלום')] : []));
    });
    const mine = el('div', { class: 'mu-results' }, el('p', { class: 'muted mu-wait' }, 'טוען את הפלייליסטים שלכם…'));
    body.append(sb.node, el('h3', {}, 'הפלייליסטים שלי'), mine,
      el('p', { class: 'mu-foot' }, el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm('לנתק את ספוטיפיי מהעוזר?')) return; await api('/api/music/spotify/disconnect', { method: 'POST' }); E.st.spotify.connected = false; E.status(); panel.showTab('spotify'); } }, 'ניתוק ספוטיפיי')));
    api('/api/music/spotify/playlists', { noRedirect: true }).then((r) => mine.replaceChildren(...(r.playlists.length ? r.playlists.map((p) => row(p, `${p.count} שירים`, () => E.playSpotify(p))) : [el('p', { class: 'muted' }, 'אין פלייליסטים')])))
      .catch(() => mine.replaceChildren(el('p', { class: 'muted' }, 'לא הצלחתי לטעון את הפלייליסטים')));
  }

  function youtubeTab(body) {
    const sb = searchBox('שיר ביוטיוב, או הדביקו קישור', async (q, out) => {
      const r = await api('/api/music/youtube/search?q=' + encodeURIComponent(q), { noRedirect: true });
      out.replaceChildren(...(r.videos.length ? r.videos.map((v) => row(v, v.channel, () => E.playYT(v, r.videos))) : [el('p', { class: 'muted' }, 'לא נמצאו סרטונים')]));
    });
    body.append(sb.node);
    if (matchMedia('(pointer: coarse)').matches) body.append(el('p', { class: 'mu-foot muted' }, 'בטלפון יוטיוב עוצר כשיוצאים מהאפליקציה (זה הכלל של יוטיוב). למוזיקה ברקע – ספוטיפיי.'));
  }

  function recentTab(body) {
    const list = P.recent || [];
    if (!list.length) { body.append(el('p', { class: 'muted' }, 'מה שתשמעו יופיע כאן.')); return; }
    body.append(el('div', { class: 'mu-results' }, list.map((x) => row(x, (x.kind === 'yt' ? 'יוטיוב · ' : 'ספוטיפיי · ') + (x.artist || x.channel || ''), () => (x.kind === 'yt' ? E.playYT(x) : E.playSpotify(x))))));
  }

  /** Where should it play? pending: the press that found no Spotify playing (it is carried out on the chosen device). */
  async function showDevices(pending) {
    const r = await api('/api/music/spotify/devices', { noRedirect: true }).catch(() => ({ devices: [] }));
    if (!r.devices.length) return showNoDevice();
    const list = el('div', { class: 'mu-results' }, r.devices.map((d) => row({ title: d.name }, d.active ? 'מתנגן כאן עכשיו' : typeLabel(d.type), async () => {
      H.closeModal();
      const ok = pending ? await E.spCmd(pending.action, { ...pending.extra, device: d.id }) : await E.spCmd('transfer', { device: d.id });
      E.st.pending = null;
      if (ok) toast((pending ? 'מנגן ב' : 'המוזיקה עברה ל') + d.name);
    })));
    H.modal(el('h2', {}, 'איפה לנגן?'), el('p', { class: 'muted' }, 'המכשירים שבהם ספוטיפיי פתוח עכשיו. לא רואים את הטלפון או המחשב? פתחו בהם את ספוטיפיי.'), list,
      el('p', {}, el('a', { class: 'btn ghost small', href: 'spotify:', onclick: () => setTimeout(() => E.poll(), 4000) }, 'לפתוח את ספוטיפיי כאן')));
  }
  const typeLabel = (t) => ({ Smartphone: 'טלפון', Computer: 'מחשב', Speaker: 'רמקול', TV: 'טלוויזיה', Tablet: 'טאבלט', CastAudio: 'רמקול', Automobile: 'רכב' })[t] || t;
  function showNoDevice() {
    H.modal(el('h2', {}, 'ספוטיפיי לא פתוח באף מכשיר'),
      el('p', {}, 'פתחו את אפליקציית ספוטיפיי בטלפון או במחשב (אפשר להשאיר אותה ברקע), ואז נסו שוב מכאן.'),
      el('p', {}, el('a', { class: 'btn primary', href: 'spotify:', onclick: () => setTimeout(() => E.poll(), 4000) }, 'לפתוח את ספוטיפיי')));
  }

  function openPanel(tab) {
    if (!panel) buildPanel();
    panel.hidden = false;
    panel.showTab(tab || (E.st.source === 'youtube' ? 'youtube' : 'spotify'));
    paint(E.st);
    E.poll();
  }
  function closePanel() { if (panel) panel.hidden = true; }

  /* ---- keeping the music on between screens (the engine's page only) ---- */
  function shellLinks() {
    if (parentEngine) return;
    document.addEventListener('click', (e) => {
      if (!E.st.yt.id || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname.startsWith('/api/') || (u.pathname === location.pathname && u.hash)) return;
      e.preventDefault();
      enterShell(u);
    });
  }
  let shell = null;
  function enterShell(u) {
    if (!shell) {
      // everything of this page steps aside except the player's own parts; the next screen loads in a full frame
      for (const n of document.body.children) if (!n.matches('.mu-video, .mu-float, .mu-panel, .toast, script')) n.classList.add('mu-away');
      shell = el('iframe', { class: 'mu-shell', title: 'העוזר' });
      document.body.append(shell);
      document.body.classList.add('mu-shelled');
      shell.addEventListener('load', () => {
        try {
          const w = shell.contentWindow;
          history.replaceState(null, '', w.location.pathname + w.location.search + w.location.hash);
          document.title = w.document.title;
        } catch (_) { /* ignore */ }
      });
      // controls of the hidden page give way to the frame's own
      if (menuSpot) menuSpot.hidden = true;
      if (float) float.classList.add('mu-away');
      closePanel();
    }
    shell.src = u.pathname + u.search + u.hash;
  }

  /* ---- start ---- */
  function start() {
    if (!mountMenu()) return;
    mountFloat();
    paintFloat();
    shellLinks();
    // back from Spotify's sign-in
    const m = new URLSearchParams(location.search).get('music');
    if (m) {
      const msg = { connected: 'ספוטיפיי מחובר! עכשיו אפשר לבחור מה לשמוע', denied: 'החיבור לספוטיפיי בוטל', expired: 'החיבור לקח יותר מדי זמן, נסו שוב', failed: 'ספוטיפיי לא אישר את החיבור, נסו שוב', not_configured: 'ספוטיפיי עוד לא הוגדר בעוזר' }[m];
      if (msg) toast(msg);
      history.replaceState(null, '', location.pathname + location.hash);
      if (m === 'connected') E.status().then(() => openPanel('spotify'));
    }
  }
  H.music = { open: openPanel, engine: E };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start)); else setTimeout(start);
})();
