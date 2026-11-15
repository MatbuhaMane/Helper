/* "יד ביד" is locked behind the owner switch "yad". The server answers 404 to everyone but the owner while it is off; this is the
   same answer for the app: the tile, the links, the approval count and the pushes appear only when YadGate.on() is true.
   Use:  if (await YadGate.on()) { show the tile }   (one cheap call per page load, remembered for the session). */
(() => {
  let p = null;
  window.YadGate = {
    on() {
      if (!p) p = fetch('/api/yad/status').then((r) => (r.ok ? r.json() : { on: false })).then((j) => j.on === true).catch(() => false);
      return p;
    },
  };
})();
