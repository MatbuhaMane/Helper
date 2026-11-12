# עוזר מחקר – the look of the core (design → ai-features)

The spec is vision's (`docs/vision/research.md`, "האפיון, גרסה 1"); this is build step 1, the core: the dashboard, quick
capture and the inbox, notes with links and backlinks, the open threads, and the "share this private note?" question.
The styles are in `public/tools/research/research.css`; the prototype of every screen is
`docs/design/prototype/research.html` (copy it to `public/` for a moment to open it on the dev server). Copy its markup.

Everything sits in `<main class="wide"><div class="rx">…</div></main>`. The prefix is `.rx-` (`.rs-` is already the
restaurants' and the study room's). The motivation layer (today, the weekly review, the badges, "גשש") is goal
management's: reuse its markup and `goals.css` there.

| Part | Markup | Notes |
|---|---|---|
| Quick capture | `form.rx-capture > input + button.rx-attach + button.btn.primary.small(📥 <span class="rx-long">לתיבה</span>)` | one line for anything; "שתף אל האוהל" lands in the same inbox |
| One thread a day | `a.rx-oneday > .rx-em + div(small, b, small)` | goals' motivation layer, research's flavour |
| The inbox card | `a.card.rx-inboxcard > div(.rx-count(.zero), b) + ul > li` | the last three caught |
| A research | `article.card.rx-study > div(.rx-kind, h3 > a, .rx-roles?) + svg.rx-sky + .rx-stats(span > b; .open)` | the link in `h3` covers the card |
| Its constellation | `svg.rx-sky[viewBox="0 0 104 76"] > line… + circle(.open)…` | its notes as stars (an open question amber), its links as threads: a small preview of the knowledge map; up to ~12 stars, laid out by the same layout as the map |
| Roles | `.rx-roles > i[style=background]` (initials) | owner, editor, contributor, reader: the role shows in the share dialog and the member list, not here |
| The inbox | `ul.rx-inbox > li.card.rx-cap > span.rx-type + div(p or blockquote, small) + .rx-cap-acts` | the kind as an emoji: 🔗 💬 ❓ 📷 🎙; the most likely action first (btn primary) |
| A note | `.rx-notepage > article.card.rx-note + aside.rx-side` | two columns from 861 px, one on a phone |
| Its head | `.rx-note-meta(span, span.rx-private?) + h1` | |
| Its words | `.rx-body > p` with `a.rx-link` (`.new` for a note not written yet) and `a.rx-cite` (a source number) | |
| Its researches | `.rx-in > small + a.chip…` | the same note, not a copy |
| Its sources | `ol.rx-sources > li.rx-source > b[dir=auto] + small(span.rx-trust.hi/.mid/.lo/.retracted, …)` | numbered by CSS; the reliability is always in words, the colour only helps |
| Backlinks | `aside.rx-side > section.card.rx-backs > h2(… .rx-count) + ul > li > a > b + span(… mark …)` | the snippet around the mention, the matched words in `mark` |
| The threads | `.rx-filters > .chip[aria-pressed]`, then `section.rx-group > h3 + ul.rx-threads > li.card.rx-thread(.answered/.paused/.today) > span.rx-dot + div(b, small > span…) + span.rx-state` | grouped by research |
| Share a private note? | in H.modal: `.rx-share > h2 + .rx-preview(b, small) + p.rx-what(… span.rx-ref) + .rx-acts` | asked every time; a note kept private shows to partners as `span.rx-ref` ("🔒 פתק פרטי") |

✨ follows `docs/design/ai-upgrade.md`: the plain action first in an `.ai-pair`, then `btn ai-up` (with `offer` when there
is no AI); what the AI made gets a `p.ai-note`. In the core: "✨ סיכום והשוואה" beside "+ מקור לפי DOI".

Still to design (the spec's later steps): the knowledge map (in the forest's language), the PDF reader whose highlights
become notes, the writing outline with the academic templates, the literature-review matrix and the timeline.
