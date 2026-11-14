/* Voice for the tools (the kitchen's chef and "הבא", breath's guiding voice): speaking and listening, in one place.
 *   Voice.say(text)         → speaks with the app's voice (/api/voice/say, the person's chosen voice), or the browser's
 *                             Hebrew voice when that fails. Short phrases said again and again are kept in memory.
 *   Voice.stop()            → stops speaking
 *   Voice.canListen         → whether this browser can listen (Chrome, Edge, Safari)
 *   Voice.listen(onText, {once}) → listens in Hebrew; onText(text) for every phrase heard. Returns stop().
 */
(function () {
  const kept = new Map();   // text → object URL of its audio
  let audio = null;

  function browserSay(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'he-IL';
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith('he'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  async function say(text, { keep = false } = {}) {
    stop();
    text = String(text || '').trim();
    if (!text) return;
    try {
      let url = kept.get(text);
      if (!url) {
        const r = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
        if (!r.ok) throw new Error(String(r.status));
        url = URL.createObjectURL(await r.blob());
        if (keep) kept.set(text, url);
      }
      const a = new Audio(url);
      audio = a;
      a.onended = () => { if (audio === a) audio = null; if (!kept.has(text)) URL.revokeObjectURL(url); };
      await a.play();
    } catch { browserSay(text); }
  }

  function stop() {
    if (audio) { audio.pause(); audio = null; }
    try { speechSynthesis?.cancel(); } catch { /* none */ }
  }

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(onText, { once = false } = {}) {
    if (!Rec) return () => {};
    let on = true;
    const r = new Rec();
    r.lang = 'he-IL';
    r.continuous = !once;
    r.interimResults = false;
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
    // a phone stops listening after a pause: start again while still on
    r.onend = () => { if (on && !once) try { r.start(); } catch { /* already */ } };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') on = false; };
    try { r.start(); } catch { /* already */ }
    return () => { on = false; try { r.stop(); } catch { /* none */ } };
  }

  window.Voice = { say, stop, listen, canListen: !!Rec };
})();
