/* Folders of apps (Food, Tools) and the page of an app that is still to come.
   H.folder({ title, sub, back?: { href, label }, look?: 'flat', apps: [{ href, ic, name, c1, c2, soon?, owner?, art?, tint?, line? }] })
   (art: a silhouette picture used as the icon, filled with tint and outlined with line;
    look 'flat': the line icon itself, large, filled with the app's pastel tint, with no tile behind it)
   H.soonPage({ title, ic, c1, c2, back: { href, label }, text }) */
(() => {
  const { el } = H;
  async function folder({ title, sub, apps, back, look }) {
    const r = await H.requireLogin();
    H.header(title);
    const root = document.querySelector('main');
    const list = apps.filter((a) => !a.owner || r.user.role === 'owner');
    // drawn tools get one even ink outline (an SVG filter: dilate the shape, fill the ring in the text colour) – flat, like the line icons
    if (list.some((a) => a.art) && !document.getElementById('tool-ink')) {
      document.body.insertAdjacentHTML('beforeend', '<svg class="ink-defs" aria-hidden="true" focusable="false"><filter id="tool-ink" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
        + '<feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="d"/><feFlood class="ink"/><feComposite in2="d" operator="in" result="o"/>'
        + '<feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></svg>');
    }
    root.append(el('div', { class: 'folder' },
      back ? el('a', { class: 'folder-back', href: back.href }, '‹ ', back.label) : null,
      el('div', { class: 'folder-head' }, el('h1', {}, title), sub ? el('p', {}, sub) : null),
      el('nav', { class: 'apps-grid' + (look ? ' ' + look : ''), 'aria-label': title }, list.map((a, i) =>
        el('a', { class: 'app' + (a.soon ? ' later' : ''), href: a.href, style: `--c1:${a.c1};--c2:${a.c2};--n:${i}${a.tint ? ';--tint:' + a.tint : ''}`, 'data-guide': 'app-' + a.ic, 'data-guide-label': a.name },
          a.art
            // a drawn tool (a silhouette): pastel fill, a soft rounded outline
            ? el('span', { class: 'ic art', style: `--tint:${a.tint};--line:${a.line}` }, el('span', { class: 'shape', style: `-webkit-mask-image:url(${a.art});mask-image:url(${a.art})` }))
            : el('span', { class: 'ic' }, H.icon(a.ic)),
          el('span', { class: 'name' }, a.name), a.soon ? el('span', { class: 'soon' }, 'בקרוב') : null)))));
  }
  async function soonPage({ title, ic, c1, c2, back, text }) {
    await H.requireLogin();
    H.header(title);
    document.querySelector('main').append(el('div', { class: 'card soon-page', style: `--c1:${c1};--c2:${c2}` },
      el('span', { class: 'ic' }, H.icon(ic)), el('h1', {}, title),
      el('p', {}, text || 'האפליקציה הזו עוד בבנייה. נאפיין ונבנה אותה בקרוב.'),
      back ? el('a', { class: 'btn', href: back.href }, back.label) : null));
  }
  Object.assign(H, { folder, soonPage });
})();
