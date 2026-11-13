/* The companion: a small animated 3D animal that lives on the screen, Clippy-style.
 * It walks around the page, looks at the cursor, points at things, can be dragged, falls asleep when left alone,
 * talks from a speech balloon, and rebuilds itself into any animal Claude describes (ears, tail, snout, colours...).
 * The conversation logic is the same as before: it runs the helper's apps for you through Claude. */
(() => {
  'use strict';
  const { el, api, toast } = H;
  const THREE_URL = '/vendor/three.module.min.js'; // three@0.160.0, served with the app
  // Per person, synced through the server (the old per-device copy is carried over once). Where he stands stays per device.
  // follow: he left his tent and comes along to every screen; minimized: folded into a small tab with his face.
  // rate: how fast he reads aloud. The defaults live in common.js, which reads these prefs first (to decide whether to bring him at all).
  const prefs = H.prefs('daemon', H.DAEMON_DEFAULTS, 'helper.daemon.prefs');
  const savePrefs = () => H.savePrefs('daemon');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state = null; // { daemon, transcript, ai }
  let busy = false;

  /* ===================== bodies ===================== */
  const DEFAULT = { stance: 'four_legs', build: 'round', ears: 'round', tail: 'short', snout: 'short', wings: false, horns: 'none', pattern: 'plain', main: '#c2b04e', belly: '#f4ecd0', accent: '#55622f', eyes: '#2e2a1e' };
  // For shapes saved before bodies existed (or if a body is missing), a few common animals.
  const PRESETS = {
    'red-fox': { stance: 'four_legs', build: 'medium', ears: 'pointy', tail: 'bushy', snout: 'long', pattern: 'plain', main: '#d9692b', belly: '#fbf3e6', accent: '#2b1d14', eyes: '#3b2310' },
    fox: 'red-fox',
    cat: { stance: 'four_legs', build: 'small', ears: 'pointy', tail: 'long', snout: 'short', pattern: 'stripes', main: '#9a8f86', belly: '#efe8de', accent: '#4a423c', eyes: '#7a9a3a' },
    dog: { stance: 'four_legs', build: 'medium', ears: 'floppy', tail: 'thin', snout: 'long', pattern: 'plain', main: '#c99a5b', belly: '#f3e6cf', accent: '#6b4a2a', eyes: '#3a2410' },
    ox: { stance: 'four_legs', build: 'large', ears: 'round', tail: 'thin', snout: 'flat', horns: 'curved', pattern: 'plain', main: '#6b4a33', belly: '#a47c5c', accent: '#e8dcc0', eyes: '#1e140c' },
    owl: { stance: 'two_legs', build: 'round', ears: 'tufts', tail: 'fan', snout: 'beak', wings: true, pattern: 'spots', main: '#8a6a4a', belly: '#e9dcc4', accent: '#e0a83a', eyes: '#f0b020' },
    rabbit: { stance: 'four_legs', build: 'small', ears: 'long', tail: 'short', snout: 'short', pattern: 'plain', main: '#d9d2c8', belly: '#fbf8f3', accent: '#e8a5a5', eyes: '#3a2818' },
    penguin: { stance: 'two_legs', build: 'round', ears: 'none', tail: 'short', snout: 'beak', wings: true, pattern: 'plain', main: '#262a30', belly: '#f7f6f0', accent: '#f0a030', eyes: '#111111' },
    dragon: { stance: 'four_legs', build: 'long', ears: 'pointy', tail: 'long', snout: 'long', wings: true, horns: 'small', pattern: 'spots', main: '#3f7a4a', belly: '#c8d98a', accent: '#c2b04e', eyes: '#e0a020' },
    lion: { stance: 'four_legs', build: 'large', ears: 'round', tail: 'thin', snout: 'short', pattern: 'mask', main: '#d9a55a', belly: '#f3e2bf', accent: '#8a4a1c', eyes: '#7a4a10' },
  };
  function bodyFor(form) {
    if (form?.body?.figure || (form?.slug || '').startsWith('figure-')) return { figure: form.body?.figure || form.slug.slice(7) };
    let b = form?.body;
    if (!b || !b.main) {
      let p = PRESETS[form?.slug] || PRESETS[(form?.slug || '').split('-').pop()];
      if (typeof p === 'string') p = PRESETS[p];
      b = { ...(p || {}), ...(b || {}) };
    }
    const out = { ...DEFAULT, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== '' && v != null)) };
    return out;
  }

  /* ===================== figures (glTF models made in Blender, see figures/) ===================== */
  const figures = {};
  async function loadFigure(name) {
    if (!figures[name]) {
      const { GLTFLoader } = await import('/vendor/GLTFLoader.js');
      figures[name] = new GLTFLoader().loadAsync(`/figures/${name}.glb`);
    }
    return figures[name];
  }

  /* ===================== 3D ===================== */
  let THREE, renderer, scene, camera, rig, parts = {}, mats = {};
  let canvasBox, balloon, sleepBadge;

  async function initThree() {
    THREE = await import(THREE_URL);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.3, 6.4);
    camera.lookAt(0, 1.12, 0);
    scene.add(new THREE.HemisphereLight(0xfff6e2, 0x8a7a55, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2.5, 4, 4);
    scene.add(key);
    const front = new THREE.DirectionalLight(0xfff4e6, 0.9);   // a soft fill from the viewer, so faces never sit in shadow
    front.position.set(0.5, 1.8, 6);
    scene.add(front);
    const rim = new THREE.DirectionalLight(0xdceaf1, 0.9);
    rim.position.set(3, 2, -3);
    scene.add(rim);
    // Soft contact shadow under the feet.
    const sh = document.createElement('canvas');
    sh.width = sh.height = 64;
    const g = sh.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(46,42,30,0.45)');
    grad.addColorStop(1, 'rgba(46,42,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    scene.add(shadow);
    parts.shadow = shadow;
  }

  const mat = (color, opts = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5), ...opts });
  const sphere = (r, m, seg = 28) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);
  const pivot = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

  /** Build the animal from its parts. Everything hangs off `rig` (feet at y=0, facing +z, the camera). */
  function build(b) {
    if (rig) { scene.remove(rig); if (!rig.userData.figure) rig.traverse((o) => { o.geometry?.dispose(); }); }
    if (b.figure) { buildFigure(b.figure); return; }
    renderer.toneMappingExposure = 1.05;
    parts = { shadow: parts.shadow };
    rig = new THREE.Group();
    scene.add(rig);
    mats = { main: mat(b.main), belly: mat(b.belly), accent: mat(b.accent), dark: mat('#1c1812', { roughness: 0.35, sheen: 0 }), eye: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1 }), iris: new THREE.MeshPhysicalMaterial({ color: b.eyes, roughness: 0.2, clearcoat: 1 }), glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }), horn: mat('#efe6cf', { sheen: 0 }), blush: new THREE.MeshBasicMaterial({ color: '#f2a6a0', transparent: true, opacity: 0.45 }) };

    const biped = b.stance === 'two_legs';
    const legless = b.stance === 'no_legs';
    const S = { small: 0.82, medium: 1, large: 1.14, long: 1, round: 0.95 }[b.build] || 1;
    const long = b.build === 'long' ? 1.3 : 1;
    const round = b.build === 'round' ? 1.15 : 1;
    const legH = legless ? 0 : biped ? 0.22 : 0.42 * S;

    const body = pivot(0, legH + 0.42 * S, 0);
    rig.add(body);
    parts.body = body;
    const torso = sphere(0.5, mats.main, 36);
    if (biped) torso.scale.set(0.95 * round, 1.12, 0.9 * round);
    else if (legless) torso.scale.set(0.8, 0.55, 1.7);
    else torso.scale.set(0.95 * round, 0.82 * round, 1.12 * long);
    torso.scale.multiplyScalar(S);
    body.add(torso);
    const belly = sphere(0.42, mats.belly, 28);
    belly.scale.copy(torso.scale).multiply(new THREE.Vector3(0.82, 0.8, 0.5));
    belly.position.set(0, biped ? -0.06 : -0.12 * S, (biped ? 0.24 : 0.3 * long) * S);
    body.add(belly);
    addPattern(b, body, torso.scale, S, biped);

    // Head: above the torso for bipeds, in front and up for quadrupeds.
    const head = pivot(0, biped ? 0.62 * S : 0.38 * S, biped ? 0.06 : 0.5 * S * long);
    body.add(head);
    parts.head = head;
    const skull = sphere(0.4 * S, mats.main, 36);
    skull.scale.set(1, 0.94, 0.96);
    head.add(skull);
    const face = sphere(0.33 * S, mats.belly, 28);
    face.scale.set(1, 0.85, 0.6);
    face.position.set(0, -0.06 * S, 0.17 * S);
    head.add(face);
    if (b.pattern === 'mask') { const m = sphere(0.3 * S, mats.accent, 24); m.scale.set(1.25, 0.5, 0.5); m.position.set(0, 0.05 * S, 0.2 * S); head.add(m); }
    if (b.pattern === 'mask' && b.build === 'large') { // a mane
      const mane = sphere(0.56 * S, mats.accent, 28); mane.scale.set(1, 1, 0.7); mane.position.z = -0.08 * S; head.add(mane);
    }

    // Eyes (with a glint each: what makes them look alive).
    parts.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = pivot(sx * 0.15 * S, 0.06 * S, 0.3 * S);
      const white = sphere(0.085 * S, mats.eye, 20);
      const iris = sphere(0.058 * S, mats.iris, 18); iris.position.z = 0.04 * S;
      const pupil = sphere(0.032 * S, mats.dark, 14); pupil.position.z = 0.072 * S;
      const glint = sphere(0.013 * S, mats.glint, 8); glint.position.set(-0.02 * S, 0.025 * S, 0.095 * S);
      eye.add(white, iris, pupil, glint);
      head.add(eye);
      parts.eyes.push(eye);
      const blush = sphere(0.05 * S, mats.blush, 12); blush.scale.set(1.3, 0.6, 0.4); blush.position.set(sx * 0.24 * S, -0.1 * S, 0.27 * S); head.add(blush);
    }

    // Snout, nose and mouth.
    const snout = pivot(0, -0.1 * S, 0.3 * S);
    head.add(snout);
    parts.mouth = null;
    if (b.snout === 'beak') {
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075 * S, 0.2 * S, 18), mats.accent);
      beak.rotation.x = Math.PI / 2; beak.position.z = 0.08 * S; snout.add(beak);
      parts.mouth = beak;
    } else if (b.snout === 'trunk') {
      const segs = []; let parent = snout;
      for (let i = 0; i < 5; i++) {
        const seg = pivot(0, i ? -0.09 * S : 0, i ? 0.02 * S : 0.06 * S);
        seg.add(sphere((0.085 - i * 0.01) * S, mats.main, 16));
        parent.add(seg); parent = seg; segs.push(seg);
      }
      parts.trunk = segs;
    } else {
      const len = { short: 0.7, long: 1.35, flat: 0.55 }[b.snout] || 1;
      const muzzle = sphere(0.16 * S, mats.belly, 20);
      muzzle.scale.set(b.snout === 'flat' ? 1.5 : 1.15, 0.8, len);
      muzzle.position.z = 0.06 * S * len;
      snout.add(muzzle);
      const nose = sphere(0.05 * S, mats.dark, 14); nose.scale.set(1.3, 0.85, 0.8);
      nose.position.set(0, 0.05 * S, 0.06 * S + 0.15 * S * len); snout.add(nose);
      const mouth = sphere(0.04 * S, mats.dark, 12); mouth.scale.set(1.4, 0.25, 0.5);
      mouth.position.set(0, -0.07 * S, 0.04 * S + 0.13 * S * len); snout.add(mouth);
      parts.mouth = mouth;
    }

    // Ears.
    parts.ears = [];
    for (const sx of [-1, 1]) {
      const ear = pivot(sx * 0.24 * S, 0.3 * S, -0.02 * S);
      let m;
      if (b.ears === 'pointy') { m = new THREE.Mesh(new THREE.ConeGeometry(0.12 * S, 0.3 * S, 18), mats.main); m.position.y = 0.12 * S; const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07 * S, 0.2 * S, 14), mats.accent); inner.position.set(0, 0.1 * S, 0.04 * S); ear.add(inner); ear.rotation.z = -sx * 0.32; }
      else if (b.ears === 'round') { m = sphere(0.12 * S, mats.main, 18); m.scale.set(1, 1, 0.45); m.position.y = 0.05 * S; ear.rotation.z = -sx * 0.5; }
      else if (b.ears === 'long') { m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07 * S, 0.42 * S, 6, 14), mats.main); m.scale.z = 0.5; m.position.y = 0.27 * S; const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.04 * S, 0.34 * S, 6, 12), mats.accent); inner.position.set(0, 0.27 * S, 0.03 * S); inner.scale.z = 0.4; ear.add(inner); ear.rotation.z = -sx * 0.18; }
      else if (b.ears === 'floppy') { m = sphere(0.13 * S, mats.accent, 18); m.scale.set(0.6, 1.5, 0.35); m.position.set(sx * 0.06 * S, -0.16 * S, 0); ear.position.y = 0.16 * S; ear.position.x = sx * 0.33 * S; }
      else if (b.ears === 'tufts') { m = new THREE.Mesh(new THREE.ConeGeometry(0.06 * S, 0.22 * S, 12), mats.main); m.position.y = 0.08 * S; ear.rotation.z = -sx * 0.6; }
      if (m) { ear.add(m); head.add(ear); parts.ears.push(ear); }
    }

    // Horns.
    if (b.horns !== 'none') {
      for (const sx of b.horns === 'unicorn' ? [0] : [-1, 1]) {
        const h = pivot(sx * 0.17 * S, 0.33 * S, 0.05 * S);
        if (b.horns === 'antlers') {
          for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * S, 0.025 * S, 0.24 * S, 8), mats.horn); t.position.set(sx * 0.05 * i * S, 0.1 * S + i * 0.08 * S, 0); t.rotation.z = -sx * (0.3 + i * 0.35); h.add(t); }
        } else {
          const len = b.horns === 'unicorn' ? 0.4 : b.horns === 'curved' ? 0.26 : 0.14;
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.05 * S, len * S, 14), mats.horn);
          t.position.y = len * S / 2; h.add(t);
          h.rotation.z = b.horns === 'curved' ? -sx * 1.1 : -sx * 0.25;
          if (b.horns === 'unicorn') h.rotation.x = 0.35;
        }
        head.add(h);
      }
    }

    // Legs (pivot at the hip so they can swing).
    parts.legs = [];
    if (!legless) {
      const spots = biped ? [[-0.16, 0], [0.16, 0]] : [[-0.25, 0.32 * long], [0.25, 0.32 * long], [-0.25, -0.3 * long], [0.25, -0.3 * long]];
      for (const [x, z] of spots) {
        const hip = pivot(x * S, legH + 0.08 * S, z * S);
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry((biped ? 0.07 : 0.1) * S, Math.max(0.05, legH - 0.1 * S), 6, 14), biped ? mats.accent : mats.main);
        leg.position.y = -legH / 2;
        const paw = sphere((biped ? 0.09 : 0.11) * S, biped ? mats.accent : mats.belly, 16);
        paw.scale.set(1, 0.6, 1.25); paw.position.set(0, -legH + 0.03, 0.03 * S);
        hip.add(leg, paw);
        rig.add(hip);
        parts.legs.push(hip);
      }
    }

    // Tail: a chain of beads that can wag.
    parts.tail = [];
    if (b.tail !== 'none') {
      const spec = { bushy: [7, 0.15, 1.05], thin: [8, 0.045, 0.85], short: [2, 0.1, 1], curly: [8, 0.05, 0.9], fan: [1, 0.1, 1], long: [10, 0.06, 0.92] }[b.tail];
      let parent = pivot(0, biped ? -0.32 * S : 0.02, (biped ? -0.36 : -0.52 * long) * S);
      body.add(parent);
      if (b.tail === 'fan') {
        for (let i = -2; i <= 2; i++) { const f = sphere(0.12 * S, i % 2 ? mats.main : mats.accent, 14); f.scale.set(0.4, 1.6, 0.25); f.position.set(i * 0.08 * S, 0.08 * S, -0.06 * S); f.rotation.z = -i * 0.3; parent.add(f); }
        parts.tail.push(parent);
      } else {
        const [n, r0, decay] = spec;
        let r = r0 * S;
        for (let i = 0; i < n; i++) {
          const seg = pivot(0, i ? r * 0.6 : 0, i ? -r * 0.9 : 0);
          seg.rotation.x = b.tail === 'curly' ? -0.42 : b.tail === 'bushy' ? -0.28 : -0.2;
          seg.add(sphere(r, i === n - 1 && b.tail !== 'short' ? mats.accent : mats.main, 14));
          parent.add(seg); parent = seg; parts.tail.push(seg);
          r *= decay;
        }
      }
    }

    // Wings.
    parts.wings = [];
    if (b.wings) {
      for (const sx of [-1, 1]) {
        const w = pivot(sx * 0.4 * S, 0.12 * S, -0.05 * S);
        const m = sphere(0.3 * S, mats.accent, 20); m.scale.set(0.35, 0.9, 0.7); m.position.set(sx * 0.12 * S, 0.05 * S, -0.04 * S);
        w.add(m); body.add(w); parts.wings.push(w);
      }
    }
    parts.biped = biped;
    parts.height = legH + 0.42 * S + (biped ? 1.05 : 0.8) * S;
  }

  /** A historic figure: its model has a skeleton (root, body, head) for the bobble and the body language. */
  let figureScenes = {};
  function buildFigure(name) {
    parts = { shadow: parts.shadow, figure: true, legs: [], tail: [], ears: [], wings: [], eyes: [], mouth: null, biped: true };
    rig = new THREE.Group();
    rig.userData.figure = true;
    scene.add(rig);
    const gltf = figureScenes[name];
    if (!gltf) return;
    const model = gltf.scene;
    rig.add(model);
    model.traverse((o) => {
      if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.roughness = 0.6; o.material.metalness = 0; o.material.side = THREE.DoubleSide;
        // the picture already carries its shading: light him partly by his own colours, so small folds in the mesh don't show as dark slivers
        if (o.material.map) { o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = 0.82; o.material.color = new THREE.Color(0x4a4a4a); } } }
      if (o.isBone && ['root', 'body', 'head'].includes(o.name)) { parts[o.name] = o; o.userData.rest = o.quaternion.clone(); }
      if (o.isBone && /Head$/.test(o.name)) parts.mxHead = o;
      if (o.isBone && /Hips$/.test(o.name)) parts.mxHips = o;
      if (o.isBone && /RightHand$/.test(o.name)) parts.mxHandR = o;
      if (o.isBone) for (const k of RAG_BONES) if (new RegExp(k + '$').test(o.name)) (parts.rag ||= {})[k] = o;
    });
    if (gltf.animations?.length) {
      // a fully animated figure: fit it to 2.35 units, feet on the floor, then drive it with its clips
      model.scale.setScalar(1);
      model.position.set(0, 0, 0);
      model.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(model);
      const k = 2.35 / Math.max(0.001, bb.max.y - bb.min.y);
      model.scale.setScalar(k);
      model.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
      parts.mixer = new THREE.AnimationMixer(model);
      // the anachronism: a little smartphone in his right hand, shown only for the phone clips
      if (parts.mxHandR) {
        const phone = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.35, metalness: 0.4 }));
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.135), new THREE.MeshBasicMaterial({ color: '#bfe3ff' }));
        screen.position.z = 0.0065;
        phone.add(body, screen);
        const worldScale = new THREE.Vector3();
        parts.mxHandR.getWorldScale(worldScale);
        phone.scale.setScalar(1 / Math.max(1e-6, worldScale.x) * 0.9);   // keep it phone-sized whatever the bone scale
        phone.position.set(0, 0.09 / Math.max(1e-6, worldScale.x), 0.02 / Math.max(1e-6, worldScale.x));
        phone.rotation.set(0, Math.PI / 2, 0);
        phone.visible = false;
        parts.mxHandR.add(phone);
        parts.phone = phone;
      }
      parts.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
      parts.actions = {};
      parts.base = null;
      parts.oneShot = null;
      parts.mixer.addEventListener('finished', (e) => { if (parts.oneShot && e.action === parts.oneShot) { parts.oneShot = null; play(parts.base || 'idle', true); } });
      play('idle', true);
    } else {
      model.scale.setScalar(2.35);
    }
    parts.height = 2.35;
    renderer.toneMappingExposure = 1.15;
  }

  /* Clips: a looping base (idle, walk, think, sleep...) and one-shots on top (wave, bow, point, shrug...).
     Every change crossfades over a quarter of a second. */
  function play(name, loop = false, fade = 0.25) {
    const P = parts;
    if (!P?.mixer || !P.clips[name]) return false;
    let a = P.actions[name];
    if (!a) { a = P.mixer.clipAction(P.clips[name]); P.actions[name] = a; }
    const prev = P.oneShot || (P.base && P.actions[P.base]);
    if (loop) {
      P.base = name;
      if (P.oneShot) return true;            // the base resumes when the one-shot finishes
      if (prev === a && a.isRunning()) return true;
      a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(fade).play();
    } else {
      P.oneShot = a;
      a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).fadeIn(fade).play();
      a.clampWhenFinished = false;
    }
    if (prev && prev !== a) prev.fadeOut(fade);
    return true;
  }
  /** Use a clip if this figure has it (animated figures); otherwise nothing happens. */
  function act(name) { if (flat) { if (/talk|bow|point|wave|secret/.test(name)) flat.nod(); return false; } return play(name, false); }
  function baseFor() {
    if (asleep) return 'sleep';
    if (rag || dragging) return 'idle';                 // the ragdoll does the rest
    if (fly) return fly.big && parts.clips?.fall ? 'fall' : 'idle';
    if (target) return parts.walkStyle || 'walk';
    if (busy) return parts.thinkStyle || 'think';
    if (hold && performance.now() < hold.until) return hold.name;
    hold = null;
    return 'idle';
  }

  function addPattern(b, body, scale, S, biped) {
    if (b.pattern === 'spots') {
      const pts = [[0.3, 0.25, 0.1], [-0.25, 0.3, -0.15], [0.05, 0.4, -0.35], [-0.35, 0.05, 0.2], [0.38, 0.0, -0.3]];
      for (const [x, y, z] of pts) { const s = sphere(0.07 * S, mats.accent, 12); s.position.set(x * scale.x, y * scale.y * (biped ? 1 : 0.9), z * scale.z); s.scale.set(1, 1, 0.4); s.lookAt(0, 0, 0); body.add(s); }
    } else if (b.pattern === 'stripes') {
      for (let i = -2; i <= 2; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 40, Math.PI * 0.9), mats.accent);
        t.scale.copy(scale).multiplyScalar(1.01); t.rotation.set(0, Math.PI / 2, Math.PI * 0.05); t.position.z = i * 0.15 * scale.z; t.rotation.z = Math.PI * 0.05;
        body.add(t);
      }
    }
  }

  /* ===================== motion & behaviour ===================== */
  const W = () => innerWidth, Hh = () => innerHeight;
  const box = { w: 220, h: 220 };
  let pos = { x: 0, y: 0 };            // the feet, in viewport pixels
  let target = null;                    // { x, y, then }
  let facing = 0, faceTarget = 0;
  let mood = null, moodUntil = 0, hop = 0;
  let pointing = null;                  // { x, y, until }
  let morph = 0, morphBody = null;      // 1 -> 0 while turning into a new animal
  let dragging = null;
  let fly = null;                       // thrown or dropped: { vx, vy, big }
  let hold = null;                      // an idle pastime that loops for a while: { name, until }
  const swing = { th: 0, w: 0 };        // the ragdoll's swing around the finger (radians, clockwise on screen)
  const finger = { x: 0, y: 0, vx: 0, vy: 0, ax: 0 };
  let lastMouseMove = 0;
  let lastActivity = performance.now();
  let asleep = false;
  let voice = 0, voiceT = 0;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };

  function bottomLimit() { return Hh() - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 0) - 12; }
  function clampPos(p) {
    return { x: Math.min(W() - box.w * 0.35, Math.max(box.w * 0.35, p.x)), y: Math.min(bottomLimit(), Math.max(box.h * 0.75, p.y)) };
  }
  // Docked: at home in his tent on the home page (the dock is a point on the tent's rugs). He follows it as the page scrolls.
  let dock = null, docked = false;
  // (his feet are drawn about a quarter of the frame above its bottom edge, so the frame's foot point goes that much below the rug)
  function dockSpot() { const r = dock.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + box.h * 0.26 }; }
  /** Walk back to the tent (the target keeps following the dock while he walks). */
  function goHome(then) { if (!docked || !dock) return; wake(); hold = null; if (!target && parts?.mixer && !fly) act('walk_start'); target = { ...dockSpot(), dock: true, then }; }
  function homeSpot() {
    if (docked && dock) return dockSpot();
    try { const s = JSON.parse(localStorage.getItem('helper.daemon.pos') || 'null'); if (s) return clampPos({ x: s.x * W(), y: s.y * Hh() }); } catch (_) { /* ignore */ }
    const rtlEnd = 24 + box.w * 0.45; // bottom, end side (left in RTL)
    return clampPos({ x: rtlEnd, y: bottomLimit() });
  }
  function rememberSpot() { if (docked) return; try { localStorage.setItem('helper.daemon.pos', JSON.stringify({ x: pos.x / W(), y: pos.y / Hh() })); } catch (_) { /* ignore */ } }

  function walkTo(x, y, then) {
    wake();
    hold = null;
    if (!target && parts?.mixer && !fly) act('walk_start');
    target = { ...clampPos({ x, y }), then };
    if (parts) parts.walkStyle = mood === 'worried' ? 'limp' : Math.random() < 0.2 ? 'texting_walk' : 'walk';
  }

  /** Walk beside an element and point at it. */
  async function showElement(elmt, say) {
    if (!elmt) return false;
    elmt.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, reduced ? 50 : 450));
    const r = elmt.getBoundingClientRect();
    const roomLeft = r.left, roomRight = W() - r.right;
    const side = roomLeft > roomRight ? -1 : 1;
    const x = side < 0 ? r.left - box.w * 0.32 : r.right + box.w * 0.32;
    const fits = side < 0 ? roomLeft > box.w * 0.5 : roomRight > box.w * 0.5;
    const tx = fits ? x : r.left + r.width / 2;
    const ty = fits ? Math.min(bottomLimit(), r.bottom + 10) : Math.min(bottomLimit(), r.bottom + box.h * 0.85);
    walkTo(tx, ty, () => {
      pointing = { x: r.left + r.width / 2, y: r.top + r.height / 2, until: performance.now() + 2600 };
      act(r.top > pos.y - 10 ? 'point_low' : 'point');   // kneel only for things below his feet
      elmt.classList.add('dm-spot');
      setTimeout(() => elmt.classList.remove('dm-spot'), 2600);
      if (say) speakBalloon(say, true);
      if (docked) setTimeout(() => goHome(), 3200);
    });
    return true;
  }

  function landmarks() {
    const out = [];
    document.querySelectorAll('[data-guide]').forEach((n) => {
      const rect = n.getBoundingClientRect();
      if (rect.width && n.offsetParent !== null) out.push({ key: n.dataset.guide, label: n.dataset.guideLabel || n.getAttribute('aria-label') || n.textContent.trim().slice(0, 40) });
    });
    return out;
  }

  function wake() { lastActivity = performance.now(); if (asleep) { asleep = false; sleepBadge.hidden = true; } }

  /* ===================== a 2D figure (vision batch 5): design's Figure2D in place of the 3D Ibn Ezra ===================== */
  // The person's choice is prefs.figure ('' or 'ibn_ezra': the 3D Ibn Ezra, the owner's family only; else a Figure2D id).
  // A 2D figure walks, is dragged and points like him (the same box moves); three.js is not loaded for it at all.
  let flat = null, flatFigure = null, flatState = { talk: false, sleep: false, think: false };   // flatFigure: the id shown
  const wantsFlat = () => !!prefs.figure && prefs.figure !== 'ibn_ezra';
  /** the figure for someone who has not chosen (outside the owner's family): the owner chose the fennec (Figure2D.DEFAULT) */
  const defaultFigure = (list) => (list.some((f) => f.id === window.Figure2D?.DEFAULT) ? Figure2D.DEFAULT : list[0]?.id || null);
  async function flatCatalogue() {
    try { await H.loadOnce('/assets/figure2d.js'); } catch (_) { return []; }
    if (!document.querySelector('link[href="/assets/figure2d.css"]')) document.head.append(el('link', { rel: 'stylesheet', href: '/assets/figure2d.css' }));
    return window.Figure2D ? Figure2D.list() : [];
  }
  /** each frame: his mouth while he speaks, asleep when left alone, thinking while an answer comes */
  function flatLife() {
    voiceBeat();
    const now = { talk: (!!audioEl && !audioEl.paused) || !!window.speechSynthesis?.speaking, sleep: asleep, think: busy };
    if (now.talk !== flatState.talk) flat.talk(now.talk);
    if (now.sleep !== flatState.sleep) flat.sleep(now.sleep);
    if (now.think !== flatState.think) flat.think(now.think);
    flatState = now;
  }

  function setMood(m, secs = 2.2) {
    mood = m; moodUntil = performance.now() + secs * 1000;
    if (flat) { if (m === 'happy' || m === 'proud' || m === 'love') flat.happy(); return; }
    if (parts?.mixer) {
      if (m === 'happy' || m === 'proud' || m === 'love') act('happy');
      else if (m === 'worried') act('shrug');
      return;
    }
    if (m === 'happy') hop = 1;
  }

  /* ---- picked up, swung and thrown ---- */
  const HANG_GAP = 18;                 // px between the finger and the top of his turban
  let _top = null;
  function pivotY() {
    if (_top == null && camera && THREE) {
      const v = new THREE.Vector3(0, parts.height || 2.35, 0).project(camera);
      _top = (1 - v.y) / 2 * box.h;
    }
    return Math.max(2, (_top ?? box.h * 0.15) - HANG_GAP);
  }
  function tickSwing(dt) {
    const L = Math.max(60, box.h * 0.45);         // finger to his middle, in px
    let acc;
    if (dragging) acc = -(2400 / L) * Math.sin(swing.th) - (finger.ax / L) * Math.cos(swing.th) - 1.4 * swing.w;
    else acc = -40 * swing.th - 7 * swing.w;       // let go: back upright
    swing.w += acc * dt;
    swing.th = Math.max(-1.3, Math.min(1.3, swing.th + swing.w * dt));
    if (!dragging && !fly && Math.abs(swing.th) < 0.002 && Math.abs(swing.w) < 0.01) { swing.th = 0; swing.w = 0; }
  }
  function land() {
    const big = fly?.big;
    fly = null;
    pos = clampPos(pos);
    if (docked) setTimeout(() => goHome(), 1400); else rememberSpot();
    if (!parts?.mixer) { hop = 0.5; return; }
    if (big) { act(Math.random() < 0.6 ? 'yell' : 'shrug'); mood = 'worried'; moodUntil = performance.now() + 9000; }
    else act('shrug');
  }
  /** Idle life: now and then he finds something to do (every animation he has gets its turn). */
  function pastime(now) {
    if (!parts?.mixer) {
      if (docked) return;
      if (Math.random() < 0.6) walkTo(pos.x + (Math.random() - 0.5) * Math.min(420, W() * 0.5), bottomLimit());
      return;
    }
    const near = Math.hypot(mouse.x - pos.x, mouse.y - (pos.y - box.h / 2)) < 280 && now - lastMouseMove < 5000;
    const options = [
      ['wander', 28], ['phone', 9], ['think', 7], ['happy', 6], ['shrug', 4], ['talk', 4], ['talk2', 4], ['rap', 4],
      ['yell', 2], ['bow', 3], ['point_forward', near ? 7 : 2], ['wave', near ? 10 : 1], ['secret', near ? 6 : 1], ['point_low', 2],
    ];
    let r = Math.random() * options.reduce((a, o) => a + o[1], 0);
    const pick = options.find((o) => (r -= o[1]) < 0)[0];
    if (pick === 'wander' && docked) { hold = { name: 'think', until: now + 3000 + Math.random() * 2000 }; return; }
    if (pick === 'wander') {
      const nx = pos.x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * Math.min(360, W() * 0.4));
      walkTo(nx, bottomLimit());
    } else if (pick === 'phone') hold = { name: 'phone', until: now + 6000 + Math.random() * 6000 };
    else if (pick === 'think') hold = { name: 'think', until: now + 3500 + Math.random() * 3000 };
    else {
      if (['point_forward', 'wave', 'secret'].includes(pick)) faceTarget = 0;
      act(pick);
    }
  }

  let last = performance.now();
  let nextWander = performance.now() + 15000;
  let nextBlink = 0, blinkUntil = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (gone) return;
    if ((!rig && !flat) || (prefs.minimized && !docked)) { requestAnimationFrame(frame); return; }

    // --- where to be ---
    let moving = false;
    if (rag) {
      if (dragging) {
        const vx = (dragging.x - finger.x) / Math.max(dt, 1e-3), vy = (dragging.y - finger.y) / Math.max(dt, 1e-3);
        finger.vx += (vx - finger.vx) * 0.4; finger.vy += (vy - finger.vy) * 0.4;
        finger.x = dragging.x; finger.y = dragging.y;
      }
      stepRag(dt);
      if (rag && rag.state !== 'rise' && rag.state !== 'asleep') {
        // the canvas follows the heap of him
        let cx = 0, cy = 0, n = 0;
        for (const q of Object.values(rag.p)) { cx += q.x; cy += q.y; n++; }
        pos = { x: cx / n, y: cy / n + box.h / 2 };
      }
      faceTarget = 0;
    } else if (dragging) {
      // hang by the turban a little below the finger, so the finger never covers him
      const vx = (dragging.x - finger.x) / Math.max(dt, 1e-3), vy = (dragging.y - finger.y) / Math.max(dt, 1e-3);
      const nvx = finger.vx + (vx - finger.vx) * 0.5, nvy = finger.vy + (vy - finger.vy) * 0.5;
      finger.ax = Math.max(-9000, Math.min(9000, (nvx - finger.vx) / Math.max(dt, 1e-3)));
      finger.vx = nvx; finger.vy = nvy; finger.x = dragging.x; finger.y = dragging.y;
      pos = { x: dragging.x, y: dragging.y - pivotY() + box.h };
      faceTarget = 0;
    } else if (fly) {
      fly.vy += 2600 * dt;
      fly.vx *= Math.pow(0.6, dt);
      pos.x += fly.vx * dt; pos.y += fly.vy * dt;
      const minX = box.w * 0.35, maxX = W() - box.w * 0.35;
      if (pos.x < minX) { pos.x = minX; fly.vx = Math.abs(fly.vx) * 0.5; swing.w -= 4; }
      if (pos.x > maxX) { pos.x = maxX; fly.vx = -Math.abs(fly.vx) * 0.5; swing.w += 4; }
      if (pos.y - box.h < 0 && fly.vy < 0) fly.vy = -fly.vy * 0.3;
      if (pos.y >= bottomLimit()) {
        pos.y = bottomLimit();
        if (fly.vy > 1100 && !fly.bounced) { fly.vy = -fly.vy * 0.22; fly.bounced = true; }
        else land();
      }
      faceTarget = 0;
    } else if (target) {
      if (target.dock && dock) Object.assign(target, dockSpot());
      const dx = target.x - pos.x, dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      const speed = (parts.wings.length ? 340 : 260) * (reduced ? 4 : 1);
      if (dist < 4) {
        pos = { x: target.x, y: target.y };
        const then = target.then; target = null; rememberSpot();
        act('walk_stop');
        then?.();
      } else {
        const step = Math.min(dist, speed * dt);
        pos.x += (dx / dist) * step; pos.y += (dy / dist) * step;
        moving = true;
        if (Math.abs(dx) > 6) faceTarget = dx > 0 ? 1.05 : -1.05;
      }
    } else if (docked && dock) {
      const s = dockSpot();
      pos.x = s.x; pos.y = s.y;
    }
    if (!moving && !dragging) faceTarget = pointing ? (pointing.x > pos.x ? 0.6 : -0.6) : 0;
    facing += (faceTarget - facing) * Math.min(1, dt * 7);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) pos = homeSpot();
    // Once he has settled he is always at least partly on screen (a phone is narrower than a full figure off the edge).
    if (!docked && !rag && !dragging && !fly && (pos.x < box.w * 0.2 || pos.x > W() - box.w * 0.2 || pos.y < 0 || pos.y > Hh() + box.h)) pos = clampPos(pos);
    tickSwing(dt);
    const pv = pivotY();
    canvasBox.style.transformOrigin = `${box.w / 2}px ${pv}px`;
    canvasBox.style.transform = `translate(${Math.round(pos.x - box.w / 2)}px, ${Math.round(pos.y - box.h)}px)` +
      (Math.abs(swing.th) > 0.002 ? ` rotate(${swing.th.toFixed(4)}rad)` : '');
    if (balloon && !balloon.hidden) placeBalloon();

    // --- idle life: wander now and then, sleep when left alone ---
    if (!busy && !target && !dragging && !fly && !rag && !hold && balloon.hidden && now > nextWander && !asleep) {
      nextWander = now + (15000 + Math.random() * 20000) * (reduced ? 3 : 1);
      pastime(now);
    }
    if (!asleep && !busy && balloon.hidden && now - lastActivity > 120000) { asleep = true; sleepBadge.hidden = false; }
    // a 2D figure draws itself: here only its mouth, sleep and thinking
    if (flat) { flatLife(); requestAnimationFrame(frame); return; }

    // --- the body ---
    const T = reduced ? 0 : t;
    rig.rotation.y = facing;
    if (parts.figure) {
      animateFigure(T, dt, now, moving);
    } else {
    const breath = Math.sin(T * 2.1) * 0.018;
    parts.body.scale.set(1 - breath * 0.4, 1 + breath, 1 - breath * 0.4);
    let lift = 0;
    if (hop > 0) { hop = Math.max(0, hop - dt * 1.6); lift = Math.abs(Math.sin(hop * Math.PI * 2)) * 0.35; }
    if (parts.wings.length && (moving || dragging)) lift += 0.25 + Math.sin(T * 6) * 0.05;
    const bob = moving ? Math.abs(Math.sin(T * 10)) * 0.06 : 0;
    rig.position.y = lift + bob;
    parts.shadow.scale.setScalar(1 - Math.min(0.5, lift));
    parts.shadow.position.x = 0;

    // Legs: walk cycle, dangle while dragged, tucked while asleep.
    parts.legs.forEach((leg, i) => {
      const phase = (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI);
      leg.rotation.x = dragging ? Math.sin(T * 14 + i) * 0.5 : moving ? Math.sin(T * 10 + phase) * 0.55 : asleep ? 0.9 * (i < 2 ? -1 : 1) * 0.3 : 0;
    });
    // Pointing: the front leg (or wing) on the target's side lifts toward it.
    if (pointing && now < pointing.until) {
      const right = pointing.x > pos.x;
      const limb = parts.biped ? parts.wings[right ? 1 : 0] : parts.legs[right ? 1 : 0];
      if (limb) { limb.rotation.x = -1.35; limb.rotation.z = right ? -0.35 : 0.35; }
    } else if (pointing) { parts.legs.forEach((l) => { l.rotation.z = 0; }); parts.wings.forEach((w) => { w.rotation.z = 0; }); pointing = null; }

    // Head: look at the cursor (or at what it's pointing at); droop when asleep; tilt when curious.
    const look = pointing || mouse;
    const rect = { x: pos.x, y: pos.y - box.h * 0.62 };
    const yaw = Math.max(-0.7, Math.min(0.7, (look.x - rect.x) / 500)) - facing * 0.6;
    const pitch = Math.max(-0.4, Math.min(0.35, (look.y - rect.y) / 600));
    const h = parts.head;
    h.rotation.y += ((asleep ? 0 : yaw) - h.rotation.y) * Math.min(1, dt * 6);
    h.rotation.x += ((asleep ? 0.45 : pitch) - h.rotation.x) * Math.min(1, dt * 6);
    h.rotation.z += (((mood === 'curious' ? 0.35 : 0) + (dragging ? Math.sin(T * 8) * 0.15 : 0)) - h.rotation.z) * Math.min(1, dt * 5);

    // Eyes blink (closed while asleep).
    if (now > nextBlink) { blinkUntil = now + 130; nextBlink = now + 2200 + Math.random() * 3800; }
    const closed = asleep || now < blinkUntil || mood === 'happy';
    parts.eyes.forEach((e) => { e.scale.y += ((closed ? (mood === 'happy' && !asleep ? 0.35 : 0.08) : 1) - e.scale.y) * Math.min(1, dt * 25); });

    // Tail wag, ears twitch, wings flap, trunk sway.
    const wag = mood === 'happy' ? 14 : asleep ? 1 : 4;
    const amp = mood === 'happy' ? 0.5 : asleep ? 0.05 : 0.22;
    parts.tail.forEach((s, i) => { s.rotation.y = Math.sin(T * wag - i * 0.5) * amp; });
    parts.ears.forEach((e, i) => { e.rotation.x = Math.sin(T * 3 + i * 2) * 0.04 + (mood === 'worried' ? 0.5 : 0); });
    parts.wings.forEach((w, i) => { w.rotation.z = (pointing ? w.rotation.z : 0) + (i ? -1 : 1) * (moving || dragging || lift > 0.1 ? Math.sin(T * 18) * 0.7 : Math.sin(T * 2) * 0.06); });
    (parts.trunk || []).forEach((s, i) => { s.rotation.x = Math.sin(T * 1.6 - i * 0.6) * 0.18 + 0.15; });
    }

    // Moods.
    if (mood && now > moodUntil) mood = null;
    if (mood === 'worried') rig.position.x = Math.sin(T * 60) * 0.02; else rig.position.x = 0;
    const puff = mood === 'proud' ? 1.1 : mood === 'love' ? 1.05 : 1;
    rig.scale.setScalar(rig.scale.x + (puff - rig.scale.x) * Math.min(1, dt * 6));

    // Speaking: the mouth opens with the voice.
    if (now > voiceT) voice *= 0.85;
    if (parts.mouth && !parts.figure) parts.mouth.scale.y = (parts.mouth.geometry.type === 'ConeGeometry' ? 1 : 0.25) + voice * 0.9;

    // Shapeshift: spin into a burst of sparks, rebuild, grow back.
    if (morph > 0) {
      morph = Math.max(0, morph - dt * 1.4);
      const k = morph;
      if (morphBody && k < 0.5) { build(morphBody); morphBody = null; burst(); }
      const s = k > 0.5 ? (k - 0.5) * 2 : 1 - k * 2;  // 1 -> 0 -> 1
      rig.scale.setScalar(Math.max(0.01, k > 0.5 ? s : 1 - Math.pow(1 - (1 - k * 2), 3) * 0 + (1 - k * 2) * 1.08 - Math.max(0, (1 - k * 2) - 0.92)));
      rig.rotation.y = facing + k * Math.PI * 4;
    }
    tickSparks(dt);
    voiceBeat();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* A bobblehead's body language: the head rides a spring (it lags, overshoots and wobbles when the body moves,
     hops or speaks), looks at the cursor, nods off when asleep; the body breathes, waddles when walking,
     leans toward what it points at, and dangles when dragged. */
  const bob = { x: 0, vx: 0, z: 0, vz: 0 };
  let wasMoving = false;
  const _e = { x: 0, y: 0, z: 0 };
  function setRot(bone, x, y, z) {
    if (!bone) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    bone.quaternion.copy(bone.userData.rest).multiply(q);
  }
  function animateFigure(T, dt, now, moving) {
    const P = parts;
    if (now > voiceT) voice *= 0.85;
    if (P.mixer) return animateClips(T, dt, now, moving);
    // impulses into the head spring
    if (moving !== wasMoving) { bob.vx += moving ? -2.2 : 2.6; wasMoving = moving; }
    if (moving) bob.vz += Math.sin(T * 9) * 0.9 * dt * 60 * 0.05;
    if (voice > 0.9) bob.vx += 0.35;
    let lift = 0;
    if (hop > 0) { const before = hop; hop = Math.max(0, hop - dt * 1.6); lift = Math.abs(Math.sin(hop * Math.PI * 2)) * 0.32; if (Math.floor(before * 4) !== Math.floor(hop * 4)) bob.vx += 1.8; }
    if (dragging) { bob.vz += Math.sin(T * 7) * 0.6; }
    const k = 70, c = 5.5;   // springy, under-damped: a real bobblehead wobble
    bob.vx += (-k * bob.x - c * bob.vx) * dt; bob.x += bob.vx * dt;
    bob.vz += (-k * bob.z - c * bob.vz) * dt; bob.z += bob.vz * dt;
    bob.x = Math.max(-0.5, Math.min(0.5, bob.x)); bob.z = Math.max(-0.5, Math.min(0.5, bob.z));

    // where to look
    const look = pointing && now < pointing.until ? pointing : mouse;
    const headY = pos.y - box.h * 0.75;
    const yaw = Math.max(-0.75, Math.min(0.75, (look.x - pos.x) / 450)) - facing * 0.7;
    const pitch = Math.max(-0.35, Math.min(0.3, (look.y - headY) / 650));
    _e.y += ((asleep ? 0 : yaw) - _e.y) * Math.min(1, dt * 5);
    _e.x += ((asleep ? 0.38 : pitch + (mood === 'proud' ? -0.15 : 0)) - _e.x) * Math.min(1, dt * 5);
    _e.z += (((mood === 'curious' ? 0.28 : 0) + (asleep ? 0.15 : 0)) - _e.z) * Math.min(1, dt * 4);
    setRot(P.head, _e.x + bob.x + voice * 0.04, _e.y, _e.z + bob.z);

    // body: breathe, waddle, lean toward a pointed-at thing, shiver when worried
    let leanZ = 0, leanX = 0;
    if (pointing && now < pointing.until) { leanZ = pointing.x > pos.x ? -0.16 : 0.16; leanX = 0.08; }
    else if (pointing) pointing = null;
    const waddle = moving ? Math.sin(T * 9) * 0.13 : 0;
    const breath = Math.sin(T * 2.1) * 0.012;
    const shiver = mood === 'worried' ? Math.sin(T * 50) * 0.03 : 0;
    setRot(P.body, leanX + (asleep ? 0.06 : 0) + breath, 0, leanZ + shiver + (dragging ? Math.sin(T * 7) * 0.25 : 0));
    setRot(P.root, 0, 0, waddle);
    rig.position.y = lift + (moving ? Math.abs(Math.sin(T * 9)) * 0.05 : 0);
    parts.shadow.scale.setScalar(1 - Math.min(0.5, lift));
  }

  /* The animated figure: clips do the body, and on top of them the head keeps a bobblehead's spring and looks at
     the cursor (applied after the mixer, as an offset on the head bone). */
  function animateClips(T, dt, now, moving) {
    const P = parts;
    const want = baseFor();
    if (want !== P.base) play(want, true);
    P.mixer.update(dt);
    if (P.phone) {
      const playing = (n) => P.actions[n]?.isRunning() && P.actions[n].getEffectiveWeight() > 0.5;
      P.phone.visible = playing('phone') || playing('texting_walk');
    }
    if (moving !== wasMoving) { bob.vx += moving ? -1.6 : 2.0; wasMoving = moving; }
    if (voice > 0.9) bob.vx += 0.25;
    if (hop > 0) { hop = Math.max(0, hop - dt * 1.6); }
    const k = 60, c = 10;          // a soft nod that settles, not a lingering wobble
    bob.vx += (-k * bob.x - c * bob.vx) * dt; bob.x += bob.vx * dt;
    bob.vz += (-k * bob.z - c * bob.vz) * dt; bob.z += bob.vz * dt;
    bob.x = Math.max(-0.4, Math.min(0.4, bob.x)); bob.z = Math.max(-0.4, Math.min(0.4, bob.z));
    const busyClip = P.oneShot && !['wave', 'shrug', 'happy'].includes(P.oneShot.getClip().name);
    const look = pointing && now < pointing.until ? pointing : mouse;
    const headY = pos.y - box.h * 0.75;
    const free = asleep || busyClip || rag ? 0 : 1;      // clips that move the head on their own keep it
    // gentle turns: the beard follows the head and the chest doesn't, so a big turn opens a seam between them
    const yaw = Math.max(-0.28, Math.min(0.28, (look.x - pos.x) / 900)) - facing * 0.3;
    const pitch = Math.max(-0.12, Math.min(0.1, (look.y - headY) / 1300));
    _e.y += (yaw * free - _e.y) * Math.min(1, dt * 5);
    _e.x += (pitch * free - _e.x) * Math.min(1, dt * 5);
    if (P.mxHead) {
      const wob = rag ? 0 : 0.3;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(_e.x + bob.x * wob, _e.y, bob.z * wob, 'YXZ'));
      P.mxHead.quaternion.multiply(q);
    }
    if (pointing && now >= pointing.until) pointing = null;
    // Falling (being dragged) is a skydiver's pose, face to the floor: tip him up so his face looks out of the screen.
    const fallW = P.actions.fall ? P.actions.fall.getEffectiveWeight() : 0;
    fallTilt += ((P.base === 'fall' ? 1 : 0) * fallW - fallTilt) * Math.min(1, dt * 8);
    rig.rotation.x = -Math.PI / 2 * fallTilt;
    rig.position.x = 0;
    rig.position.y = FALL_LIFT * fallTilt;
    rig.position.z = FALL_BACK * fallTilt;
    parts.shadow.visible = fallTilt < 0.5;
    parts.shadow.scale.setScalar(1);
    narrowStance();
    applyRag();
    if (rag) parts.shadow.visible = false;
  }
  let fallTilt = 0;
  const FALL_LIFT = 0.9, FALL_BACK = 0;

  /* ===================== the ragdoll =====================
     A real one, in the plane of the screen: his joints are particles (Verlet integration) held together by bones of
     fixed length, the torso is rigid, elbows and knees can't fold flat. Grab any joint and he hangs from it; let go
     and he keeps the hand's momentum, bounces off the walls and the floor, settles in a heap and gets up.
     Each frame the particles' directions turn his bones (on top of the idle pose) and move his hips. */
  const RAG_BONES = ['Hips', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const RSEG = [   // [bone turned, from particle, to particle, parent segment]
    ['Hips', 'Hips', 'Spine2', null], ['Head', 'Head', 'top', 'Hips'],
    ['LeftArm', 'LeftArm', 'LeftForeArm', 'Hips'], ['LeftForeArm', 'LeftForeArm', 'LeftHand', 'LeftArm'],
    ['RightArm', 'RightArm', 'RightForeArm', 'Hips'], ['RightForeArm', 'RightForeArm', 'RightHand', 'RightArm'],
    ['LeftUpLeg', 'LeftUpLeg', 'LeftLeg', 'Hips'], ['LeftLeg', 'LeftLeg', 'LeftFoot', 'LeftUpLeg'],
    ['RightUpLeg', 'RightUpLeg', 'RightLeg', 'Hips'], ['RightLeg', 'RightLeg', 'RightFoot', 'RightUpLeg'],
  ];
  const TORSO = ['Spine2', 'Hips', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'Head'];
  let rag = null;
  const canRag = () => !!(parts.mixer && parts.rag && RAG_BONES.every((k) => parts.rag[k]));

  function canvasOrigin() { return { x: pos.x - box.w / 2, y: pos.y - box.h }; }
  function toScreen(v3) {
    const o = canvasOrigin();
    const v = v3.clone().project(camera);
    return { x: o.x + (v.x + 1) / 2 * box.w, y: o.y + (1 - v.y) / 2 * box.h };
  }
  function grabRag(cx, cy) {
    if (!rag) {
      facing = 0; faceTarget = 0; rig.rotation.y = 0;
      scene.updateMatrixWorld(true);
      const P = {};
      const w = new THREE.Vector3();
      for (const k of RAG_BONES) { parts.rag[k].getWorldPosition(w); const p = toScreen(w); P[k] = { x: p.x, y: p.y, px: p.x, py: p.y }; }
      parts.rag.Head.getWorldPosition(w);
      const t = toScreen(new THREE.Vector3(w.x, (parts.height || 2.35) + rig.position.y, w.z));
      P.top = { x: t.x, y: t.y, px: t.x, py: t.y };
      const d = (a, b) => Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y);
      const cons = [];
      for (const [, a, b] of RSEG) if (a !== 'Hips') cons.push([a, b, d(a, b), 1, false]);
      for (let i = 0; i < TORSO.length; i++) for (let j = i + 1; j < TORSO.length; j++) cons.push([TORSO[i], TORSO[j], d(TORSO[i], TORSO[j]), 1, false]);
      cons.push(['top', 'Spine2', d('top', 'Spine2'), 0.8, false]);     // a loose neck, but not a wobbly one
      // legs stay together: knees and feet no further apart than when standing (and they don't cross)
      for (const [a, b] of [['LeftLeg', 'RightLeg'], ['LeftFoot', 'RightFoot']]) {
        cons.push([a, b, d(a, b) * 0.95, 0.6, 'max']);
        cons.push([a, b, d(a, b) * 0.55, 0.6, true]);
      }
      for (const side of ['Left', 'Right']) {
        cons.push([side + 'Arm', side + 'Hand', 0.6 * (d(side + 'Arm', side + 'ForeArm') + d(side + 'ForeArm', side + 'Hand')), 1, true]);
        cons.push([side + 'UpLeg', side + 'Foot', 0.7 * (d(side + 'UpLeg', side + 'Leg') + d(side + 'Leg', side + 'Foot')), 1, true]);
      }
      const rest = {};
      for (const [bone, a, b] of RSEG) rest[bone] = Math.atan2(P[b].y - P[a].y, P[b].x - P[a].x);
      // how thick he is around each joint (so he lies on the floor, not half into it)
      const Hpx = Math.max(60, Math.max(P.LeftFoot.y, P.RightFoot.y) - P.top.y);
      const R_ = { top: 0.04, Head: 0.15, Spine2: 0.17, Hips: 0.16, LeftArm: 0.08, RightArm: 0.08, LeftForeArm: 0.06, RightForeArm: 0.06,
        LeftHand: 0.04, RightHand: 0.04, LeftUpLeg: 0.1, RightUpLeg: 0.1, LeftLeg: 0.07, RightLeg: 0.07, LeftFoot: 0.02, RightFoot: 0.02 };
      const rad = Object.fromEntries(Object.entries(R_).map(([k, f]) => [k, f * Hpx]));
      rag = { p: P, cons, rest, rad, pin: null, state: 'held', still: 0, t: 0, blend: 1 };
    }
    // the joint nearest the finger: hands and feet win when close, above the neck means the turban
    let best = null, bd = Infinity;
    for (const [k, q] of Object.entries(rag.p)) {
      const dd = Math.hypot(q.x - cx, q.y - cy) - (/(Hand|Foot)$/.test(k) ? 18 : 0);
      if (dd < bd) { bd = dd; best = k; }
    }
    if (cy < rag.p.Head.y && Math.abs(cx - rag.p.Head.x) < box.w * 0.25) best = 'top';
    rag.pin = best;
    rag.gap = best === 'top' ? HANG_GAP : 10;          // hang a little below the finger, so it never covers him
    rag.state = 'held';
    rag.t = 0;
    rag.sleepT = 0;
  }
  function stepRag(dt) {
    const R = rag, P = R.p, floor = bottomLimit(), right = W();
    rag.t += dt;
    // safety net: if the physics ever breaks (or he is lost off screen for long), he simply comes back home
    const bad = Object.values(P).some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y));
    if (bad || (R.state !== 'held' && R.t > 12)) { rag = null; dragging = null; pos = homeSpot(); rememberSpot(); return; }
    if (R.state === 'rise') { R.blend = Math.max(0, R.blend - dt / (R.gentle ? 0.4 : 0.9)); if (R.blend === 0) endRag(); return; }
    if (R.state === 'asleep') {                       // at rest: no more physics, no more jitter; then he gets up
      R.sleepT += dt;
      if (R.sleepT > 0.6) { R.state = 'rise'; pos = clampPos({ x: P.Hips.x, y: floor }); }
      return;
    }
    const sub = 4, h = dt / sub, g = 2600;
    for (let s_ = 0; s_ < sub; s_++) {
      for (const [k, q] of Object.entries(P)) {
        if (R.state === 'held' && k === R.pin) { q.px = q.x; q.py = q.y; q.x = finger.x; q.y = finger.y + R.gap; continue; }
        const vx = (q.x - q.px) * 0.993, vy = (q.y - q.py) * 0.993;
        q.px = q.x; q.py = q.y;
        q.x += vx; q.y += vy + g * h * h;
      }
      jointLimits(R);
      for (let it = 0; it < 10; it++) {
        for (const [a, b, len, stiff, isMin] of R.cons) {
          const A = P[a], B = P[b];
          const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy) || 1e-6;
          if (isMin === true && dist >= len) continue;
          if (isMin === 'max' && dist <= len) continue;
          const diff = (dist - len) / dist * stiff;
          const pa = R.state === 'held' && a === R.pin, pb = R.state === 'held' && b === R.pin;
          const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
          A.x += dx * diff * wa; A.y += dy * diff * wa;
          B.x -= dx * diff * wb; B.y -= dy * diff * wb;
        }
        for (const [k, q] of Object.entries(P)) {
          if (R.state === 'held' && k === R.pin) continue;
          const r = R.rad[k] || 0, fl = floor - r;
          if (q.y > fl) {
            const vy = (q.y - q.py) / h;
            if (R.state === 'free' && vy > 700 && !R.impact && /Foot$/.test(k)) {
              // a hard landing: the knees buckle and he topples over (a dropped doll doesn't land standing)
              R.impact = true;
              const dir = Math.random() < 0.5 ? -1 : 1;
              P.top.px -= dir * 3.2; P.Spine2.px -= dir * 2.2;
              P.LeftLeg.px -= dir * 1.5; P.RightLeg.px -= dir * 1.5;
            }
            q.y = fl;
          }
          if (q.x < 6 + r) q.x = 6 + r;
          if (q.x > right - 6 - r) q.x = right - 6 - r;
          if (q.y < 4 + r) q.y = 4 + r;
        }
      }
      // the floor soaks up the bounce and most of the slide (once per step, after the bones are satisfied)
      for (const [k, q] of Object.entries(P)) {
        if (R.state === 'held' && k === R.pin) continue;
        if (q.y >= floor - (R.rad[k] || 0) - 0.5) { q.py = q.y; q.px = q.x - (q.x - q.px) * 0.25; }
      }
    }
    if (R.state === 'free') {
      let vmax = 0;
      for (const q of Object.values(P)) vmax = Math.max(vmax, Math.hypot(q.x - q.px, q.y - q.py) / h);
      R.still = vmax < 70 ? R.still + dt : Math.max(0, R.still - dt * 2);
      if (vmax < 25 && R.still > 0.15 && R.t > 0.4) {   // nearly still: go to sleep (freeze) until he gets up
        for (const q of Object.values(P)) { q.px = q.x; q.py = q.y; }
        R.state = 'asleep'; R.sleepT = 0;
      }
      if (R.still > 0.45 || R.t > 4) {                  // lies there a moment, then picks himself up
        R.state = 'rise';
        pos = clampPos({ x: P.Hips.x, y: floor });
      }
    }
  }
  /* Joint limits and soft muscles (an "active ragdoll"): each limb keeps within a natural range of its parent
     (knees and elbows can't fold back on themselves, the neck can't flop over), and is gently pulled toward the pose
     he had, so he falls like a person and not like a wet noodle. */
  const JOINT = {   // bone: [how far it may turn from its natural angle (rad), muscle strength per step]
    Head: [0.55, 0.12], LeftArm: [2.4, 0.015], RightArm: [2.4, 0.015], LeftForeArm: [1.7, 0.03], RightForeArm: [1.7, 0.03],
    LeftUpLeg: [1.1, 0.03], RightUpLeg: [1.1, 0.03], LeftLeg: [0.8, 0.06], RightLeg: [0.8, 0.06],
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function jointLimits(R) {
    const P = R.p, ang = {};
    for (const [bone, a, b, parent] of RSEG) {
      ang[bone] = Math.atan2(P[b].y - P[a].y, P[b].x - P[a].x);
      if (!parent || !JOINT[bone]) continue;
      if (R.state === 'held' && b === R.pin) continue;      // the joint being held goes where the finger takes it
      const [lim, mus] = JOINT[bone];
      const restRel = wrap(R.rest[bone] - R.rest[parent]);
      const err = wrap(ang[bone] - ang[parent] - restRel);
      const want = Math.max(-lim, Math.min(lim, err * (1 - mus)));
      const turn = want - err;
      if (Math.abs(turn) < 1e-5) continue;
      // swing the limb's far end around its joint (keeps the bone's length)
      const A = P[a], B = P[b], c = Math.cos(turn), sn = Math.sin(turn);
      const dx = B.x - A.x, dy = B.y - A.y;
      B.x = A.x + dx * c - dy * sn; B.y = A.y + dx * sn + dy * c;
      ang[bone] += turn;
    }
  }
  function releaseRag() {
    if (!rag) return;
    rag.state = 'free'; rag.t = 0; rag.still = 0;
    // put down gently, feet first and upright: he just stands there
    const P = rag.p, floor = bottomLimit();
    const feetDown = Math.max(P.LeftFoot.y, P.RightFoot.y) > floor - 28;
    const upright = Math.abs(Math.atan2(P.Spine2.x - P.Hips.x, P.Hips.y - P.Spine2.y)) < 0.6 && P.top.y < P.Hips.y;
    const slow = Math.hypot(finger.vx, finger.vy) < 450;
    if (feetDown && upright && slow) { rag.state = 'rise'; rag.gentle = true; pos = clampPos({ x: P.Hips.x, y: floor }); }
  }
  function endRag() {
    const fell = rag && (rag.impact || rag.p.top.y > rag.p.Hips.y - 20);   // a hard landing, or lying down
    const gentle = rag?.gentle;
    rag = null;
    bob.x = bob.vx = bob.z = bob.vz = 0; _e.x = _e.y = 0;   // no leftover wobble when he stands up
    pos = clampPos(pos);
    rememberSpot();
    if (gentle) return;                                    // set down nicely: no fuss
    act(fell ? (Math.random() < 0.6 ? 'yell' : 'shrug') : 'shrug');
    mood = 'worried'; moodUntil = performance.now() + 9000;   // and limps for a bit
  }
  /** Turn his bones to the particles' directions and put his hips where the hips particle is. */
  function applyRag() {
    if (!rag) return;
    const b_ = rag.blend;   // ease in and out of the rise
    const P = rag.p, k = rag.state === 'rise' ? (b_ < 0.5 ? 4 * b_ * b_ * b_ : 1 - Math.pow(-2 * b_ + 2, 3) / 2) : 1;
    const world = {};
    rag.shown ||= {};
    for (const [bone, a, b, parent] of RSEG) {
      let dAng = Math.atan2(P[b].y - P[a].y, P[b].x - P[a].x) - rag.rest[bone];
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
      // smooth what is drawn between physics steps (the angle eases toward the simulated one)
      const prev = rag.shown[bone];
      const sm = prev == null ? dAng : prev + wrap(dAng - prev) * 0.55;
      rag.shown[bone] = sm;
      dAng = sm;
      world[bone] = -dAng;                                 // screen clockwise = world-Z clockwise
      twistScreen(parts.rag[bone], (world[bone] - (parent ? world[parent] : 0)) * k);
    }
    // move the whole figure so the hips sit where the hips particle is
    const hw = new THREE.Vector3();
    parts.rag.Hips.getWorldPosition(hw);
    const ndc = hw.clone().project(camera);
    const o = canvasOrigin();
    const tx = (P.Hips.x - o.x) / box.w * 2 - 1, ty = 1 - (P.Hips.y - o.y) / box.h * 2;
    const want = new THREE.Vector3(tx, ty, ndc.z).unproject(camera);
    rig.position.addScaledVector(want.sub(hw), k);
  }
  /** The clips stand him with his feet wide apart; bring the legs in toward each other (about his own forward axis,
      so it holds whichever way he faces). */
  const STANCE = 0.19;
  function narrowStance() {
    if (!parts.rag?.LeftUpLeg || !parts.rag?.RightUpLeg) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion()));
    twistScreen(parts.rag.LeftUpLeg, -STANCE, fwd);   // his left leg is on the viewer's right
    twistScreen(parts.rag.RightUpLeg, STANCE, fwd);
  }
  function twistScreen(bone, ang, axis = null) {
    if (!bone?.parent || Math.abs(ang) < 1e-5) return;
    const qp = new THREE.Quaternion();
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(qp);
    const qa = new THREE.Quaternion().setFromAxisAngle(axis || new THREE.Vector3(0, 0, 1), ang);
    const inv = qp.clone().invert();
    bone.quaternion.premultiply(inv.multiply(qa).multiply(qp));
    bone.updateWorldMatrix(false, true);
  }

  // Sparks for the shapeshift (small glowing beads that fly out and fade).
  let sparks = [];
  function burst() {
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffd27a' : '#c2b04e', transparent: true }));
      m.position.set(0, 0.8, 0);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2;
      m.userData.v = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) + 0.6, Math.sin(a) * Math.cos(e)).multiplyScalar(2 + Math.random() * 2);
      m.userData.life = 0.7 + Math.random() * 0.5;
      scene.add(m); sparks.push(m);
    }
  }
  function tickSparks(dt) {
    sparks = sparks.filter((m) => {
      m.userData.life -= dt;
      if (m.userData.life <= 0) { scene.remove(m); m.geometry.dispose(); return false; }
      m.position.addScaledVector(m.userData.v, dt); m.userData.v.y -= dt * 3;
      m.material.opacity = Math.min(1, m.userData.life * 2);
      return true;
    });
  }

  async function shapeshift(form, animate) {
    const b = bodyFor(form);
    if (b.figure) {
      try { figureScenes[b.figure] = await loadFigure(b.figure); } catch (e) { console.warn('figure model missing', e); }
    }
    if (!animate || reduced) { build(b); return; }
    morphBody = b; morph = 1; setMood('happy', 1.5);
  }

  /* ===================== speech balloon & chat ===================== */
  let log, input, micBtn, spkBtn, nameEl, balloonText, balloonActs, panel;

  function buildUI() {
    canvasBox = el('div', { class: 'dm-stage', role: 'button', tabindex: '0', 'aria-label': 'העוזר שלך – לחצו כדי לדבר' });
    if (renderer) canvasBox.append(renderer.domElement);
    sleepBadge = el('span', { class: 'dm-zz', hidden: true, 'aria-hidden': 'true' }, 'z', el('b', {}, 'z'), el('i', {}, 'z'));
    canvasBox.append(sleepBadge);
    if (renderer) { renderer.setSize(box.w, box.h); camera.aspect = 1; camera.updateProjectionMatrix(); }   // (no 3D for a 2D figure)

    balloonText = el('div', { class: 'dm-say', dir: 'auto' });
    balloonActs = el('div', { class: 'acts' });
    input = el('input', { type: 'text', placeholder: 'מה תרצו לעשות?', 'aria-label': 'הודעה לעוזר' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) send(input.value); if (e.key === 'Escape') closeBalloon(); });
    micBtn = el('button', { class: 'mini', title: 'דיבור', 'aria-label': 'דיבור', onclick: toggleMic }, svg('mic'));
    // silent, or back to the voice mode chosen in the settings (always / the way he is addressed)
    const loud = () => voiceMode() !== 'silent';
    spkBtn = el('button', { class: 'mini', title: 'הקראה בקול', 'aria-label': 'הקראה בקול', 'aria-pressed': String(loud()), onclick: () => {
      if (loud()) { prefs.lastVoice = voiceMode(); prefs.voice = 'silent'; stopSpeech(); } else prefs.voice = prefs.lastVoice || 'always';
      prefs.speak = loud(); savePrefs(); spkBtn.setAttribute('aria-pressed', String(loud())); spkBtn.replaceChildren(svg(loud() ? 'speaker' : 'mute'));
    } }, svg(loud() ? 'speaker' : 'mute'));
    nameEl = el('b');
    balloon = el('div', { class: 'dm-balloon', hidden: true, role: 'dialog', 'aria-label': 'שיחה עם העוזר' },
      el('div', { class: 'dm-bhead' }, nameEl, el('span', { class: 'spacer' }),
        el('button', { class: 'mini', title: 'בחירת קול', 'aria-label': 'בחירת קול', onclick: () => openVoicePicker() }, svg('voice')),
        el('button', { class: 'mini', title: 'להגדיל לחלונית השיחה', 'aria-label': 'להגדיל לחלונית השיחה', onclick: () => togglePanel(true) }, svg('expand')),
        // shaped like the tab he folds into: his face on a little half-pill
        minBtn = el('button', { class: 'dm-tabbtn', title: 'לקפל ללשונית בצד המסך', 'aria-label': 'לקפל ללשונית בצד המסך', onclick: () => toTab() }, el('img', { src: '/assets/ibn-ezra-face.webp', alt: '', width: 22, height: 22 })),
        homeBtn = el('button', { class: 'mini', title: 'הביתה לאוהל', 'aria-label': 'הביתה לאוהל', onclick: () => sendHome() }, svg('tent')),
        el('button', { class: 'mini', title: 'סגירה', 'aria-label': 'סגירה', onclick: closeBalloon }, svg('x'))),
      balloonText, balloonActs,
      el('div', { class: 'dm-input' }, input, micBtn, spkBtn, el('button', { class: 'btn primary small', onclick: () => send(input.value) }, 'שלח')));
    // Folded away: a small tab with his face at the edge of the screen; a tap brings him back.
    tab = el('button', { class: 'dm-tab', hidden: true, title: 'ראב"ע – לפתוח', 'aria-label': 'לפתוח את ראב"ע' }, el('img', { src: '/assets/ibn-ezra-face.webp', alt: '', width: 48, height: 48 }));
    tab.addEventListener('click', (e) => { if (tabDragged) { tabDragged = false; e.preventDefault(); return; } minimize(false); openBalloon(); });
    dragTab();
    document.body.append(canvasBox, balloon, tab);
    syncMode();

    // Click to talk; drag to move.
    canvasBox.addEventListener('pointerdown', (e) => {
      wake();
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      canvasBox.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
          moved = true; target = null; hold = null; fly = null;
          Object.assign(finger, { x: ev.clientX, y: ev.clientY, vx: 0, vy: 0, ax: 0 });
          dragging = { x: ev.clientX, y: ev.clientY };
          if (canRag()) grabRag(start.x, start.y);
          mood = 'worried'; moodUntil = performance.now() + 400;
        }
        if (moved) dragging = { x: ev.clientX, y: ev.clientY };
      };
      let done = false;
      const onUp = (ev) => {
        if (done) return;
        done = true;
        canvasBox.removeEventListener('pointermove', onMove);
        canvasBox.removeEventListener('pointerup', onUp);
        canvasBox.removeEventListener('pointercancel', onUp);
        canvasBox.removeEventListener('lostpointercapture', onUp);
        if (ev?.type !== 'pointerup' && !moved) return;   // a cancelled tap is not a click
        if (moved && rag) { dragging = null; releaseRag(); }
        else if (moved) {
          dragging = null;
          // let go: he keeps the hand's momentum, flies, falls and lands
          const vx = Math.max(-1800, Math.min(1800, finger.vx)), vy = Math.max(-1800, Math.min(1800, finger.vy));
          const height = bottomLimit() - pos.y;
          fly = { vx, vy, big: height > 140 || vy < -500 };
          if (height < 4 && Math.abs(vy) < 200) land();
        }
        else openBalloon();
      };
      canvasBox.addEventListener('pointermove', onMove);
      canvasBox.addEventListener('pointerup', onUp);
      // a touch the system takes over (an edge swipe, a scroll), or a mouse that slips away, still lets him go
      canvasBox.addEventListener('pointercancel', onUp);
      canvasBox.addEventListener('lostpointercapture', onUp);
    });
    canvasBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBalloon(); } });
    window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; lastMouseMove = performance.now(); if (Math.hypot(e.clientX - pos.x, e.clientY - (pos.y - box.h / 2)) < 200) wake(); }, { passive: true });
    window.addEventListener('resize', () => { pos = clampPos(pos); });
  }

  function svg(name) {
    const P = {
      expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
      fold: '<path d="M5 12h14"/><path d="M9 17l3 3 3-3"/>',
      tent: '<path d="M3 20 12 4l9 16z"/><path d="M12 4v16M9 20l3-6 3 6"/>',
      send: '<path d="M20 12 4 4l3 8-3 8z"/><path d="M7 12h6"/>',
      mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
      speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
      mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
      list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
      x: '<path d="M6 6l12 12M18 6 6 18"/>',
      reset: '<path d="M4 4v6h6"/><path d="M5 15a8 8 0 1 0 2-8.5L4 10"/>',
      voice: '<path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4"/>',
      play: '<path d="M8 5.5v13l10-6.5z"/>',
    };
    const t = document.createElement('template');
    t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>`;
    return t.content.firstChild;
  }

  function placeBalloon() {
    const bw = Math.min(360, W() - 24);
    balloon.style.width = bw + 'px';
    const bh = balloon.offsetHeight;
    let left = pos.x - bw / 2;
    let top = pos.y - box.h * 0.95 - bh;
    balloon.classList.toggle('below', top < 70);
    if (top < 70) top = pos.y + 6;
    left = Math.max(12, Math.min(W() - bw - 12, left));
    top = Math.max(12, Math.min(Hh() - bh - 12, top));
    balloon.style.left = Math.round(left) + 'px';
    balloon.style.top = Math.round(top) + 'px';
    balloon.style.setProperty('--tail', `${Math.max(16, Math.min(bw - 16, pos.x - left))}px`);
  }

  /* Where he is: docked (home in the tent), out (following the person), or folded into the tab. */
  let minBtn, homeBtn, tab, gone = false;

  /* The tab at the screen's edge is dragged (vision batch 5): let go near a side and it docks there, elsewhere it floats.
     Where it is belongs to this device (CLAUDE.md, principle 2): localStorage, as fractions of the screen. */
  const TAB_KEY = 'helper.daemon.tab';
  let tabDragged = false, dockHint = null;
  const tabSpot = () => { try { return JSON.parse(localStorage.getItem(TAB_KEY) || 'null'); } catch (_) { return null; } };
  const rtl = () => getComputedStyle(document.documentElement).direction === 'rtl';
  /** the side a screen x is near, in the page's own terms (design's daemon.css: docked at the end, .dock-start, .free) */
  const sideAt = (x, near = 56) => (x < near ? (rtl() ? 'end' : 'start') : x > innerWidth - near ? (rtl() ? 'start' : 'end') : null);
  function placeTab(spot = tabSpot()) {
    tab.classList.remove('dock-start', 'free');
    const st = tab.style;
    st.left = st.top = st.bottom = '';
    if (!spot) return;                                                    // the stylesheet's place: docked at the end
    const y = Math.max(8, Math.min(innerHeight - 70, spot.y * innerHeight));
    st.top = y + 'px'; st.bottom = 'auto';                                // (its height, wherever it is)
    if (spot.side === 'start') tab.classList.add('dock-start');
    if (spot.side === 'free') { tab.classList.add('free'); st.left = Math.max(4, Math.min(innerWidth - 64, spot.x * innerWidth)) + 'px'; }
  }
  function dragTab() {
    placeTab();
    addEventListener('resize', () => placeTab());
    dockHint = el('div', { class: 'dm-dock-hint', 'aria-hidden': 'true' });
    document.body.append(dockHint);
    tab.addEventListener('pointerdown', (e) => {
      const start = { x: e.clientX, y: e.clientY }, r = tab.getBoundingClientRect(), off = { x: e.clientX - r.left, y: e.clientY - r.top };
      let moved = false, last = start;
      try { tab.setPointerCapture(e.pointerId); } catch (_) { /* a pointer that cannot be captured: the moves still come */ }
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
        moved = true; last = { x: ev.clientX, y: ev.clientY };
        tab.classList.add('dragging');
        placeTab({ side: 'free', x: (ev.clientX - off.x) / innerWidth, y: (ev.clientY - off.y) / innerHeight });
        // where it would dock if let go now: a glow on that edge
        const side = sideAt(ev.clientX);
        dockHint.className = 'dm-dock-hint' + (side ? ` ${side} on` : '');
      };
      // (where it was last moved to, unless the release has a place: a cancelled pointer comes with none)
      const up = (ev) => {
        if (moved && ev.type === 'pointerup' && (ev.clientX || ev.clientY)) last = { x: ev.clientX, y: ev.clientY };
        tab.removeEventListener('pointermove', move); tab.removeEventListener('pointerup', up); tab.removeEventListener('pointercancel', up);
        tab.classList.remove('dragging');
        dockHint.className = 'dm-dock-hint';
        if (!moved) return;
        tabDragged = true;                      // the click that follows a drag does not open him
        const y = (last.y - off.y) / innerHeight, side = sideAt(last.x);
        const spot = side ? { side, y } : { side: 'free', x: (last.x - off.x) / innerWidth, y };
        try { localStorage.setItem(TAB_KEY, JSON.stringify(spot)); } catch (_) { /* private mode: it stays for now */ }
        placeTab(spot);
      };
      tab.addEventListener('pointermove', move); tab.addEventListener('pointerup', up); tab.addEventListener('pointercancel', up);
    });
  }
  function syncMode() {
    const out = !docked;
    homeBtn.hidden = !out;
    const folded = out && prefs.minimized;
    canvasBox.hidden = folded;
    tab.hidden = !folded;
    if (folded) { balloon.hidden = true; if (panel) panel.hidden = true; }
    document.body.classList.toggle('dm-folded', folded);
  }
  function minimize(on) {
    prefs.minimized = !!on; savePrefs();
    if (!on) wake();
    syncMode();
  }
  /** Into the tab at the screen's edge (from the tent too: then he also comes along to every screen). */
  function toTab() {
    if (docked) {
      prefs.follow = true; docked = false; target = null;
      toast('ראב"ע מחכה בלשונית בצד המסך, ויבוא איתכם לכל מסך');
    }
    minimize(true);
  }
  /** He leaves his tent and comes along to every screen. */
  function comeAlong() {
    prefs.follow = true; prefs.minimized = false; savePrefs();
    const wasDocked = docked;
    docked = false; target = null;
    syncMode();
    if (wasDocked) walkTo(Math.min(W() - box.w * 0.6, pos.x + (pos.x < W() / 2 ? 140 : -140)), Math.min(bottomLimit(), pos.y + 30));
    toast('ראב"ע יבוא איתכם לכל מסך. כדי להחזיר אותו לאוהל: הכפתור עם האוהל בבועה שלו.');
  }
  /** Back home to the tent: on the home page he walks there; anywhere else he leaves the screen. */
  function sendHome() {
    prefs.follow = false; prefs.minimized = false; savePrefs();
    if (dock) { docked = true; syncMode(); goHome(); return; }
    closeBalloon(); if (panel) panel.hidden = true; stopSpeech();
    canvasBox.classList.add('leaving');
    toast('ראב"ע חזר לאוהל שלו בדף הבית');
    setTimeout(() => { gone = true; canvasBox.remove(); balloon.remove(); tab.remove(); panel?.remove(); document.body.classList.remove('dm-folded'); window.dispatchEvent(new Event('helper:daemon-home')); }, 450);
  }

  let greeted = false;
  function openBalloon() {
    wake();
    if (!greeted) { greeted = true; act('wave'); }
    balloon.hidden = false;
    canvasBox.classList.remove('unread');
    if (!balloonText.textContent) balloonText.textContent = 'כן? במה אפשר לעזור?';
    placeBalloon();
    setTimeout(() => input.focus(), 30);
  }
  function closeBalloon() { balloon.hidden = true; }

  function speakBalloon(text, keepActs) {
    balloonText.textContent = text;
    if (!keepActs) balloonActs.replaceChildren();
    if (balloon.hidden) { balloon.hidden = false; }
    placeBalloon();
  }

  /* His voice: a trained Hebrew voice from the server (Google Cloud Text-to-Speech, the person's choice), with the
     browser's own voice as the fallback. The audio's loudness drives his mouth and head (the same "voice" beat). */
  const rate = () => Math.max(0.8, Math.min(1.8, Number(prefs.rate) || 1.2));
  let speechSeq = 0, audioEl = null, audioCtx = null, analyser = null, levels = null, cloudVoice = true;
  function stopSpeech() {
    speechSeq++;
    if (audioEl) { audioEl.pause(); audioEl = null; }
    try { speechSynthesis?.cancel(); } catch (_) { /* ignore */ }
  }
  /** 'always' · 'mirror' (aloud when spoken to, in writing when written to) · 'silent'; older prefs had speak on/off */
  const voiceMode = () => prefs.voice || (prefs.speak === false ? 'silent' : 'always');
  let heardByVoice = false, answerByVoice = false;
  async function speak(text, voiceName) {
    // (voiceName: a sample from the voice picker, always heard)
    if (!text || (!voiceName && (voiceMode() === 'silent' || (voiceMode() === 'mirror' && !answerByVoice)))) return;
    stopSpeech();
    const mine = speechSeq;
    if (cloudVoice) {
      try {
        const r = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: voiceName || undefined }) });
        if (r.status === 503) cloudVoice = false;          // no voice service set up: the browser's voice from now on
        if (!r.ok) throw new Error('voice ' + r.status);
        const blob = await r.blob();
        if (mine !== speechSeq) return;
        await playAudio(URL.createObjectURL(blob), mine);
        return;
      } catch (e) {
        console.warn('cloud voice unavailable, using the browser voice', e);
        if (mine !== speechSeq) return;
      }
    }
    browserSpeak(text);
  }
  async function playAudio(url, mine) {
    const a = new Audio(url);
    a.crossOrigin = 'anonymous';
    audioEl = a;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const src = audioCtx.createMediaElementSource(a);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      levels = new Uint8Array(analyser.fftSize);
      src.connect(analyser); analyser.connect(audioCtx.destination);
    } catch (_) { analyser = null; }
    a.playbackRate = rate(); a.preservesPitch = true;
    a.onended = () => { if (audioEl === a) audioEl = null; URL.revokeObjectURL(url); };
    if (mine !== speechSeq) return;
    await a.play();
  }
  /** Called every frame: while audio plays, its loudness makes the speaking beats. */
  function voiceBeat() {
    if (!audioEl || audioEl.paused) return;
    if (analyser) {
      analyser.getByteTimeDomainData(levels);
      let sum = 0;
      for (let i = 0; i < levels.length; i++) { const v = (levels[i] - 128) / 128; sum += v * v; }
      if (Math.sqrt(sum / levels.length) > 0.06) { voice = 1; voiceT = performance.now() + 90; }
    } else if (Math.random() < 0.25) { voice = 1; voiceT = performance.now() + 110; }
  }
  function browserSpeak(text) {
    if (!('speechSynthesis' in window)) return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/https?:\/\/\S+/g, '');
    const u = new SpeechSynthesisUtterance(clean);
    const hebrew = /[֐-׿]/.test(clean);
    u.lang = hebrew ? 'he-IL' : 'en-US';
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang.startsWith(hebrew ? 'he' : 'en') && /natural|online|google/i.test(x.name)) || voices.find((x) => x.lang.startsWith(hebrew ? 'he' : 'en'));
    if (v) u.voice = v;
    u.rate = Math.min(2, 1.02 * rate());
    const beat = () => { voice = 1; voiceT = performance.now() + 110; };
    u.onboundary = beat; u.onstart = beat;
    speechSynthesis.speak(u);
  }

  async function playSample(name) {
    stopSpeech();
    const mine = speechSeq;
    try {
      const r = await fetch(`/api/voice/sample/${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error('sample ' + r.status);
      const blob = await r.blob();
      if (mine === speechSeq) await playAudio(URL.createObjectURL(blob), mine);
    } catch (e) { H.toast('הדוגמה לא נטענה, נסו שוב בעוד רגע'); }
  }

  /* Choosing his voice: the trained Hebrew voices, each with a sample; the choice is saved to the person's account. */
    async function openVoicePicker() {
    const list = el('div', { class: 'dm-voices' }, el('p', { class: 'muted' }, 'טוען קולות…'));
    H.modal(el('h2', {}, 'הקול של ראב"ע'), el('p', { class: 'muted' }, 'קולות מאומנים שמדברים עברית. לחצו ▶ כדי לשמוע (הדוגמה הראשונה לוקחת כמה שניות), ו״בחירה״ כדי שזה יהיה הקול שלו.'), list);
    let data, mine;
    try {
      [data, mine] = await Promise.all([fetch('/api/voice/voices').then((r) => r.json()), H.api('/api/voice/pref').catch(() => ({}))]);
    } catch (_) { data = { voices: [] }; }
    list.replaceChildren();
    if (!data.voices?.length) {
      list.append(el('p', {}, 'שירות הקולות עדיין לא זמין, אז הוא מדבר בקול של הדפדפן.'));
      return;
    }
    const speeds = [[1, 'רגיל'], [1.2, 'מהיר'], [1.4, 'מהיר מאוד'], [1.6, 'טיל']];
    const speedRow = el('div', { class: 'dm-speeds', role: 'group', 'aria-label': 'מהירות ההקראה' }, el('span', { class: 'muted' }, 'מהירות:'),
      ...speeds.map(([v, label]) => el('button', { class: 'btn small' + (Math.abs(rate() - v) < 0.05 ? ' primary' : ''), 'aria-pressed': String(Math.abs(rate() - v) < 0.05), onclick: (e) => {
        prefs.rate = v; savePrefs();
        speedRow.querySelectorAll('.btn').forEach((b) => { b.classList.toggle('primary', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); });
        speak('ככה אני מדבר עכשיו. מספיק מהר?', (mine?.voice || data.default));
      } }, label)));
    list.append(speedRow);
    const current = mine?.voice || data.default;
    const groups = [['male', 'קולות גבריים'], ['female', 'קולות נשיים']];
    for (const [g, title] of groups) {
      const vs = data.voices.filter((v) => v.gender === g);
      if (!vs.length) continue;
      list.append(el('h3', {}, title));
      for (const v of vs) {
        const pick = el('button', { class: 'btn small' + (v.name === current ? ' primary' : ''), onclick: async () => {
          await H.api('/api/voice/pref', { method: 'PUT', body: { voice: v.name } });
          list.querySelectorAll('.dm-voice .btn.small:not(.play)').forEach((b) => { b.classList.remove('primary'); b.textContent = 'בחירה'; });
          pick.classList.add('primary'); pick.textContent = 'נבחר';
          H.toast(`ראב"ע ידבר עכשיו בקול ${v.label}`);
        } }, v.name === current ? 'נבחר' : 'בחירה');
        list.append(el('div', { class: 'dm-voice' },
          el('button', { class: 'btn small play', 'aria-label': `השמעת דוגמה: ${v.label}`, onclick: () => playSample(v.name) }, svg('play')),
          el('span', { class: 'name' }, v.label, v.trait ? el('small', {}, ' · ' + v.trait) : ''),
          pick));
      }
    }
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function toggleMic() {
    if (!Recognition) return toast('הדפדפן הזה לא תומך בדיבור. נסו בכרום או באדג׳.');
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = 'he-IL';
    rec.interimResults = true;
    rec.onresult = (e) => { input.value = [...e.results].map((r) => r[0].transcript).join(''); };
    rec.onend = () => { micBtn.classList.remove('on'); const t = input.value.trim(); rec = null; if (t) { heardByVoice = true; send(t); } };
    rec.onerror = () => { micBtn.classList.remove('on'); rec = null; };
    stopSpeech();
    micBtn.classList.add('on');
    setMood('curious', 3);
    rec.start();
  }

  /* The full conversation: a drawer (or inline on the home page). */
  function buildPanel() {
    log = el('div', { class: 'dm-log' });
    panelInput = el('textarea', { rows: 1, placeholder: 'כתבו לראב"ע…', 'aria-label': 'הודעה לעוזר', dir: 'auto' });
    const grow = () => { panelInput.style.blockSize = 'auto'; panelInput.style.blockSize = Math.min(140, panelInput.scrollHeight) + 'px'; };
    panelInput.addEventListener('input', grow);
    panelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(panelInput.value); panelInput.value = ''; grow(); }
      if (e.key === 'Escape') togglePanel(false);
    });
    panel = el('section', { class: 'dm-panel', hidden: true, role: 'dialog', 'aria-label': 'השיחה עם ראב"ע' },
      el('div', { class: 'dm-head' }, el('img', { class: 'face', src: '/assets/ibn-ezra-face.webp', alt: '', width: 34, height: 34 }), el('b', {}, 'השיחה'), el('span', { class: 'spacer' }),
        el('button', { class: 'mini', title: 'שיחה חדשה', 'aria-label': 'שיחה חדשה', onclick: async () => {
          if (!confirm('להתחיל שיחה חדשה? העוזר יזכור את הדברים החשובים.')) return;
          await api('/api/daemon/reset', { method: 'POST' });
          log.textContent = '';
          toast('שיחה חדשה');
        } }, svg('reset')),
        el('button', { class: 'mini', title: 'סגירה', 'aria-label': 'סגירה', onclick: () => togglePanel(false) }, svg('x'))),
      log,
      el('div', { class: 'dm-compose' }, panelInput, el('button', { class: 'btn primary', 'aria-label': 'שלח', onclick: () => { send(panelInput.value); panelInput.value = ''; grow(); } }, svg('send'))));
    return panel;
  }
  let panelInput;
  function togglePanel(open) {
    panel.hidden = !(open ?? panel.hidden);
    if (!panel.hidden) {
      // the balloon's draft moves into the big panel
      if (input.value.trim()) { panelInput.value = input.value; input.value = ''; }
      closeBalloon();
      log.scrollTop = log.scrollHeight;
      setTimeout(() => panelInput.focus(), 60);
    }
  }
  function addMsg(who, text, extra = {}) {
    const m = el('div', { class: 'dm-msg ' + who, dir: 'auto' }, text);
    if (extra.sources?.length) m.append(...extra.sources.map((s) => el('a', { class: 'src', href: s.url, target: '_blank', rel: 'noopener' }, s.title || new URL(s.url).hostname)));
    if (extra.actions?.length) m.append(el('div', { class: 'acts' }, extra.actions.map((a) => a.cloneNode(true))));
    log.append(m);
    log.scrollTop = log.scrollHeight;
  }

  /** the figure small, for a head: Ibn Ezra's face, or the 2D figure as an icon (or alive: prefs.header 'animated') */
  const heads = [];
  function headFigure(cls = 'face', size = 34) {
    const span = el('span', { class: 'dm-headfig ' + cls, 'aria-hidden': 'true' });
    if (flat && window.Figure2D) Figure2D.mount(span, flatFigure, { size, still: prefs.header !== 'animated' || size > 40 }).then((f) => heads.push(f)).catch(() => {});
    else span.append(el('img', { src: '/assets/ibn-ezra-face.webp', alt: '', width: size, height: size }));
    return span;
  }
  function updateLabels() {
    const d = state?.daemon;
    if (!d) return;
    heads.splice(0).forEach((h) => h.destroy?.());   // the small figures drawn last time
    const name = flat ? (Figure2D.list().find((f) => f.id === flatFigure)?.name || 'העוזר') : d.form.he;
    // the figure instead of its name (the name stays for screen readers)
    nameEl.replaceChildren(headFigure());
    nameEl.setAttribute('aria-label', name);
    panel?.querySelector('.dm-head .face')?.replaceWith(headFigure());
    if (flat) { tab.querySelector('img, .dm-headfig')?.replaceWith(headFigure('tab-fig', 48)); minBtn?.querySelector('img, .dm-headfig')?.replaceWith(headFigure('btn-fig', 22)); }
    tab.setAttribute('aria-label', `לפתוח את ${name}`); tab.title = `${name} – לפתוח`;
    canvasBox.setAttribute('aria-label', `${name} – לחצו כדי לדבר`);
  }

  /* ---------- without AI (docs/ai/without-ai.md #8): he cannot follow every sentence, but he knows the way – a place on
     this screen he points to, a part of the tent he takes you to, or a short menu with a tip. His voice stays the
     browser's own. (Actions are links: the chat panel copies them.) ---------- */
  const TIPS = [
    'אפשר לסמן טקסט בכל מקום באוהל וללחוץ "שמירה כפתק".',
    'ברשימת הקניות, ✓ על מוצר מעביר אותו לסל; מה שלא נקנה נשאר לפעם הבאה.',
    'בחדשות, ⋯ ליד כתבה שומר אותה, משתף אותה או פותח אותה באתר המקורי.',
    'בטלפון אפשר "לשתף" כל דבר אל האוהל, והוא מחכה בתיבת הנכנסים של עוזר המחקר.',
    'בפתקים, #מילה היא תגית, ולחיצה עליה מסננת את הרשימה.',
    'במחשבון אפשר לכתוב גם אחוזים, שברים ויחידות, כמו 15% מ־240.',
    'בהגדרות בוחרים צבעים, גודל אותיות, ואת הקול שלי.',
  ];
  const SYN = {
    '/groceries/': 'קניות לקנות סופר חסר', '/groceries/#book': 'מתכון מתכונים לבשל', '/news/': 'חדשות כתבה כתבות עדכונים',
    '/tools/notes/': 'פתק פתקים לרשום לזכור', '/tools/calendar/': 'לוח חג חגים תאריך הולדת חנוכה פסח פורים סוכות צום', '/tools/calc/': 'מחשבון לחשב תרגיל אחוז אחוזים כמה',
    '/mail/': 'מייל דואר', '/family/': 'משפחה עץ סבא סבתא', '/songs/': 'שיר שירים אקורדים זמירות', '/parasha/': 'פרשה שבת נרות',
    '/settings/': 'הגדרות חשבון נגישות קול', '/food/fridge/': 'מקרר', '/fun/': 'סרט סדרה משחק', '/gather/': 'מפגש ארוחה אירוח',
  };
  const PLAIN_STOP = new Set('יום היום שלום מה איך אני אתה רוצה רוצים צריך אפשר תודה בבקשה עם של את זה זו לי לך יש אין איפה כל עוד כן לא טוב שלומך'.split(' '));
  const wordsOf = (s) => (String(s || '').match(/[\p{L}\p{N}]+/gu) || []).map((w) => (w.length > 3 ? w.replace(/^[והבלמש]/, '') : w)).filter((w) => w.length > 1 && !PLAIN_STOP.has(w));
  const hits = (said, words) => said.filter((w) => words.some((x) => x === w || (w.length > 3 && x.length > 3 && (x.startsWith(w) || w.startsWith(x))))).length;
  const link = (href, label) => el('a', { class: 'btn ghost small', href }, label);
  async function plainReply(text) {
    const said = wordsOf(text);
    // a place on this screen
    const spot = !overlay && said.length ? landmarks().map((l) => [l, hits(said, wordsOf(l.label))]).sort((a, b) => b[1] - a[1])[0] : null;
    if (spot && spot[1]) {
      const say = 'הנה, כאן.';
      addMsg('daemon', say); speak(say);
      showElement(document.querySelector(`[data-guide="${CSS.escape(spot[0].key)}"]`), say);
      return;
    }
    // a part of the tent
    try { await H.loadOnce('/assets/apps.js'); } catch (_) { /* the menu still has the tip */ }
    // its name and the words people use for it count twice its description; one word of a description is not enough
    const apps = (H.APPS || []).map((a) => [a, 2 * hits(said, wordsOf(`${a.name} ${SYN[a.href] || ''}`)) + hits(said, wordsOf(a.sub))]).sort((a, b) => b[1] - a[1]);
    let say, actions;
    if (apps[0]?.[1] >= 2) {
      const a = apps[0][0];
      say = `ל${a.name}? ${a.sub}.`;
      actions = [link(a.href, 'לשם ←')];
    } else {
      say = `${text ? 'בלי העוזר החכם אני לא מבין כל משפט, אבל את הדרך אני יודע. ' : ''}טיפ: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
      actions = [...(H.ringApps?.() || []).slice(1, 5).map((a) => link(a.href, a.name)), link('/settings/', '✨ לחבר לי מוח')];
    }
    balloonActs.replaceChildren(...actions);
    if (panel.hidden) speakBalloon(say, true);
    addMsg('daemon', say, { actions });
    speak(say);
  }

  async function send(text, event) {
    text = (text || '').trim();
    if ((!text && !event) || busy) return;
    answerByVoice = heardByVoice; heardByVoice = false;
    if (!state?.ai) { input.value = ''; if (text) addMsg('me', text); return plainReply(text); }
    busy = true;
    wake();
    if (parts) parts.thinkStyle = Math.random() < 0.35 ? 'phone' : 'think';
    input.value = '';
    if (text) addMsg('me', text);
    if (panel.hidden) speakBalloon('…');
    canvasBox.classList.add('thinking');
    setMood('curious', 30);
    try {
      const r = await api('/api/daemon/chat', { body: { text, event, page: overlay ? 'the desktop (the program over all windows)' : location.pathname + location.hash, landmarks: overlay ? [] : landmarks(), where: docked ? 'tent' : prefs.minimized ? 'tab' : 'out' } });
      state.daemon = r.daemon;
      mood = null;
      const actions = [];
      let pointAt = null;
      for (const ev of r.events) {
        if (ev.type === 'shapeshift') shapeshift(ev.form, true);
        if (ev.type === 'emote') setMood(ev.mood);
        if (ev.type === 'point') pointAt = ev;
        if (ev.type === 'open') actions.push(el('a', { class: 'btn ghost small', href: ev.href }, ev.label.replace(/^\S+\s/, '')));
        if (ev.type === 'mail_plan') actions.push(el('a', { class: 'btn primary small', href: `/mail/#plan=${ev.id}` }, 'לבדיקה ולאישור'));
        if (ev.type === 'groceries_changed') window.dispatchEvent(new Event('helper:groceries-changed'));
        if (ev.type === 'follow') setTimeout(() => (ev.on ? comeAlong() : sendHome()), 1200);
        if (ev.type === 'recipes_changed') window.dispatchEvent(new Event('helper:recipes-changed'));
      }
      // something done (the list, the recipes, a plan, a page to open): a moment of joy (a 2D figure smiles and hops)
      if (r.events.some((e) => ['groceries_changed', 'recipes_changed', 'mail_plan', 'open'].includes(e.type)) && !r.events.some((e) => e.type === 'emote')) setMood('happy');
      updateLabels();
      const reply = r.reply || (pointAt?.say) || 'בוצע.';
      balloonActs.replaceChildren(...actions);
      if (panel.hidden) speakBalloon(reply, true);
      addMsg('daemon', reply, { sources: r.sources, actions });
      speak(reply);
      if (parts?.mixer && !r.events.some((e) => e.type === 'point')) {
        if (/והמשכיל יבין|סוד/.test(reply)) act('secret');
        else if (/(^|\s)(ראפ|rap)|שיר(ה)?\b/i.test(text + ' ' + reply) && /שיר|ראפ|rap|song/i.test(text)) act('rap');
        else if (/מזל|כוכב|נולדתי/.test(reply)) act('shrug');
        else if (event && /first meeting/.test(event)) act('bow');
        else act(Math.random() < 0.5 ? 'talk' : 'talk2');
      }
      if (pointAt) {
        const target = document.querySelector(`[data-guide="${CSS.escape(pointAt.target)}"]`);
        setTimeout(() => showElement(target, null), 500);
      } else if (r.events.some((e) => e.type === 'groceries_changed')) {
        setTimeout(() => showElement(document.querySelector('[data-guide="list"]'), null), 500);
      }
    } catch (e) {
      mood = null;
      // no AI (none connected, or no credit left): what he can do without it
      if (e.status === 402 || e.status === 503) { busy = false; canvasBox.classList.remove('thinking'); return plainReply(text); }
      speakBalloon('אוי, משהו השתבש: ' + e.message);
      setMood('worried');
    } finally {
      busy = false;
      canvasBox.classList.remove('thinking');
    }
  }

  /* ===================== mounting ===================== */
  let overlay = false;
  /** opts.dock: the spot in his tent on the home page (he lives there unless asked to come along). opts.overlay: the desktop program. */
  async function mount(container, opts = {}) {
    overlay = !!opts.overlay;
    dock = opts.dock || null;
    docked = !!dock && !prefs.follow;
    const r = await H.me();
    if (!r.user) return false;
    if (!dock && !prefs.follow) return false;  // at home in his tent: other screens and the desktop see him only when he was asked along
    try { state = await api('/api/daemon', { noRedirect: true }); } catch (_) { return; }
    // a 2D figure the person chose (and that is drawn already), else the 3D Ibn Ezra
    // (Ibn Ezra is the owner's family's: anyone else who has not chosen gets the first figure, once figures are drawn)
    const catalogue = wantsFlat() || state.ibnEzra === false ? await flatCatalogue() : [];
    const flatId = wantsFlat() && catalogue.some((f) => f.id === prefs.figure) ? prefs.figure : state.ibnEzra === false ? defaultFigure(catalogue) : null;
    if (!flatId) { try { await initThree(); } catch (e) { console.warn('3D companion unavailable', e); return; } }
    if (innerWidth < 600) { box.w = 170; box.h = 170; }
    if (innerWidth <= 420) { box.w = 136; box.h = 136; } // matches daemon.css: smaller on phones so he covers less
    buildUI();
    document.body.append(buildPanel());
    for (const m of state.transcript) addMsg(m.who, m.text);
    if (flatId) {
      const holder = el('div', { class: 'dm-flat' });
      canvasBox.append(holder);
      flatFigure = flatId;
      try { flat = await Figure2D.mount(holder, flatId, { size: Math.min(box.w, box.h), look: true }); } catch (e) { console.warn('2D figure missing', e); return; }
      parts = { flat: true, wings: [] };   // (the walk asks whether he flies)
    } else {
      const first = bodyFor(state.daemon.form);
      if (first.figure) { try { figureScenes[first.figure] = await loadFigure(first.figure); } catch (e) { console.warn('figure model missing', e); } }
      build(first);
    }
    updateLabels();
    const firstMeeting = () => {
      if (!state.transcript.length && dock) send('', 'first meeting: the person just opened the helper and sees you for the first time, standing at the entrance of your tent');
      else if (!state.transcript.length) canvasBox.classList.add('unread');
    };
    if (docked) {
      // At home: he is already standing at the tent's entrance.
      pos = dockSpot();
      setTimeout(firstMeeting, 900);
    } else {
      // Following the person: he walks in from the edge of the screen.
      const home = homeSpot();
      pos = { x: reduced ? home.x : -box.w, y: home.y };
      walkTo(home.x, home.y, firstMeeting);
    }
    requestAnimationFrame(frame);
    return true;
  }

  H.daemon = { mount, showElement, comeAlong, sendHome, minimize, get holding() { return !!dragging; }, get _parts() { return parts; }, get _rag() { return rag && { state: rag.state, pin: rag.pin, t: rag.t, still: rag.still }; }, _play: (n) => play(n, true) };
})();
