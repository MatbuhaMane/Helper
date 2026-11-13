/* Figure2D – the hub's simple companion figures (vision batch 5): drawn in 2D in the tent's style with the image tool,
   one picture per figure, and brought to life in code, as the campfire is. The picture is drawn with an empty face;
   the eyes, brows and mouth are vector, so they blink, look, talk and smile cleanly at any size. The head and the body are
   the same picture cut at the neck (a clip line), so the head can nod and lag behind the body's breathing.

     const f = await Figure2D.mount(element, 'fennec' | config, { size?: 160, look?: true, still?: false })   (still: an icon)
     f.talk(true | false)   the mouth moves while the companion speaks
     f.nod()  f.happy()  f.think(on)  f.sleep(on)
     f.special()        a special figure's own move (it also plays in happy()); f.sew('peg') sews a badge on the doll
     mount(…, { patches: ['peg', 'ember'] })   the doll wears the badges the person has
     mount(…, { skin: 'hanukkah' })            a skin, when the figure lists it in skins: [{ id, name, free?, season? }]
     mount(…, { hair: '#8a5a3a' }), f.setHair(c)  a figure with a hair layer (the seer): list() gives hair: [{ color, name }]
     mount(…, { palette: 2 }), f.setPalette(i)   a figure with clothing palettes: list() gives palettes: [{ index, name, swatch }]
     f.destroy()
     Figure2D.list()  → the catalogue (id, name, kind, unlock?, season?)

   A figure's folder, /figures/2d/<id>/: figure.webp (transparent, the face empty) and its entry in Figure2D.FIGURES below:
     neck   the cut, as a fraction of the height from the top (the head is everything above it)
     pivot  where the head turns, [x, y] fractions
     eyes   [[x, y], [x, y]] the eye centres; eyeR the eye radius (fraction of the width); eyeColor; gap between brows
     mouth  [x, y] its centre; mouthW its width (fraction of the width)
     cheek  a colour for the blush, or null
   Reduced motion (the device's or the person's, H.reducedMotion): it stands still, blinks rarely and talks with its mouth only. */
