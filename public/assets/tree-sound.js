/* The family tree's sounds (vision: docs/vision/tree.md): soft, short, made on the spot with Web Audio (no files).
   TreeSound.leaf()   a touch on a living person's leaf: a soft wooden tok and a breath of leaves, a short buzz
   TreeSound.quiet()  a touch on one who has passed: one low, quiet, round tone; no buzz, nothing cheerful
   TreeSound.bud()    the "+" bud: a small rising pluck
   TreeSound.settle() the scroll comes to rest on a branch: a faint rustle
   Silent when the person turned sounds off (H.soundsOn) or before the first touch (browsers allow sound only after one). */
(function () {
  let ctx = null;
  const on = () => !(window.H && H.soundsOn && !H.soundsOn());
  const ac = () => { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  const buzz = (ms) => { if (window.H && H.vibrate) H.vibrate(ms); else navigator.vibrate?.(ms); };

  /** A plucked tone: a sine (and a soft octave) with a quick attack and a decay. */
  function tone(a, freq, at, dur, vol, type = 'sine') {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(a.destination); o.start(at); o.stop(at + dur + 0.02);
  }
  /** A breath of noise through a band filter: leaves. */
  function rustle(a, at, dur, vol, freq = 3200) {
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9; g.gain.value = vol;
    s.buffer = buf; s.connect(bp).connect(g).connect(a.destination); s.start(at);
  }

  const TreeSound = {
    leaf() { buzz(10); if (!on()) return; const a = ac(); if (!a) return; const t = a.currentTime;
      tone(a, 520, t, 0.16, 0.10, 'triangle'); tone(a, 1040, t, 0.08, 0.025); rustle(a, t + 0.01, 0.14, 0.05); },
    quiet() { if (!on()) return; const a = ac(); if (!a) return; const t = a.currentTime;
      tone(a, 196, t, 1.6, 0.06); tone(a, 293.7, t + 0.02, 1.3, 0.025); },
    bud() { buzz(8); if (!on()) return; const a = ac(); if (!a) return; const t = a.currentTime;
      tone(a, 660, t, 0.12, 0.07, 'triangle'); tone(a, 880, t + 0.07, 0.18, 0.06, 'triangle'); },
    settle() { if (!on()) return; const a = ac(); if (!a) return; rustle(a, a.currentTime, 0.28, 0.03, 2400); },
  };
  window.TreeSound = TreeSound;
})();
