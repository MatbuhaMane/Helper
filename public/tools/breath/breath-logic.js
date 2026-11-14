/**
 * מדיטציה ונשימה, the pure part: the breathing patterns and where in the pattern a moment falls. Tested in
 * server/test-breath.mjs.
 *   Breath.PATTERNS                 → [{ id, name, line, steps: [[phase, seconds]…] }]
 *   Breath.at(pattern, sec)         → { phase, word, left (seconds left in this phase), i (the step), round }
 *   Breath.rounds(pattern, minutes) → whole rounds that fit (at least one), so a session always ends on an out-breath
 */
(function () {
  const WORD = { in: 'שאיפה', hold: 'החזקה', out: 'נשיפה', rest: 'מנוחה' };
  const PATTERNS = [
    { id: 'calm', name: 'נשימה שקטה', line: 'שאיפה של 4 שניות, נשיפה של 6. מרגיע בלי מאמץ.', steps: [['in', 4], ['out', 6]] },
    { id: 'box', name: 'נשימת קופסה', line: '4 שאיפה, 4 החזקה, 4 נשיפה, 4 מנוחה. ממקד.', steps: [['in', 4], ['hold', 4], ['out', 4], ['rest', 4]] },
    { id: '478', name: '4-7-8 לפני השינה', line: '4 שאיפה, 7 החזקה, 8 נשיפה. עוזר להירדם.', steps: [['in', 4], ['hold', 7], ['out', 8]] },
  ];
  const length = (p) => p.steps.reduce((s, [, n]) => s + n, 0);
  const rounds = (p, minutes) => Math.max(1, Math.round((minutes * 60) / length(p)));

  function at(p, sec) {
    const L = length(p);
    const round = Math.floor(sec / L);
    let t = sec - round * L;
    for (let i = 0; i < p.steps.length; i++) {
      const [phase, n] = p.steps[i];
      if (t < n) return { phase, word: WORD[phase], left: n - t, i, round };
      t -= n;
    }
    const [phase] = p.steps[p.steps.length - 1];
    return { phase, word: WORD[phase], left: 0, i: p.steps.length - 1, round };
  }

  /** the habit a session ticks (the owner's answer: "סשן מסמן את ההרגל"): in the person's goals (GET /api/goals), an active
      goal about breathing or meditation, and the step to tick in it: a step that names breathing first, else the goal's
      first undone step. Recurring goals (the habits) come first. → { goal, step } (ids and texts) or null */
  const ABOUT = /נשימ|לנשום|נושמ|מדיטצי|מדט|להירגע|רוגע/;
  function habit(goals) {
    const live = (goals || []).filter((g) => g && g.status === 'active');
    live.sort((a, b) => (b.repeat ? 1 : 0) - (a.repeat ? 1 : 0));
    const stepsOf = (g) => (g.processes || []).flatMap((p) => p.steps || []).filter((s) => !s.done);
    for (const g of live) { const s = stepsOf(g).find((x) => ABOUT.test(x.text || '')); if (s) return { goal: g.id, title: g.title, step: s.id, text: s.text }; }
    for (const g of live) { if (!ABOUT.test(g.title || '')) continue; const s = stepsOf(g)[0]; if (s) return { goal: g.id, title: g.title, step: s.id, text: s.text }; }
    return null;
  }

  const api = { PATTERNS, WORD, at, rounds, length, habit };
  if (typeof window !== 'undefined') window.Breath = api;
  if (typeof globalThis !== 'undefined') globalThis.Breath = api;
})();