(() => {
  if (window.Figure2D) return;
  const BASE = '/figures/2d/';
  /** a badge's stand-in until its picture exists: a cloth patch with a dashed stitch and an emoji */
  const patchPlaceholder = (emoji) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#efe4cc" stroke="#9a8460" stroke-width="2.5" stroke-dasharray="5 4"/><text x="32" y="43" font-size="28" text-anchor="middle">${emoji}</text></svg>`);
  const FIGURES = {
    // the generic ones: free for everyone (docs/design/figures-2d.md; drawn with the image tool, 2026-11-13)
    fennec: { name: 'פנק', kind: 'generic', neck: 0.6, pivot: [0.5, 0.58], eyes: [[0.39, 0.47], [0.61, 0.47]], eyeR: 0.055, mouth: [0.5, 0.535], mouthW: 0.1, cheek: '#e89a7a', trait: 'toss' },
    owl: { name: 'ינשוף', kind: 'generic', neck: 0.57, pivot: [0.5, 0.55], eyes: [[0.335, 0.335], [0.665, 0.335]], eyeR: 0.105, eyeRing: '#fbf3df', mouth: [0.5, 0.445], mouthW: 0.07, mouthFill: '#c8862a', cheek: null, trait: 'owl' },
    hedgehog: { name: 'קיפוד', kind: 'generic', neck: 0.53, pivot: [0.5, 0.5], eyes: [[0.4, 0.38], [0.6, 0.38]], eyeR: 0.05, mouth: [0.5, 0.465], mouthW: 0.09, cheek: '#eaa092', trait: 'curl' },
    lamb: { name: 'טלה', kind: 'generic', neck: 0.53, pivot: [0.515, 0.5], eyes: [[0.42, 0.385], [0.61, 0.385]], eyeR: 0.05, mouth: [0.515, 0.465], mouthW: 0.09, cheek: '#eaa092', trait: 'pronk' },
    // people and characters (vision batch 6; likeness notes in the historic-figures skill), kind 'person'. paid: true for a
    // paid one (tier too); hideFor: the religion settings it is hidden for (the owner's call); tags: what settings may leave
    // out (horror). sway < 1: a gentler nod where a beard, a prop or a friend crosses the neck.
    ibnsina: { name: 'אבן סינא', kind: 'person', tier: 'free', neck: 0.56, pivot: [0.5, 0.54], eyes: [[0.38, 0.305], [0.62, 0.305]], eyeR: 0.042, mouth: [0.51, 0.43], mouthW: 0.06, cheek: null, sway: 0.7 },
    rambam: { name: 'הרמב"ם', kind: 'person', tier: 'free', neck: 0.57, pivot: [0.52, 0.55], eyes: [[0.41, 0.33], [0.63, 0.33]], eyeR: 0.042, mouth: [0.52, 0.47], mouthW: 0.06, cheek: null, sway: 0.7 },
    newton: { name: 'ניוטון', kind: 'person', tier: 'free', neck: 0.53, pivot: [0.53, 0.5], eyes: [[0.42, 0.32], [0.64, 0.32]], eyeR: 0.042, mouth: [0.53, 0.46], mouthW: 0.08, cheek: '#e8a08a', sway: 0.8 },
    juha: { name: "ג'וחא", kind: 'person', tier: 'free', neck: 0.55, pivot: [0.57, 0.53], eyes: [[0.46, 0.33], [0.68, 0.33]], eyeR: 0.042, mouth: [0.58, 0.44], mouthW: 0.06, cheek: '#e8a08a', sway: 0.5 },
    hershele: { name: 'הרשל׳ה', kind: 'person', tier: 'free', neck: 0.56, pivot: [0.49, 0.54], eyes: [[0.38, 0.335], [0.6, 0.335]], eyeR: 0.042, mouth: [0.495, 0.445], mouthW: 0.06, cheek: '#e8a08a', sway: 0.6 },
    scheherazade: { name: 'שחרזאדה', kind: 'person', tier: 'free', neck: 0.43, pivot: [0.48, 0.41], eyes: [[0.385, 0.285], [0.575, 0.285]], eyeR: 0.04, mouth: [0.48, 0.37], mouthW: 0.07, cheek: '#e89a86', sway: 0.6 },
    alibaba: { name: 'עלי באבא', kind: 'person', tier: 'free', neck: 0.57, pivot: [0.52, 0.55], eyes: [[0.4, 0.38], [0.63, 0.38]], eyeR: 0.042, mouth: [0.52, 0.52], mouthW: 0.06, cheek: null, sway: 0.6 },
    peterpan: { name: 'פיטר פן', kind: 'person', tier: 'free', neck: 0.55, pivot: [0.46, 0.53], eyes: [[0.36, 0.37], [0.56, 0.37]], eyeR: 0.048, mouth: [0.46, 0.47], mouthW: 0.08, cheek: '#ea9a86' },
    maryshelley: { name: 'מרי שלי', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.46, pivot: [0.5, 0.44], eyes: [[0.39, 0.3], [0.61, 0.3]], eyeR: 0.042, mouth: [0.5, 0.4], mouthW: 0.07, cheek: '#e89a86', sway: 0.7 },
    leonardo: { name: 'לאונרדו דה וינצ׳י', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.5, pivot: [0.52, 0.48], eyes: [[0.41, 0.335], [0.63, 0.335]], eyeR: 0.04, mouth: [0.52, 0.465], mouthW: 0.06, cheek: null, sway: 0.35 },
    cleopatra: { name: 'קליאופטרה', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.44, pivot: [0.52, 0.42], eyes: [[0.42, 0.3], [0.62, 0.3]], eyeR: 0.042, mouth: [0.52, 0.39], mouthW: 0.07, cheek: '#d98a7a', sway: 0.7 },
    // the special ones (paid, the owner's choice 2026-11-13): each has its own move – special() – which also plays when it is glad
    // the magician (renamed הקוסם, 2026-11-13): after the owner's picture, a kind old wizard of the desert, a white turban and
    // beard; drawn again taller and stronger, still old and warm
    magician: { name: 'הקוסם', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'dove', trickFrom: [0.46, 0.02],
      glowAt: [0.955, 0.285], glowColor: '#7fb4ff',
      neck: 0.265, pivot: [0.46, 0.25], eyes: [[0.385, 0.158], [0.53, 0.158]], eyeR: 0.028, mouth: [0.458, 0.236], mouthW: 0.04, cheek: '#c97a5e', sway: 0.3 },
    astronomer: { name: 'הרואה', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'stars',
      stars: [[0.2, 0.55], [0.27, 0.66], [0.17, 0.74], [0.25, 0.83], [0.79, 0.55], [0.74, 0.64], [0.83, 0.72], [0.77, 0.82], [0.32, 0.5], [0.68, 0.5],
        [0.14, 0.62], [0.86, 0.63], [0.21, 0.9], [0.8, 0.9], [0.3, 0.6], [0.7, 0.71], [0.12, 0.84], [0.88, 0.8], [0.35, 0.86], [0.66, 0.86]],
      // her hair: its own layer (hair.webp), white by default and tinted to the colour a person picks (the owner, 2026-11-13)
      hair: { default: '#ffffff', colors: [['#ffffff', 'לבן'], ['#c9ccd2', 'כסוף'], ['#4a4440', 'שחור'], ['#8a5a3a', 'חום'], ['#b0532e', 'ערמוני'], ['#d9743a', "ג'ינג'י"], ['#e8c27a', 'בלונד']] },
      neck: 0.45, pivot: [0.49, 0.43], eyes: [[0.41, 0.315], [0.58, 0.315]], eyeR: 0.038, mouth: [0.49, 0.4], mouthW: 0.065, cheek: '#e89a86', sway: 0.6 },
    doll: { name: 'בובת הטלאים', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'patches',
      slots: [[0.4, 0.585, 0.082], [0.38, 0.725, 0.082], [0.645, 0.725, 0.082], [0.17, 0.665, 0.066], [0.87, 0.665, 0.066], [0.4, 0.857, 0.06], [0.63, 0.857, 0.06], [0.515, 0.808, 0.058]],
      neck: 0.47, pivot: [0.52, 0.45], eyes: [[0.43, 0.3], [0.61, 0.3]], eyeR: 0.05, mouth: [0.52, 0.385], mouthW: 0.09, cheek: '#ea9a86', sway: 0.8 },
    // four more wizards (paid, the owner's choice 2026-11-13, after the owner's pictures): a spark from the staff when glad, a soft glow
    nightwizard: { name: 'קוסם הלילה', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'spark', sparkFrom: [0.885, 0.125], sparkColor: '#f6e7b0',
      // his cloak and robe in a colour of one's own (the owner, 2026-11-13)
      palettes: { layers: ['cloak', 'robe'], options: [{ name: 'שחור', swatch: '#26282b' }, { name: 'כחול חצות', cloak: '#1e2c5a', robe: '#4a5a7a' },
        { name: 'בורדו', cloak: '#4a1520', robe: '#6a4a50' }, { name: 'ירוק אמרלד', cloak: '#123a2c', robe: '#4a6a5a' }, { name: 'סגול מלכותי', cloak: '#33184a', robe: '#5a4a6a' }] },
      glowAt: [0.885, 0.125], glowColor: '#fff3c4',
      neck: 0.37, pivot: [0.48, 0.35], eyes: [[0.397, 0.245], [0.557, 0.245]], eyeR: 0.034, mouth: [0.47, 0.338], mouthW: 0.05, cheek: null, sway: 0.5 },
    forestwitch: { name: 'קוסמת היער', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'spark', sparkFrom: [0.12, 0.47], sparkColor: '#c49bff',
      // her hat and robe in a colour of one's own (the owner, 2026-11-13)
      palettes: { layers: ['robe', 'inner'], options: [{ name: 'סגול', swatch: '#4a2050' }, { name: 'ירוק יער', robe: '#2f6b4a', inner: '#1f3a30' },
        { name: 'בורדו', robe: '#7a2236', inner: '#2e1f3a' }, { name: 'כחול', robe: '#2a3f86', inner: '#1c2650' }, { name: 'דבש', robe: '#8a5a22', inner: '#3a2a20' }] },
      glowAt: [0.12, 0.47], glowColor: '#b98cff',
      neck: 0.6, pivot: [0.5, 0.58], eyes: [[0.41, 0.425], [0.59, 0.425]], eyeR: 0.044, mouth: [0.5, 0.51], mouthW: 0.07, cheek: '#ec9c8c', sway: 0.5 },
    // the little pair: the hat hides their eyes (no eyes drawn); a mouth shows only while they talk
    littlewizard: { name: 'הקוסם הקטן', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'spark', sparkFrom: [0.115, 0.445], sparkColor: '#ffd25a',
      glowAt: [0.115, 0.445], glowColor: '#ffd25a',
      neck: 0.56, pivot: [0.51, 0.54], eyes: [], eyeR: 0.04, mouth: [0.51, 0.475], mouthW: 0.06, mouthQuiet: true, cheek: null, sway: 0.3 },
    littlewitch: { name: 'הקוסמת הקטנה', kind: 'special', tier: 'paid', paid: true, hideFor: [], special: 'spark', sparkFrom: [0.12, 0.34], sparkColor: '#ffd25a',
      glowAt: [0.12, 0.34], glowColor: '#ffd25a',
      neck: 0.57, pivot: [0.49, 0.55], eyes: [], eyeR: 0.04, mouth: [0.485, 0.505], mouthW: 0.055, cheek: null, sway: 0.35 },
    // Dracula drawn again (the owner, 2026-11-13): young and handsome, the romantic gothic count – Cleopatra's counterpart
    dracula: { name: 'דרקולה', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.485, pivot: [0.5, 0.47], eyes: [[0.4, 0.315], [0.6, 0.315]], eyeR: 0.04, mouth: [0.5, 0.41], mouthW: 0.1, cheek: null, eyeColor: '#2a1418', sway: 0.45 },
  };
  // a palette for every figure, included (the owner, 2026-11-14: palettes are never sold, everyone gets them): its scarf,
  // shawl, vest, robe or coat in 5 colourways, the first as drawn; the tint layers are tint-<layer>.webp beside each
  // picture. The doll has none (her many patches are her look); the night wizard and the forest witch have theirs inline.
  const PALETTES = {
    fennec: { layers: ['scarf'], options: [{ name: 'אדום', swatch: '#a8322a' }, { name: 'ירוק זית', scarf: '#5f7a3a' }, { name: 'כחול', scarf: '#2f5a9a' }, { name: 'חרדל', scarf: '#c08a2a' }, { name: 'סגול', scarf: '#6a3a7a' }] },
    owl: { layers: ['shawl'], options: [{ name: 'ירוק', swatch: '#6a7a3a' }, { name: 'אדום', shawl: '#9a3a2a' }, { name: 'כחול', shawl: '#2f5a8a' }, { name: 'חרדל', shawl: '#b08a2a' }, { name: 'סגול', shawl: '#6a4a7a' }] },
    lamb: { layers: ['vest'], options: [{ name: 'ירוק', swatch: '#6a7a3a' }, { name: 'אדום', vest: '#9a3a2a' }, { name: 'כחול', vest: '#2f5a8a' }, { name: 'חרדל', vest: '#b08a2a' }, { name: 'סגול', vest: '#6a4a7a' }] },
    hedgehog: { layers: ['spines'], options: [{ name: 'חום', swatch: '#7a5a3a' }, { name: 'חול', spines: '#b8905a' }, { name: 'כסוף', spines: '#8c8a86' }, { name: 'שוקולד', spines: '#4a3428' }, { name: 'ערמון', spines: '#8a4a2a' }] },
    ibnsina: { layers: ['robe'], options: [{ name: 'ירוק', swatch: '#2f6a4a' }, { name: 'כחול', robe: '#2f5a8a' }, { name: 'בורדו', robe: '#7a2a36' }, { name: 'חום', robe: '#7a5a3a' }, { name: 'אפור כחלחל', robe: '#4a5a6a' }] },
    rambam: { layers: ['robe', 'cloak'], options: [{ name: 'כחול', swatch: '#2f4a8a' }, { name: 'ירוק ים', robe: '#2f6a5a', cloak: '#4a3a2a' }, { name: 'בורדו', robe: '#6a2a36', cloak: '#3a2a22' }, { name: 'סגול', robe: '#5a4a7a', cloak: '#2e2a3a' }, { name: 'דבש', robe: '#8a6a3a', cloak: '#4a3a2a' }] },
    newton: { layers: ['coat'], options: [{ name: 'חום', swatch: '#5a3a28' }, { name: 'כחול נייבי', coat: '#2a3a5a' }, { name: 'ירוק בקבוק', coat: '#2a4a3a' }, { name: 'בורדו', coat: '#5a2a2a' }, { name: 'אפור', coat: '#4a4a4e' }] },
    juha: { layers: ['robe'], options: [{ name: 'אפור-כחול', swatch: '#7a8a9a' }, { name: 'חול', robe: '#9a8a6a' }, { name: 'מרווה', robe: '#6a8a6a' }, { name: 'ורוד עתיק', robe: '#9a6a6a' }, { name: 'כחול', robe: '#5a6a9a' }] },
    hershele: { layers: ['coat'], options: [{ name: 'שחור', swatch: '#26282b' }, { name: 'חום', coat: '#3a2a1e' }, { name: 'אפור', coat: '#3a3c40' }, { name: 'כחול כהה', coat: '#1e2a4a' }, { name: 'ירוק כהה', coat: '#1e3a2c' }] },
    scheherazade: { layers: ['shawl', 'dress'], options: [{ name: 'אדום וכחול', swatch: '#a8442a' }, { name: 'טורקיז ויין', shawl: '#2a6a5a', dress: '#6a2a3a' }, { name: 'סגול ותכלת', shawl: '#6a3a8a', dress: '#2a4a6a' }, { name: 'זהב וכחול', shawl: '#c08a2a', dress: '#2a3a6a' }, { name: 'ורוד וירוק', shawl: '#9a3a5a', dress: '#3a5a4a' }] },
    alibaba: { layers: ['robe'], options: [{ name: 'לבן', swatch: '#f2efe6' }, { name: 'חול', robe: '#e6d6b8' }, { name: 'תכלת', robe: '#cfdcea' }, { name: 'ירוק בהיר', robe: '#d6e2c8' }, { name: 'ורוד', robe: '#ead2cc' }] },
    peterpan: { layers: ['leaves'], options: [{ name: 'סתיו', swatch: '#b8662a' }, { name: 'ירוק', leaves: '#5a8a3a' }, { name: 'ירוק כהה', leaves: '#3a6a3a' }, { name: 'זהב', leaves: '#c09a2a' }, { name: 'אדום', leaves: '#b02a22' }] },
    maryshelley: { layers: ['dress'], options: [{ name: 'ירוק כהה', swatch: '#2e3e30' }, { name: 'כחול לילה', dress: '#22304a' }, { name: 'בורדו', dress: '#4a1e26' }, { name: 'סגול', dress: '#3a2a4a' }, { name: 'חום', dress: '#4a3628' }] },
    leonardo: { layers: ['robe'], options: [{ name: 'חלודה', swatch: '#9a4a30' }, { name: 'כחול', robe: '#3a5a8a' }, { name: 'ירוק', robe: '#4a6a3a' }, { name: 'סגול', robe: '#5a3a6a' }, { name: 'חרדל', robe: '#a8822a' }] },
    cleopatra: { layers: ['dress'], options: [{ name: 'לבן', swatch: '#f2efe6' }, { name: 'תכלת', dress: '#d2e2ec' }, { name: 'זהב בהיר', dress: '#efe0b0' }, { name: 'טורקיז', dress: '#c8e6e0' }, { name: 'ורוד', dress: '#ecd2d6' }] },
    dracula: { layers: ['lining'], options: [{ name: 'אדום', swatch: '#7a1a2a' }, { name: 'סגול', lining: '#4a1a5a' }, { name: 'ירוק', lining: '#1a4a32' }, { name: 'כחול', lining: '#1a2a5a' }, { name: 'זהב', lining: '#8a6a1a' }] },
    magician: { layers: ['robe'], options: [{ name: 'כחול', swatch: '#2a5a7a' }, { name: 'ירוק', robe: '#2a5a3e' }, { name: 'בורדו', robe: '#6a2232' }, { name: 'סגול', robe: '#4a3270' }, { name: 'חום', robe: '#6a4a2a' }] },
    astronomer: { layers: ['shawl'], options: [{ name: 'כחול', swatch: '#2f4f78' }, { name: 'ירוק', shawl: '#2f5a48' }, { name: 'בורדו', shawl: '#6a2a3a' }, { name: 'סגול', shawl: '#4a3a6a' }, { name: 'אפור', shawl: '#4a4e56' }] },
    littlewizard: { layers: ['blue'], options: [{ name: 'כחול', swatch: '#6a8cb8' }, { name: 'ירוק', blue: '#6a9a72' }, { name: 'אדום', blue: '#b05a50' }, { name: 'סגול', blue: '#8a72b0' }, { name: 'צהוב', blue: '#c8a84a' }] },
    littlewitch: { layers: ['blue'], options: [{ name: 'כחול', swatch: '#6a8cb8' }, { name: 'ירוק', blue: '#6a9a72' }, { name: 'אדום', blue: '#b05a50' }, { name: 'סגול', blue: '#8a72b0' }, { name: 'צהוב', blue: '#c8a84a' }] },
  };
  for (const [id, p] of Object.entries(PALETTES)) if (FIGURES[id]) FIGURES[id].palettes = p;
  const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // the engine brings its own look: figure2d.css, once per page (a page may still link it itself)
  function ensureCss() {
    if (document.querySelector('link[href*="figure2d.css"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/figure2d.css'; document.head.append(l);
  }
  async function mount(host, which, opts = {}) {
    ensureCss();
    const cfg = typeof which === 'string' ? { id: which, ...FIGURES[which] } : which;
    if (!cfg || !cfg.neck) throw new Error('Figure2D: no such figure ' + which);
    // a skin (business, 2026-11-13): another picture of the same figure – a holiday outfit, another coat – drawn to the same
    // outline, so the face config still fits; /figures/2d/<id>/skin-<skin>.webp
    const skin = opts.skin && (cfg.skins || []).some((k) => k.id === opts.skin) ? opts.skin : null;
    const src = cfg.src || `${BASE}${cfg.id}/${skin ? 'skin-' + skin : 'figure'}.webp`;
    const img = new Image(); img.decoding = 'async'; img.src = src;
    // load, not decode: decode() can wait forever in a background tab; a slow network never holds the page up for long
    await new Promise((ok) => { if (img.complete && img.naturalWidth) return ok(); img.onload = img.onerror = () => ok(); setTimeout(ok, 5000); });
    const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    const W = 100, Hh = 100 * ratio;                       // the figure's own units: 100 wide
    const box = document.createElement('div');
    box.className = 'f2';
    box.style.setProperty('--f2-size', (opts.size || 160) + 'px');
    box.style.setProperty('--f2-ratio', ratio);
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', cfg.name || 'הדמות');
    // the two cuts of the same picture
    const body = document.createElement('div'); body.className = 'f2-body';
    const head = document.createElement('div'); head.className = 'f2-head';
    for (const [layer, clip] of [[body, `inset(${(cfg.neck * 100 - 1.5).toFixed(2)}% 0 0 0)`], [head, `inset(0 0 ${((1 - cfg.neck) * 100 - 1.5).toFixed(2)}% 0)`]]) {
      const i = img.cloneNode(); i.alt = ''; i.draggable = false; i.className = 'f2-pic'; i.style.clipPath = clip;
      layer.append(i);
    }
    // tint layers: the hair or a fabric drawn again on top and coloured, multiply keeping its light and shade. hair.webp is
    // the hair as white (white = as drawn); tint-<key>.webp is a fabric as grey, its own mean stored at 1/1.6, so the chosen
    // colour × 1.6 gives that colour on the mean and the folds around it. null = the drawing as it is.
    const tints = {};
    const loadPic = (src) => new Promise((ok) => { const i = new Image(); i.src = src; i.onload = i.onerror = () => ok(i); setTimeout(() => ok(i), 5000); });
    const lift = (c, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
    const tint = (key, c) => {
      const t = tints[key]; if (!t) return;
      for (const cv of t.cans) {
        const x = cv.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, cv.width, cv.height);
        if (!c) continue;
        x.drawImage(t.pic, 0, 0);
        if (t.gain !== 1 || !/^#?f{3}(f{3})?$/i.test(c)) {
          x.globalCompositeOperation = 'multiply'; x.fillStyle = t.gain === 1 ? c : lift(c, t.gain); x.fillRect(0, 0, cv.width, cv.height);
          x.globalCompositeOperation = 'destination-in'; x.drawImage(t.pic, 0, 0);
        }
      }
    };
    const want = [];
    if (cfg.hair) want.push(['hair', 'hair.webp', 1]);
    for (const k of cfg.palettes?.layers || []) want.push([k, `tint-${k}.webp`, 1.6]);
    (await Promise.all(want.map(([, f]) => loadPic(`${BASE}${cfg.id}/${f}`)))).forEach((pic, n) => {
      if (!pic.naturalWidth) return;
      const [key, , gain] = want[n];
      const cans = [body, head].map((layer) => {
        const cv = document.createElement('canvas'); cv.width = pic.naturalWidth; cv.height = pic.naturalHeight; cv.className = 'f2-pic f2-tint';
        cv.style.clipPath = layer.firstChild.style.clipPath; layer.append(cv); return cv;
      });
      tints[key] = { pic, cans, gain };
    });
    const setHair = (c) => tint('hair', c || cfg.hair?.default);
    // a palette: one colour per fabric layer; the first option is the drawing as it is
    const setPalette = (i) => {
      const o = cfg.palettes?.options[+i || 0]; if (!o) return;
      for (const k of cfg.palettes.layers) tint(k, o[k] || null);
    };
    if (cfg.hair) setHair(opts.hair);
    if (cfg.palettes) setPalette(opts.palette);
    head.style.transformOrigin = `${cfg.pivot[0] * 100}% ${cfg.pivot[1] * 100}%`;
    // the face: vector eyes, brows and mouth, inside the head so they move with it
    const face = svgEl('svg', { class: 'f2-face', viewBox: `0 0 ${W} ${Hh}`, 'aria-hidden': 'true' });
    const ink = cfg.eyeColor || '#2e2a1e';
    const er = (cfg.eyeR || 0.07) * W;
    const eyes = cfg.eyes.map(([x, y]) => {
      const g = svgEl('g', { class: 'f2-eye', transform: `translate(${x * W} ${y * Hh})` });
      if (cfg.eyeRing) g.append(svgEl('circle', { r: er * 1.55, fill: cfg.eyeRing, opacity: '.9' }));
      const lid = svgEl('g', { class: 'f2-lid' });
      lid.append(svgEl('ellipse', { rx: er, ry: er * 1.12, fill: ink }));
      const look = svgEl('g', { class: 'f2-look' });
      look.append(svgEl('circle', { cx: er * 0.32, cy: -er * 0.38, r: er * 0.34, fill: '#fff' }), svgEl('circle', { cx: -er * 0.3, cy: er * 0.34, r: er * 0.13, fill: '#fff', opacity: '.8' }));
      lid.append(look);
      // the happy eye (^): shown instead of the round one when it is glad
      const glad = svgEl('path', { class: 'f2-glad', d: `M ${-er} ${er * 0.35} Q 0 ${-er * 1.1} ${er} ${er * 0.35}`, fill: 'none', stroke: ink, 'stroke-width': er * 0.42, 'stroke-linecap': 'round' });
      g.append(lid, glad);
      face.append(g);
      return { g, lid, look };
    });
    if (cfg.cheek) for (const [x, y] of cfg.eyes) face.append(svgEl('ellipse', { class: 'f2-cheek', cx: x * W + (x < 0.5 ? -er * 0.4 : er * 0.4), cy: y * Hh + er * 1.9, rx: er * 0.95, ry: er * 0.55, fill: cfg.cheek }));
    const [mx, my] = cfg.mouth, mw = (cfg.mouthW || 0.12) * W;
    const mouth = svgEl('path', { class: 'f2-mouth', fill: cfg.mouthFill || '#7a2a22', stroke: ink, 'stroke-width': er * 0.32, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    face.append(mouth);
    head.append(face);
    box.append(body, head);
    // the special ones: their own layer
    const fx = document.createElement('div'); fx.className = 'f2-fx';
    if (cfg.special === 'stars') {
      // the astronomer's shawl: stars that wake at night and twinkle, each at its own pace
      const sky = document.createElement('div'); sky.className = 'f2-stars';
      cfg.stars.forEach(([x, y], i) => { const st = document.createElement('i'); st.style.cssText = `left:${x * 100}%;top:${y * 100}%;--tw:${(2.2 + (i * 0.37) % 2.4).toFixed(2)}s;--d:${(-(i * 0.53) % 3).toFixed(2)}s`; sky.append(st); });
      body.append(sky);
    }
    const patches = [];
    const sew = (badge, fresh) => {
      // the doll: a badge sewn on a free spot, a stitched ring round it
      const slot = cfg.slots?.[patches.length]; if (!slot) return false;
      const p = document.createElement('span'); p.className = 'f2-patch' + (fresh ? ' fresh' : '');
      p.style.cssText = `left:${slot[0] * 100}%;top:${slot[1] * 100}%;width:${slot[2] * 200}%`;
      const im = document.createElement('img'); im.alt = ''; im.src = `/assets/badges/${badge}.webp`; im.draggable = false;
      // a badge whose picture design has not drawn yet (the tools' badges): a stitched patch with an emoji, never a broken image
      im.onerror = () => { im.onerror = null; im.src = patchPlaceholder(badge.startsWith('tool_') ? '🧭' : '⭐'); };
      p.append(im); body.append(p); patches.push(badge); return true;
    };
    if (cfg.special === 'patches') (opts.patches || []).forEach((b) => sew(b, false));
    if (cfg.glowAt) { const g = document.createElement('i'); g.className = 'f2-glow'; g.style.cssText = `left:${cfg.glowAt[0] * 100}%;top:${cfg.glowAt[1] * 100}%;--c:${cfg.glowColor || '#ffd25a'}`; fx.append(g); }
    box.append(fx);
    host.append(box);

    /* ---------- the mouth: a smile that opens (o: 0 closed … 1 open) ---------- */
    let o = 0, smile = 1;
    const drawMouth = () => {
      const x0 = mx * W - mw / 2, x1 = mx * W + mw / 2, y = my * Hh;
      const curve = mw * 0.28 * smile, open = mw * 0.55 * o;
      mouth.setAttribute('d', o < 0.04
        ? `M ${x0} ${y} Q ${mx * W} ${y + curve} ${x1} ${y}`
        : `M ${x0} ${y} Q ${mx * W} ${y + curve * 0.4} ${x1} ${y} Q ${mx * W} ${y + curve + open * 1.6} ${x0} ${y} Z`);
      mouth.setAttribute('fill', o < 0.04 ? 'none' : (cfg.mouthFill || '#7a2a22'));
      if (cfg.mouthQuiet) mouth.style.opacity = o < 0.04 ? '0' : '1';   // behind a beard or under a hat: seen only while talking
    };
    drawMouth();

    /* ---------- the life: one loop for breathing, the head's spring, the eyes and the mouth ---------- */
    let raf = 0, last = 0, t0 = performance.now(), talking = false, mood = 'idle', nodUntil = 0, hop = 0;
    let headA = 0, headV = 0, lookX = 0, lookY = 0, lx = 0, ly = 0, nextBlink = t0 + rnd(1800, 4200), blinkT = -1, talkPhase = 0;
    const still = () => reduce();
    function frame(now) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const t = (now - t0) / 1000;
      // breathing: the body rises a little; the head follows on a spring (it lags and overshoots)
      const breath = still() ? 0 : Math.sin(t * 2 * Math.PI / 3.6);
      const lift = hop > 0 ? Math.sin(Math.min(1, hop) * Math.PI) * 10 : 0;
      if (hop > 0) hop = Math.max(0, hop - dt * 2.2);
      body.style.transform = `translateY(${-lift}%) scale(${1 + breath * 0.012}, ${1 - breath * 0.012 + (hop > 0.85 ? -0.06 : 0)})`;
      let target = still() ? 0 : breath * 1.6 + (now < nodUntil ? Math.sin((nodUntil - now) / 1000 * 2 * Math.PI * 2.2) * 9 : 0) + (mood === 'think' ? (cfg.trait === 'owl' ? 16 : 7) : 0) + (mood === 'sleep' ? 12 : 0);
      target *= (cfg.sway ?? 1);   // a long beard, a prop or a friend across the neck: a gentler nod, so the cut never shows
      headV += ((target - headA) * 90 - headV * 11) * dt; headA += headV * dt;
      head.style.transform = `translateY(${(-lift - breath * 0.6).toFixed(2)}%) rotate(${headA.toFixed(2)}deg)`;
      // the eyes: blink now and then; look toward the pointer (or wander a little)
      if (now >= nextBlink && blinkT < 0 && mood !== 'sleep') blinkT = 0;
      let lidS = mood === 'sleep' ? 0.08 : 1;
      if (blinkT >= 0) { blinkT += dt; const k = blinkT / (cfg.trait === 'owl' ? 0.34 : 0.16); lidS = k < 1 ? 1 - Math.sin(k * Math.PI) * 0.92 : 1; if (k >= 1) { blinkT = -1; nextBlink = now + (still() ? rnd(5000, 9000) : rnd(1800, 5200)) * (Math.random() < 0.15 ? 0.2 : 1); } }
      lx += (lookX - lx) * Math.min(1, dt * 6); ly += (lookY - ly) * Math.min(1, dt * 6);
      for (const e of eyes) { e.lid.setAttribute('transform', `scale(1 ${lidS.toFixed(3)})`); e.look.setAttribute('transform', `translate(${(lx * er * 0.32).toFixed(2)} ${(ly * er * 0.28).toFixed(2)})`); }
      // the mouth: while talking, it opens and closes in syllables
      if (talking) { talkPhase += dt * rnd(7, 11); o = Math.max(0, Math.sin(talkPhase)) * rnd(0.55, 1); }
      else o += (0 - o) * Math.min(1, dt * 12);
      drawMouth();
      raf = requestAnimationFrame(frame);
    }
    const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    // as an icon (opts.still): drawn once, no life of its own
    if (opts.still) {
      box.classList.add('still');
      const noop = () => {};
      return { el: box, talk: noop, nod: noop, happy: noop, think: noop, sleep: noop, destroy() { box.remove(); } };
    }
    // pause when off screen or in a hidden tab
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? run() : stop()));
    io.observe(box);
    const vis = () => (document.hidden ? stop() : run());
    document.addEventListener('visibilitychange', vis);
    // the pointer: the eyes follow it
    const onMove = (e) => {
      if (opts.look === false) return;
      const r = box.getBoundingClientRect();
      lookX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 2)));
      lookY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.35)) / (r.height * 2)));
    };
    addEventListener('pointermove', onMove, { passive: true });
    // its own move: the magician's dove, a shooting star over the astronomer, the doll's patches shining
    function special() {
      if (still()) return;
      const sparks = (n, x, y, c) => {
        for (let i = 0; i < n; i++) {
          const k = document.createElement('i'); k.className = 'f2-spark';
          k.style.cssText = `left:${x * 100}%;top:${y * 100}%;--dx:${(Math.cos(i / n * 6.283) * 34).toFixed(0)}px;--dy:${(Math.sin(i / n * 6.283) * 34 - 10).toFixed(0)}px;--delay:${i * 40}ms${c ? ';--c:' + c : ''}`;
          fx.append(k); setTimeout(() => k.remove(), 1200);
        }
      };
      if (cfg.special === 'dove') {
        const [x, y] = cfg.trickFrom;
        sparks(9, x, y);
        const d = document.createElement('img'); d.className = 'f2-dove'; d.alt = ''; d.src = `${BASE}${cfg.id}/dove.webp`;
        d.style.left = x * 100 + '%'; d.style.top = y * 100 + '%'; fx.append(d);
        d.animate([{ transform: 'translate(-50%, -30%) scale(.15)', opacity: 0 }, { transform: 'translate(-50%, -80%) scale(.9)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-160%, -190%) scale(.75) rotate(-8deg)', opacity: 1, offset: 0.75 }, { transform: 'translate(-230%, -260%) scale(.6) rotate(-14deg)', opacity: 0 }],
        { duration: 1700, easing: 'cubic-bezier(.3,.7,.3,1)' }).onfinish = () => d.remove();
      } else if (cfg.special === 'stars') {
        const k = document.createElement('i'); k.className = 'f2-shoot'; fx.append(k); setTimeout(() => k.remove(), 1300);
        box.classList.add('starlit'); clearTimeout(special.t); special.t = setTimeout(() => box.classList.remove('starlit'), 2600);
      } else if (cfg.special === 'spark') {
        const [x, y] = cfg.sparkFrom; sparks(12, x, y, cfg.sparkColor);
        box.classList.add('sparking'); clearTimeout(special.t); special.t = setTimeout(() => box.classList.remove('sparking'), 1200);
      } else if (cfg.special === 'patches') {
        box.classList.add('proud'); clearTimeout(special.t); special.t = setTimeout(() => box.classList.remove('proud'), 1400);
      }
    }
    // a touch: it squashes, hops and is glad (and a special one does its move)
    const happy = (ms = 1100) => {
      box.classList.add('glad'); smile = 1.5; if (!still()) hop = 1;
      clearTimeout(happy.t); happy.t = setTimeout(() => { box.classList.remove('glad'); smile = 1; }, ms);
      if (cfg.special) special();
      if (still()) return;
      if (cfg.trait === 'toss') headV += 160;
      else if (cfg.trait === 'pronk') { hop = 1.25; clearTimeout(happy.p); happy.p = setTimeout(() => { hop = 1; }, 430); }
      else if (cfg.trait === 'curl') { box.classList.remove('curl'); void box.offsetWidth; box.classList.add('curl'); clearTimeout(happy.c); happy.c = setTimeout(() => box.classList.remove('curl'), 760); }
    };
    box.addEventListener('pointerdown', () => { happy(); navigator.vibrate?.(8); });

    return {
      el: box,
      talk(on) { talking = !!on; if (on) talkPhase = 0; },
      nod() { if (!still()) nodUntil = performance.now() + 900; },
      happy, special,
      /** the doll: sew a newly earned badge on (it stitches itself in); false when there is no room left */
      sew(badge) { return sew(badge, true); },
      /** a figure with its own hair layer (cfg.hair): tint it, e.g. f.setHair('#8a5a3a'); white or nothing = as drawn */
      setHair,
      /** a figure with palettes (cfg.palettes): f.setPalette(2); 0 = as drawn */
      setPalette,
      think(on) { mood = on ? 'think' : 'idle'; box.classList.toggle('thinking', !!on); },
      sleep(on) { mood = on ? 'sleep' : 'idle'; box.classList.toggle('sleeping', !!on); },
      destroy() { stop(); io.disconnect(); document.removeEventListener('visibilitychange', vis); removeEventListener('pointermove', onMove); box.remove(); },
    };
  }
  const list = () => Object.entries(FIGURES).map(([id, f]) => ({ id, name: f.name, kind: f.kind, tier: f.tier || 'free', paid: !!f.paid, hideFor: f.hideFor || [], tags: f.tags || [], unlock: f.unlock || null, season: f.season || null, skins: f.skins || [], hair: f.hair ? f.hair.colors.map(([color, name]) => ({ color, name })) : null, hairDefault: f.hair?.default || null,
    palettes: f.palettes ? f.palettes.options.map((o, index) => ({ index, name: o.name, swatch: o.swatch || o[f.palettes.layers[0]] })) : null }));
  // the default companion for every family but the owner's (who has Ibn Ezra): the owner's choice, 2026-11-13
  const DEFAULT = 'fennec';
  /** Only the head, in a round window (a profile's avatar, the assistant's tab): the figure drawn larger and moved so its
      eyes sit a little above the window's middle; the host is the window (its size: opts.size, px). */
  async function mountHead(host, which, opts = {}) {
    const S = opts.size || 64, cfg = typeof which === 'string' ? FIGURES[which] : which;
    if (!cfg) throw new Error('Figure2D: no such figure ' + which);
    const k = opts.zoom || 1.85, inner = Math.round(S * k);
    host.style.cssText += `;position:relative;overflow:hidden;border-radius:50%;inline-size:${S}px;block-size:${S}px`;
    const f = await mount(host, which, { ...opts, size: inner });
    const r = parseFloat(f.el.style.getPropertyValue('--f2-ratio')) || 1;
    const ex = cfg.eyes?.length ? cfg.eyes.reduce((a, e) => a + e[0], 0) / cfg.eyes.length : cfg.mouth[0];
    const ey = cfg.eyes?.length ? cfg.eyes[0][1] : cfg.mouth[1] - 0.05;
    f.el.style.position = 'absolute';
    f.el.style.left = `${Math.round(S / 2 - ex * inner)}px`;
    f.el.style.top = `${Math.round(S * 0.46 - ey * inner * r)}px`;
    f.el.classList.add('f2-headonly');
    return f;
  }
  window.Figure2D = { mount, mountHead, list, FIGURES, DEFAULT };
})();
