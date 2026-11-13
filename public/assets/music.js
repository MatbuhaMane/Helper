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
  // (autoStump: the record parks on the home page's stump although the saved place is the menu; that place is what is saved)
  let autoStump = null;
  const save = () => {
    if (!autoStump || P.mode !== 'stump') return H.savePrefs('music');
    P.mode = autoStump; H.savePrefs('music'); P.mode = 'stump';
  };
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
        st.spotify.configured = s.spotify.configured; st.spotify.connected = s.spotify.connected; st.spotify.stream = s.spotify.stream; st.ytSearch = s.youtube.search;
      } catch (_) { /* offline */ }
      emit();
      if (st.spotify.connected) { poll(); if (st.spotify.stream && canHost) drmOk().then((ok) => { st.spotify.noDrm = !ok; emit(); if (ok) loadSdk(); }); }
    }

    /* ---- Spotify played right here (a computer's browser becomes a Spotify device, "האוהל") ----
       Phones keep the remote way: Spotify's own app plays in the background, a browser tab doesn't. */
    const canHost = !matchMedia('(pointer: coarse)').matches && !/Electron/.test(navigator.userAgent);
    let sdk = null, sdkLoad = null;
    /** Spotify plays in a browser only with Widevine (the copy-protection module of Chrome, Edge and Firefox); built-in browsers often lack it. */
    function drmOk() {
      if (!navigator.requestMediaKeySystemAccess) return Promise.resolve(false);
      return navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }] }]).then(() => true, () => false);
    }
    st.here = '';
    function loadSdk() {
      sdkLoad ||= new Promise((resolve) => {
        window.onSpotifyWebPlaybackSDKReady = () => {
          sdk = new Spotify.Player({
            name: 'האוהל',
            getOAuthToken: (cb) => api('/api/music/spotify/token', { noRedirect: true }).then((r) => cb(r.token)).catch(() => {}),
            volume: (st.volume || 70) / 100,
          });
          sdk.addListener('ready', ({ device_id }) => { st.here = device_id; emit(); resolve(sdk); });
          sdk.addListener('not_ready', () => { st.here = ''; emit(); });
          sdk.addListener('player_state_changed', (s) => {
            if (!s) return;
            // playing here: the state comes straight from the player, no need to wait for the next poll
            const t = s.track_window?.current_track;
            st.source = 'spotify'; st.playing = !s.paused; st.progress = s.position; st.at = Date.now(); st.duration = s.duration;
            if (t) { st.title = t.name; st.artist = (t.artists || []).map((a) => a.name).join(', '); st.art = t.album?.images?.[0]?.url || ''; st.uri = t.uri; }
            st.device = { id: st.here, name: 'האוהל', type: 'Computer' };
            emit();
          });
          for (const ev of ['initialization_error', 'authentication_error', 'account_error']) sdk.addListener(ev, ({ message }) => { console.warn('Spotify player', ev, message); st.here = ''; emit(); resolve(null); });
          sdk.connect();
        };
        document.head.append(el('script', { src: 'https://sdk.scdn.co/spotify-player.js' }));
      });
      return sdkLoad;
    }
    /** The browser lets sound start only from a tap or a click: the first one unlocks the player here. */
    function unlock() { try { sdk?.activateElement?.(); } catch (_) { /* ignore */ } }

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
      if (action !== 'pause') unlock();
      try {
        await api('/api/music/spotify/cmd', { body: { action, ...extra }, noRedirect: true });
      } catch (e) {
        if (/no_active_device/.test(e.message) && st.here && action !== 'pause' && !extra.device) {
          // nothing plays anywhere, and this computer is a player: play right here (it's where the person pressed)
          return spCmd(action === 'play' || action === 'next' || action === 'prev' ? 'play' : action, { ...extra, device: st.here });
        }
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
    return { unlock, st, on: (f) => { listeners.add(f); f(st); }, off: (f) => listeners.delete(f), status, poll, spCmd, playYT, closeYT, playSpotify, next, prev, toggle, seek, volume,
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
    lyrics: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    queue: '<path d="M4 6h11M4 11h11M4 16h7"/><path d="M17 18.5V10l4-1"/><circle cx="15.5" cy="18.5" r="1.8"/>',
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
    const bar = el('span', { class: 'mu-bar scaled' }, el('i'));   // (.scaled: the bar grows by transform, from --p – smooth motion)
    const node = el('div', { class: 'mu-unit ' + kind },
      art, el('span', { class: 'mu-text', role: 'button', tabindex: '0', title: 'לפתוח את הנגן', onclick: () => openPanel(), onkeydown: (e) => { if (e.key === 'Enter') openPanel(); } }, title, artist),
      el('span', { class: 'mu-ctls', dir: 'ltr' }, btn('prev', 'הקודם', () => E.prev()), play, btn('next', 'הבא', () => E.next())),
      btn('queue', 'רשימת השמע', () => openPanel('queue'), 'qbtn'), btn('lyrics', 'מילים לשיר', () => lyricsNow(), 'lybtn'), bar);
    painters.push((st) => {
      const has = !!st.title;
      node.classList.toggle('empty', !has);
      node.classList.toggle('playing', st.playing);
      title.textContent = has ? st.title : 'מוזיקה';
      artist.textContent = has ? st.artist : st.spotify.connected ? 'ספוטיפיי מחובר · לחצו לבחירה' : 'ספוטיפיי ויוטיוב';
      art.style.backgroundImage = st.art ? `url("${st.art}")` : '';
      play.replaceChildren(ic(st.playing ? 'pause' : 'play'));
      play.setAttribute('aria-label', st.playing ? 'השהיה' : 'נגן'); play.title = play.getAttribute('aria-label');
      bar.firstChild.style.setProperty('--p', st.duration ? String(Math.min(1, now(st) / st.duration)) : '0');
    });
    return node;
  }

  /* ---- 1. its home: the menu ---- */
  let menuSpot = null, strip = null;
  function mountMenu() {
    const appbar = document.querySelector('.appbar'), tabbar = document.querySelector('.tabbar');
    if (!appbar) return false;
    // PC: a pill in the top bar
    // (a floating copy opens from the record by the stump on the home page, or by dragging the cover out of here)
    menuSpot = el('div', { class: 'mu-menu', 'data-guide': 'music', 'data-guide-label': 'נגן המוזיקה' }, unit('pill'));
    const anchor = appbar.querySelector('.theme-switch') || appbar.querySelector('.userchip');
    appbar.insertBefore(menuSpot, anchor);
    dragOut(menuSpot.querySelector('.mu-art'));
    // phone: an item in the tab bar, and a slim strip on top of the tab bar while something is loaded
    if (tabbar) {
      const rec = el('button', { class: 'mu-tab', type: 'button', 'aria-label': 'מוזיקה', onclick: () => openPanel() }, el('span', { class: 'mu-disc' }, ic('note')), el('span', {}, 'מוזיקה'));
      tabbar.append(rec);
      strip = el('div', { class: 'mu-strip' }, unit('strip'));
      tabbar.prepend(strip);
      dragOut(strip.querySelector('.mu-art'));
      painters.push((st) => { rec.classList.toggle('playing', st.playing); strip.hidden = !st.title || P.mode !== 'menu'; document.body.classList.toggle('mu-strip-on', !strip.hidden); });
    }
    return true;
  }

  /* ---- 2. pulled out: a floating card (folds to a record), or a tab with a treble clef at the screen's edge ----
     Drag the card (or the record, or the tab) and let go over the menu to dock it back, at a screen edge to make it
     a tab, anywhere else to leave it floating there. */
  let float = null, edge = null;
  const CLEF = '<svg viewBox="0 0 24 40" aria-hidden="true"><path d="M10.6 37.2c1.9 2.2 4.8.3 4-2.4L11.2 7.1c-.5-3.6 3.6-4.9 4.6-1.9 1.3 4-2.2 7.8-5.9 11.5-4.1 4.1-4.6 9.9-.6 12.4 3.5 2.3 9 .6 8.8-3.9-.2-4-4.4-5-6.4-3-1.5 1.5-1 4 1 4.5"/><circle cx="10.2" cy="36.6" r="1.9"/></svg>';
  function mountFloat() {
    // until the person moves it themself (P.chose), the record sits on the home page's stump and in the menu elsewhere
    // (design and the owner: "the record leaning on the stump is the same record"; an empty slot at first looks broken)
    // (the CEO, 11-13: from the start, with no player connected, the record is seen on the stump; only a record the person
    // pulled out to float or to the screen's edge stays where they put it)
    settle();
    // (the home page draws its corner after it loads: if it is not there yet, park the record once it is)
    if (!slot() && location.pathname === '/' && (!P.chose || P.mode === 'menu')) {
      const mo = new MutationObserver(() => { if (slot()) { mo.disconnect(); settle(); paintModes(); } });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 8000);
    }
    float = el('div', { class: 'mu-float', hidden: true, role: 'region', 'aria-label': 'נגן המוזיקה' },
      el('div', { class: 'mu-grip', 'aria-hidden': 'true', title: 'גררו לתפריט או לצד המסך' }),
      unit('card'),
      el('div', { class: 'mu-float-acts' },
        btn('fold', 'לקפל לתקליט', () => { P.folded = true; save(); paintModes(); }, 'foldbtn'),
        btn('dock', 'בחזרה לתפריט', () => setMode('menu'))));
    // folded: a record; a tap opens the card again
    const disc = el('button', { class: 'mu-record', type: 'button', title: 'לחצו לפתיחה, גררו להזזה', 'aria-label': 'לפתוח את הנגן', onclick: () => {
      if (justDragged) return;
      if (docked()) return E.st.title ? E.toggle() : openPanel();   // nothing loaded yet: the player opens, to choose   // on the stump: play or stop (the owner: stopping from the record or the main player)
      P.folded = false; save(); paintModes();
    } }, el('span', { class: 'mu-art' }));
    float.append(disc);
    // at the edge: a tab with a treble clef; a tap opens the card next to it
    edge = el('button', { class: 'mu-edge', type: 'button', hidden: true, title: 'נגן המוזיקה – לחצו לפתיחה, גררו להזזה', 'aria-label': 'לפתוח את נגן המוזיקה',
      onclick: () => { if (justDragged) return; const r = edge.getBoundingClientRect(); P.chose = true; autoStump = null; P.mode = 'float'; P.folded = false; save(); paintModes(false); requestAnimationFrame(() => { place(r.left < innerWidth / 2 ? 12 : innerWidth - float.offsetWidth - 12, r.top - 40); rememberSpot(); }); } },
      el('span', { class: 'clef', html: CLEF }), el('span', { class: 'eq', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')));
    document.body.append(float, edge);
    painters.push((st) => {
      disc.firstChild.style.backgroundImage = st.art ? `url("${st.art}")` : ''; float.classList.toggle('playing', st.playing); edge.classList.toggle('playing', st.playing);
      // on the stump the record is a play/stop button; floating, it opens the card
      if (docked()) { disc.setAttribute('aria-pressed', String(!!st.playing)); disc.setAttribute('aria-label', st.playing ? 'לעצור' : 'לנגן'); disc.title = 'לחצו לנגן או לעצור, גררו להזזה'; }
      else { disc.removeAttribute('aria-pressed'); disc.setAttribute('aria-label', 'לפתוח את הנגן'); disc.title = 'לחצו לפתיחה, גררו להזזה'; }
    });
    // one record (design's spec, docs/design/prototype/record.html): the home page's stump is a place to park it
    if (slot()) {
      document.body.classList.add('mu-one-record');
      addEventListener('scroll', () => { if (docked()) placeDock(); }, { passive: true });
    }
    // a press that moves more than a few pixels becomes a drag (a press that doesn't stays a click)
    for (const h of [float, edge]) h.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.mu-btn, .mu-text, .mu-bar')) return;
      const r = (h === edge ? edge : float).getBoundingClientRect();
      pendingDrag(e, h === edge ? { x: 30, y: 30 } : { x: e.clientX - r.left, y: e.clientY - r.top });
    });
    window.addEventListener('resize', () => { if (docked()) placeDock(); else if (P.mode === 'float' || P.mode === 'stump') restoreSpot(); if (P.mode === 'edge') placeEdge(); });
  }

  /* ---- 3. one record: parked on the home page's stump (mode 'stump'). On a page without the stump it floats folded at
     its last place, and parks again on the home page. ---- */
  // (declarations, not consts: mountFloat may run before these lines)
  // the slot: the home page's '.corner .rec' (with design's patch to index.html, a tap on it calls H.music.dock)
  function slot() { return document.querySelector('.corner .rec'); }
  /** Where the record stands now: by default on the stump on the home page and in the menu elsewhere; the saved place of
      a person who sent it back to the menu still gives way to the stump on the home page (not saved: autoStump). */
  function settle() {
    autoStump = null;
    if (!P.chose) { P.mode = slot() ? 'stump' : 'menu'; P.folded = false; }
    else if (P.mode === 'menu' && slot()) { autoStump = 'menu'; P.mode = 'stump'; }
  }
  // the prefs from the server may arrive after the page drew (another device, the first visit here): stand again
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'music' && float) { settle(); paintModes(); } });
  function docked() { return P.mode === 'stump' && !!slot() && !float?.classList.contains('dragging'); }
  function centreOf(n) { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }
  function placeDock() {
    const c = centreOf(slot());
    float.style.setProperty('--dock-size', Math.round(c.w * 0.72) + 'px');
    const r = float.getBoundingClientRect();
    float.style.left = (c.x - r.width / 2) + 'px'; float.style.top = (c.y - r.height / 2) + 'px';   // (not kept on screen: it goes with the stump)
  }
  function dock() { P.chose = true; autoStump = null; P.mode = 'stump'; P.folded = true; save(); paintModes(); }

  let justDragged = false;
  function pendingDrag(e, grab) {
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    const mv = (ev) => {
      if (ev.pointerId !== id || Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
      off(); startDrag(ev, grab);
    };
    const off = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', off); window.addEventListener('pointercancel', off);
  }
  /** Where a drop at (x, y) lands: back in the menu, a tab at the left or right edge, or nowhere special (it floats). */
  function zoneAt(x, y) {
    const bar = innerWidth >= 900 ? document.querySelector('.appbar') : document.querySelector('.tabbar');
    if (bar) {
      const r = bar.getBoundingClientRect();
      if (innerWidth >= 900 ? y < r.bottom + 18 : y > r.top - 18) return 'menu';
    }
    if (x < 30) return 'left';
    if (x > innerWidth - 30) return 'right';
    return null;
  }
  function startDrag(e, grab) {
    if (P.mode === 'stump') { P.folded = true; float.classList.remove('on-stump'); document.body.classList.remove('mu-docked'); }
    if (P.mode !== 'float') { P.chose = true; autoStump = null; P.mode = 'float'; save(); paintModes(false); }
    float.classList.add('dragging');
    document.body.classList.add('mu-dragging');
    try { float.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    let zone = null;
    const mv = (ev) => {
      place(ev.clientX - grab.x, ev.clientY - grab.y);
      zone = zoneAt(ev.clientX, ev.clientY);
      document.body.classList.toggle('mu-drop-menu', zone === 'menu');
      document.body.classList.toggle('mu-drop-left', zone === 'left');
      document.body.classList.toggle('mu-drop-right', zone === 'right');
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      float.classList.remove('dragging');
      document.body.classList.remove('mu-dragging', 'mu-drop-menu', 'mu-drop-left', 'mu-drop-right');
      justDragged = true; setTimeout(() => { justDragged = false; }, 50);
      const near = slot() && (() => { const c = centreOf(slot()), f = centreOf(float); return Math.hypot(c.x - f.x, c.y - f.y) < 60; })();
      if (near) dock();
      else if (zone === 'menu') setMode('menu');
      else if (zone) { rememberEdge(zone, ev.clientY); setMode('edge'); }
      else rememberSpot();
    };
    mv(e);
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  function place(x, y) {
    const r = float.getBoundingClientRect();
    x = Math.max(6, Math.min(innerWidth - r.width - 6, x)); y = Math.max(6, Math.min(innerHeight - r.height - 6, y));
    float.style.left = x + 'px'; float.style.top = y + 'px';
  }
  // where it floats (and which edge it waits at) is this screen's business – a phone and a PC differ – so it stays on this device
  function rememberSpot() { const r = float.getBoundingClientRect(); try { localStorage.setItem('helper.music.spot', JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch (_) { /* ignore */ } }
  function restoreSpot() {
    let s = null; try { s = JSON.parse(localStorage.getItem('helper.music.spot') || 'null'); } catch (_) { /* ignore */ }
    // first time: low on the screen, clear of the menu and of YouTube's video card
    if (s) place(s.x * innerWidth, s.y * innerHeight); else place(innerWidth - float.offsetWidth - 16, innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 0) - (E.st.yt.id ? 360 : 170));
  }
  function rememberEdge(side, y) { try { localStorage.setItem('helper.music.edge', JSON.stringify({ side, y: y / innerHeight })); } catch (_) { /* ignore */ } }
  function placeEdge() {
    let s = null; try { s = JSON.parse(localStorage.getItem('helper.music.edge') || 'null'); } catch (_) { /* ignore */ }
    s ||= { side: 'left', y: 0.6 };
    // the screen's own left or right edge (where it was dropped), whatever the page's direction
    edge.style.left = s.side === 'left' ? '0' : 'auto'; edge.style.right = s.side === 'right' ? '0' : 'auto';
    edge.classList.toggle('on-left', s.side === 'left'); edge.classList.toggle('on-right', s.side === 'right');
    edge.style.top = Math.round(Math.max(70, Math.min(innerHeight - 140, s.y * innerHeight - 28))) + 'px';
  }
  function paintModes(restore = true) {
    if (!float) return;
    const parked = P.mode === 'stump' && !!slot();
    float.hidden = P.mode !== 'float' && P.mode !== 'stump';
    float.classList.toggle('folded', !!P.folded || P.mode === 'stump');
    float.classList.toggle('on-stump', parked);
    document.body.classList.toggle('mu-docked', parked);
    edge.hidden = P.mode !== 'edge';
    if (P.mode === 'edge') placeEdge();
    if (parked) { placeDock(); requestAnimationFrame(placeDock); }   // (now, and again once the folded size is drawn)
    else if (!float.hidden && restore) requestAnimationFrame(restoreSpot);
    if (menuSpot) menuSpot.hidden = false;   // the menu keeps its own copy; a floating one is extra
    paint(E.st);
  }
  function setMode(m) {
    P.chose = true; autoStump = null; P.mode = m; if (m !== 'float') P.folded = false; save();
    paintModes();
    if (m === 'menu') toast('הנגן חזר למקום שלו בתפריט');
  }
  /** Pulling the art out of the menu (or the strip) takes the player along under the finger. */
  function dragOut(handle) {
    if (!handle) return;
    handle.title = 'גררו כדי לשחרר את הנגן';
    handle.addEventListener('pointerdown', (e) => {
      const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
      const mv = (ev) => {
        if (ev.pointerId !== id || Math.hypot(ev.clientX - x0, ev.clientY - y0) < 20) return;
        off();
        P.chose = true; autoStump = null; P.mode = 'float'; P.folded = false; save(); paintModes(false);
        startDrag(ev, { x: 30, y: 30 });
      };
      const off = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', off); window.addEventListener('pointercancel', off);
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
    const lyBtn = el('button', { class: 'btn ghost small mu-devbtn mu-lyrics', type: 'button', onclick: () => lyricsNow() }, ic('lyrics'), el('span', {}, 'מילים'));
    let seeking = false;
    seek.addEventListener('input', () => { seeking = true; });
    seek.addEventListener('change', () => { seeking = false; E.seek((seek.value / 1000) * E.st.duration); });
    vol.addEventListener('input', () => E.volume(+vol.value));

    const tabs = el('div', { class: 'mu-tabs', role: 'tablist' });
    const body = el('div', { class: 'mu-body' });
    const mkTab = (id, label) => el('button', { class: 'mu-tabbtn', role: 'tab', type: 'button', 'data-tab': id, onclick: () => showTab(id) }, label);
    tabs.append(mkTab('queue', 'רשימת השמע'), mkTab('spotify', 'ספוטיפיי'), mkTab('youtube', 'יוטיוב'), mkTab('recent', 'אחרונים'));

    panel = el('section', { class: 'mu-panel', hidden: true, role: 'dialog', 'aria-label': 'נגן המוזיקה' },
      el('div', { class: 'mu-phead' }, el('b', {}, 'מוזיקה'), el('span', { class: 'spacer' }),
        btn('x', 'סגירה', () => closePanel())),
      el('div', { class: 'mu-now' }, art,
        el('div', { class: 'mu-nowtext' }, title, artist,
          el('div', { class: 'mu-time', dir: 'ltr' }, tNow, seek, tDur),
          el('div', { class: 'mu-ctl', dir: 'ltr' }, btn('prev', 'הקודם', () => E.prev()), play, btn('next', 'הבא', () => E.next())),
          el('div', { class: 'mu-volrow' }, ic('speaker'), vol, devBtn, lyBtn))),
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
      lyBtn.hidden = !st.title;
    });

    function showTab(id) {
      tabs.querySelectorAll('.mu-tabbtn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      body.replaceChildren();
      if (id === 'spotify') spotifyTab(body);
      if (id === 'youtube') youtubeTab(body);
      if (id === 'recent') recentTab(body);
      if (id === 'queue') queueTab(body);
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
    return { node: el('div', { class: 'mu-search' }, el('div', { class: 'mu-sbox' }, ic('search'), input, voiceSearch(input, go), el('button', { class: 'btn primary small', type: 'button', onclick: go }, 'חיפוש')), out), input, out };
  }
  /* Voice search: say the song or the artist and it searches (the player's own microphone, apart from Ibn Ezra's).
     The words appear in the box while you speak; when you stop, the search runs. */
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = null;
  function voiceSearch(input, go) {
    if (!Recognition) return null;
    const mic = el('button', { class: 'mu-btn mu-mic', type: 'button', title: 'חיפוש קולי', 'aria-label': 'חיפוש קולי', 'aria-pressed': 'false' }, ic('mic'));
    mic.addEventListener('click', () => {
      if (listening) { listening.stop(); return; }
      const rec = new Recognition();
      rec.lang = 'he-IL';            // Hebrew, and it also catches most English names of songs and artists
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      const before = input.value;
      rec.onresult = (e) => { input.value = [...e.results].map((r) => r[0].transcript).join(''); };
      rec.onerror = (e) => { if (e.error === 'not-allowed') toast('צריך לאשר לדפדפן גישה למיקרופון'); else if (e.error === 'no-speech') toast('לא שמעתי כלום, נסו שוב'); };
      rec.onend = () => {
        listening = null; mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false');
        if (input.value.trim() && input.value !== before) go();
      };
      listening = rec;
      mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true');
      input.value = ''; input.placeholder = 'מקשיב…';
      setTimeout(() => { input.placeholder = input.getAttribute('aria-label'); }, 6000);
      try { rec.start(); } catch (_) { listening = null; mic.classList.remove('on'); }
    });
    return mic;
  }

  const row = (item, sub, onplay, extra) => el('button', { class: 'mu-row', type: 'button', onclick: onplay },
    el('span', { class: 'mu-rowart', style: item.art ? `background-image:url("${item.art}")` : '' }),
    el('span', { class: 'mu-rowtext' }, el('b', { dir: 'auto' }, item.title), el('small', { dir: 'auto' }, sub)), extra || null);

  function spotifyTab(body) {
    const s = E.st.spotify;
    if (!s.configured) {
      body.append(el('div', { class: 'mu-note' }, el('b', {}, 'ספוטיפיי עוד לא הוגדר באוהל.'),
        el('p', {}, 'מנהל המשפחה צריך לרשום פעם אחת את האוהל אצל ספוטיפיי (Client ID). אחרי זה כל אחד מחבר את החשבון שלו בלחיצה.')));
      return;
    }
    if (!s.connected) {
      body.append(el('div', { class: 'mu-note' }, el('b', {}, 'חברו את ספוטיפיי שלכם'),
        el('p', {}, 'כמו בווייז: המוזיקה מתנגנת באפליקציית ספוטיפיי שלכם (גם כשעוברים לאפליקציה אחרת), ומכאן שולטים בה. צריך חשבון פרימיום.'),
        el('a', { class: 'btn primary', href: '/api/music/spotify/login?next=' + encodeURIComponent(location.pathname) }, 'חיבור לספוטיפיי')));
      return;
    }
    if (s.stream && s.noDrm) {
      body.append(el('div', { class: 'mu-note' }, el('b', {}, 'הדפדפן הזה לא יכול לנגן ספוטיפיי בעצמו'),
        el('p', {}, 'חסר בו רכיב ההגנה (Widevine) שספוטיפיי דורש. פתחו את האוהל בכרום או באדג׳ וזה ינגן כאן, או פתחו את אפליקציית ספוטיפיי ושלטו בה מכאן.')));
    }
    if (!s.stream && !matchMedia('(pointer: coarse)').matches) {
      body.append(el('div', { class: 'mu-note' }, el('b', {}, 'לנגן ישירות כאן, בלי לפתוח את ספוטיפיי?'),
        el('p', {}, 'חברו מחדש פעם אחת ואשרו את ההרשאה החדשה: האוהל יהפוך בעצמו לנגן ספוטיפיי במחשב הזה.'),
        el('a', { class: 'btn primary small', href: '/api/music/spotify/login?next=' + encodeURIComponent(location.pathname) }, 'חיבור מחדש')));
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
      el('p', { class: 'mu-foot' }, el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm('לנתק את ספוטיפיי מהאוהל?')) return; await api('/api/music/spotify/disconnect', { method: 'POST' }); E.st.spotify.connected = false; E.status(); panel.showTab('spotify'); } }, 'ניתוק ספוטיפיי')));
    api('/api/music/spotify/playlists', { noRedirect: true }).then((r) => mine.replaceChildren(...(r.playlists.length ? r.playlists.map((p) => row(p, `${p.count} שירים`, () => E.playSpotify(p))) : [el('p', { class: 'muted' }, 'אין פלייליסטים')])))
      .catch(() => mine.replaceChildren(el('p', { class: 'muted' }, 'לא הצלחתי לטעון את הפלייליסטים')));
  }

  /* ready lists by mood (docs/ai/without-ai.md #10): a tap searches them; with no YouTube key and no AI, the search
     opens on YouTube itself */
  const MOODS = [['🌙 שקט לערב', 'שירים שקטים בעברית'], ['🎯 ריכוז', 'מוזיקה לריכוז בלי מילים'], ['🕯 שבת', 'שירי שבת וזמירות'],
    ['🧒 לילדים', 'שירי ילדים בעברית'], ['🇮🇱 להיטים', 'להיטים ישראליים'], ['🎻 קלאסי', 'מוזיקה קלאסית רגועה'], ['⚡ אנרגיה', 'מוזיקה קצבית לאימון']];
  function youtubeTab(body) {
    const sb = searchBox('שיר ביוטיוב, או הדביקו קישור', async (q, out) => {
      const r = await api('/api/music/youtube/search?q=' + encodeURIComponent(q), { noRedirect: true });
      out.replaceChildren(...(r.videos.length ? r.videos.map((v) => row(v, v.channel, () => E.playYT(v, r.videos)))
        : r.searchUrl ? [el('p', { class: 'muted' }, 'כאן אי אפשר לחפש כרגע (אין חיבור לחיפוש של יוטיוב או לעוזר החכם).'), el('a', { class: 'btn ghost small', href: r.searchUrl, target: '_blank', rel: 'noopener' }, '↗ החיפוש ביוטיוב')]
        : [el('p', { class: 'muted' }, 'לא נמצאו סרטונים')]));
    });
    const moods = el('div', { class: 'mu-moods', role: 'group', 'aria-label': 'לפי מצב רוח' },
      MOODS.map(([label, q]) => el('button', { class: 'chip', type: 'button', onclick: () => { sb.input.value = q; sb.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); } }, label)));
    body.append(sb.node, moods);
    if (matchMedia('(pointer: coarse)').matches) body.append(el('p', { class: 'mu-foot muted' }, 'בטלפון יוטיוב עוצר כשיוצאים מהאפליקציה (זה הכלל של יוטיוב). למוזיקה ברקע – ספוטיפיי.'));
  }

  /** What plays now and what comes next: YouTube's list from the search, or Spotify's own queue. */
  async function queueTab(body) {
    const st = E.st;
    if (st.source === 'youtube' && st.yt.queue.length) {
      body.append(el('div', { class: 'mu-results' }, st.yt.queue.map((v, i) => {
        const r = row(v, i === st.yt.index ? 'מתנגן עכשיו' : v.channel, () => E.playYT(v, st.yt.queue));
        if (i === st.yt.index) r.classList.add('now');
        return r;
      })));
      return;
    }
    if (!st.spotify.connected) { body.append(el('p', { class: 'muted' }, 'עוד אין רשימה. בחרו שיר ביוטיוב, או חברו את ספוטיפיי.')); return; }
    const out = el('div', { class: 'mu-results' }, el('p', { class: 'muted mu-wait' }, 'טוען את רשימת השמע…'));
    body.append(out);
    try {
      const q = await api('/api/music/spotify/queue', { noRedirect: true });
      const rows = [];
      if (q.now) { const r = row(q.now, 'מתנגן עכשיו · ' + q.now.artist, () => {}); r.classList.add('now'); rows.push(el('h3', {}, 'עכשיו'), r); }
      if (q.next.length) rows.push(el('h3', {}, 'הבא בתור'), ...q.next.map((t) => row(t, t.artist, () => E.playSpotify(t))));
      out.replaceChildren(...(rows.length ? rows : [el('p', { class: 'muted' }, 'הרשימה ריקה. בחרו פלייליסט בלשונית ספוטיפיי.')]));
    } catch (e) {
      out.replaceChildren(el('p', { class: 'muted' }, /no_active_device|409/.test(e.message) ? 'ספוטיפיי לא מנגן כרגע באף מכשיר.' : 'לא הצלחתי לטעון את רשימת השמע.'));
    }
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
    // this computer first (when it is a player), then everything else
    r.devices.sort((a, b) => (b.id === E.st.here) - (a.id === E.st.here));
    const list = el('div', { class: 'mu-results' }, r.devices.map((d) => row({ title: d.id === E.st.here ? 'כאן, במחשב הזה' : d.name }, d.active ? 'מתנגן עכשיו' : d.id === E.st.here ? 'האוהל מנגן בעצמו' : typeLabel(d.type), async () => {
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
    if (!panel) { buildPanel(); H.back?.watch?.(panel, closePanel); }   // the back gesture closes it
    panel.hidden = false;
    panel.showTab(tab || (E.st.source === 'youtube' ? 'youtube' : 'spotify'));
    paint(E.st);
    E.poll();
  }
  function closePanel() { if (panel) panel.hidden = true; }

  /* ---- the songbook in a window over any screen, and the lyrics of what's playing ---- */
  let songwin = null, songFollow = false;
  /** The songbook (or one of its songs) in a window you can move by its top bar; on a phone, a sheet from below. */
  function songbook(src = '/songs/?embed=1', title = 'שירון') {
    if (!songwin) {
      const name = el('b', {}, title);
      const full = el('a', { class: 'btn ghost small', href: '/songs/' }, 'לעמוד המלא');
      const head = el('header', {}, name, el('span', { class: 'spacer' }), full,
        el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'סגירה', onclick: () => { songwin.hidden = true; songFollow = false; } }, '✕'));
      const frame = el('iframe', { title: 'השירון' });
      songwin = el('section', { class: 'songwin', role: 'dialog', 'aria-label': 'השירון' }, head, frame);
      songwin.parts = { name, full, frame };
      document.body.append(songwin);
      H.back?.watch?.(songwin, () => { songwin.hidden = true; songFollow = false; });
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a, button') || innerWidth < 600) return;
        const r = songwin.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        const mv = (ev) => {
          songwin.style.insetInlineStart = 'auto';
          songwin.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx)) + 'px';
          songwin.style.top = Math.max(0, Math.min(innerHeight - 60, ev.clientY - dy)) + 'px';
        };
        const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); };
        head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
      });
    }
    const { name, full, frame } = songwin.parts;
    name.textContent = title;
    full.href = src.replace(/([?&])embed=1&?/, '$1').replace(/[?&]$/, '') || '/songs/';
    if (frame.getAttribute('src') !== src) frame.src = src;
    songwin.hidden = false;
    return songwin;
  }
  const lookups = new Map();
  function lookup(st) {
    const key = st.title + '|' + st.artist;
    if (!lookups.has(key)) lookups.set(key, api(`/api/songs/lookup?title=${encodeURIComponent(st.title)}&artist=${encodeURIComponent(st.artist || '')}`, { noRedirect: true }).catch(() => null));
    return lookups.get(key);
  }
  const songSrc = (hit) => `/songs/?embed=1&open=${encodeURIComponent(hit.url)}&title=${encodeURIComponent(hit.title)}&artist=${encodeURIComponent(hit.artist)}`;
  /** The words of the song playing now, in the songbook window (and the window follows the next songs while it's open). */
  async function lyricsNow() {
    const st = E.st;
    if (!st.title) { toast('שום שיר לא מתנגן כרגע'); return; }
    closePanel();
    songbook('about:blank', 'מחפש את המילים…');
    const r = await lookup(st);
    const hit = r && (r.lyrics || r.chords);
    songFollow = true;
    if (hit) songbook(songSrc(hit), (r.lyrics ? 'מילים · ' : 'אקורדים · ') + hit.title);
    else {
      songbook(`/songs/?embed=1&q=${encodeURIComponent(((r && r.title) || st.title) + ' ' + ((r && r.artist) || ''))}`, 'שירון');
      toast(r ? 'לא מצאתי את המילים המדויקות, הנה חיפוש בשירון' : 'השירון לא ענה כרגע, נסו שוב');
    }
  }
  /* a gentle word from the side (vision batch 4, item 10): it slides in from the screen's edge, stays a few seconds and
     slides back out; a tap on its button acts, ✕ or a swipe lets it go. Still for whoever asked for less motion. */
  let peekEl = null;
  function peek(text, label, act) {
    peekEl?.remove();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // it sits at the inline end (the left in Hebrew), and comes in from that edge
    const side = getComputedStyle(document.documentElement).direction === 'rtl' ? -1 : 1;
    let gone = false, timer = 0;
    const out = () => {
      if (gone) return; gone = true; clearTimeout(timer);
      const node = box;
      if (still) { node.remove(); return; }
      node.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${side * 110}%)`, opacity: 0 }], { duration: 380, easing: 'cubic-bezier(.4,0,1,1)' }).onfinish = () => node.remove();
    };
    const box = el('div', { class: 'mu-peek', role: 'status', 'aria-live': 'polite',
    },
      el('span', { class: 'mu-peek-text' }, '🎵 ', text),
      el('button', { class: 'btn small primary', type: 'button', onclick: () => { out(); act(); } }, label),
      el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'סגירה', onclick: out }, '✕'));
    // a swipe toward the edge sends it away
    let x0 = null;
    box.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    box.addEventListener('pointerup', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) out(); x0 = null; });
    box.addEventListener('pointerenter', () => clearTimeout(timer));
    box.addEventListener('pointerleave', () => { clearTimeout(timer); timer = setTimeout(out, 2500); });
    document.body.append(box);
    peekEl = box;
    if (!still) box.animate([{ transform: `translateX(${side * 110}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    timer = setTimeout(out, 6000);
  }

  // a new song: the open window turns to its words; otherwise a small offer (only for songs the songbook knows)
  let lastSong = null, songTimer = 0;
  painters.push((st) => {
    const key = st.title ? st.title + '|' + st.artist : '';
    if (key === lastSong) return;
    const first = lastSong === null;
    lastSong = key;
    clearTimeout(songTimer);
    if (!key || first || document.body.classList.contains('mu-shelled')) return;   // (not for the song already playing when the page opened)
    songTimer = setTimeout(async () => {
      if (document.visibilityState !== 'visible' || !E.st.playing) return;
      const r = await lookup(E.st);
      const hit = r && (r.lyrics || r.chords);
      if (!hit || lastSong !== key) return;
      if (songwin && !songwin.hidden && songFollow) songbook(songSrc(hit), (r.lyrics ? 'מילים · ' : 'אקורדים · ') + hit.title);
      else peek(`המילים של "${hit.title}" בשירון`, 'להציג', () => { songFollow = true; songbook(songSrc(hit), (r.lyrics ? 'מילים · ' : 'אקורדים · ') + hit.title); });
    }, 2500);
  });

  /* ---- keeping the music on between screens (the engine's page only) ---- */
  function shellLinks() {
    if (parentEngine) return;
    document.addEventListener('click', (e) => {
      const playingHere = E.st.here && E.st.device?.id === E.st.here && E.st.playing;
      if (!(E.st.yt.id || playingHere) || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
      shell = el('iframe', { class: 'mu-shell', title: 'האוהל' });
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
      if (edge) edge.classList.add('mu-away');
      closePanel();
    }
    shell.src = u.pathname + u.search + u.hash;
  }

  /* ---- start ---- */
  function start() {
    if (!mountMenu()) return;
    mountFloat();
    paintModes();
    shellLinks();
    // back from Spotify's sign-in
    const m = new URLSearchParams(location.search).get('music');
    if (m) {
      const msg = { connected: 'ספוטיפיי מחובר! עכשיו אפשר לבחור מה לשמוע', denied: 'החיבור לספוטיפיי בוטל', expired: 'החיבור לקח יותר מדי זמן, נסו שוב', failed: 'ספוטיפיי לא אישר את החיבור, נסו שוב', not_configured: 'ספוטיפיי עוד לא הוגדר באוהל' }[m];
      if (msg) toast(msg);
      history.replaceState(null, '', location.pathname + location.hash);
      if (m === 'connected') E.status().then(() => openPanel('spotify'));
    }
  }
  // float(): a floating copy of the player (the record by the stump opens it), open where it last floated
  H.music = { open: openPanel, engine: E, songbook, lyrics: lyricsNow, float: () => { P.chose = true; autoStump = null; P.mode = 'float'; P.folded = false; save(); paintModes(); }, dock: () => (float ? dock() : null) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start)); else setTimeout(start);
})();
