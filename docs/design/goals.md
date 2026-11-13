# ניהול מטרות – the look (design → ai-features)

The spec is vision's (`docs/vision/goals.md`, "האפיון, גרסה 1"). The styles are in `public/tools/tasks/goals.css`; the
prototype with every screen, built on those styles, is `docs/design/prototype/goals.html` (copy it to `public/` for a
moment to open it on the dev server). Copy its markup; the JS there only switches screens and toggles states.

Everything sits in `<main class="wide"><div class="gl">…</div></main>` (`.gl` carries the tool's few colours: the ember of
consistency, the rest day's violet). Load `/assets/base.css` and `/tools/tasks/goals.css`.

## The parts

| Part | Markup | Notes |
|---|---|---|
| A goal's fill | `.gl-ring-box > .gl-ring[style="--p:38"] + b` (`.big` on the box for a goal's page; `.done` on the ring at 100) | `--p` 0–100; it eases when it grows (`@property`) |
| The path | `ol.gl-path[style="--n:5;--at:1.5"] > li.gl-stop(.done/.now) > i + span` | `--n` stations, `--at` how far the thread is filled (0 … n-1, fractions allowed) |
| The week | `.gl-week > .gl-days > i.gl-day(.done/.today/.rest) ×7 + small` ("השבוע **4 מתוך 6**") | the rest day is a candle, never a gap; count only the working days |
| The length | `span.gl-len` (`.short` / – / `.long`) | |
| The next step | `p.gl-next > b` | |
| Today's card (dashboard) | `a.gl-todaycard > .gl-flame + div(b, small) + .gl-go` | |
| A goal card | `article.card.gl-goal > .gl-goal-top(ring box, div(.gl-len, h3 > a, p.gl-reason)) + ol.gl-path + p.gl-next + .gl-week` | the link in `h3` covers the card |
| A goal's page | `section.card.gl-hero` then `.gl-procs > details.card.gl-proc > summary(ring box, h3, small) + ul.gl-checks` | |
| A checklist row | `li.gl-check(.next) > input[type=checkbox] + label + button.gl-stuckbtn?` | `.next` lights the next step |
| Today | `.gl-today > article.card.gl-tstep > button.gl-tick[aria-pressed] + div(b, small) + .gl-tstep-acts` | 2–3 of them; then `article.card.gl-alldone` |
| The why comes back | `article.card.gl-whyback > p + blockquote + p` | after two days with no step; no scolding |
| נתקעתי | `button.gl-stuckbtn`; the modal (H.modal): `.gl-stuckbox > h2 + p.gl-from + span.gl-five + p.gl-q + input + .ai-pair(btn primary, btn ai-up) + p.ai-note?` | |
| Weekly review | `section.card.gl-review > header(h1, .gl-minute) + .gl-week + .gl-rq(label, .gl-quick > .chip[aria-pressed], textarea) ×3` | |
| New goal | `section.card.gl-new > ol.gl-steps > li(.done/.now) > span` ×5, then the step's own parts: `.gl-field.gl-write(textarea, button.gl-mic[aria-pressed])`, `.gl-lens[role=radiogroup] > button[role=radio][aria-checked]`, `ol.gl-plist > li(input, button.gl-x)`, `.gl-wdays > button[aria-pressed]` (`.rest` + disabled for the rest day), `.gl-new-acts` | ✨ next to the plain action in `.ai-pair`, as in `ai-upgrade.md` |
| The badge wall | `.gl-wall > section.gl-shelf > h3 + ul.gl-patches > li > button.gl-badge(.on/.secret/.soon/.new)[aria-expanded] > img + b + span.gl-bar? + span.gl-tip[role=tooltip]` | see below |
| My badges (dashboard) | `.gl-mine > button.gl-badge …` | the last ones earned |

## The badges

Embroidered patches in the cushions' style, made with the image tool (prompts: `figures/art/library/badges/README.md`).
The pictures are `/assets/badges/<id>.webp` (320 px, transparent); the 640 px masters are in `figures/art/library/badges/`.

- **Earned:** `button.gl-badge.on` with the picture, the name, and in `.gl-tip`: name, how, and "נרקם אצלך ב…".
- **Not yet:** no `.on` (greyed and faded), and `span.gl-bar > i[style="--p:41"]` when there is a count (41 of 100).
- **Secret** (דרך החיים): `.secret`, the picture `/assets/badges/secret.webp` (a silhouette), the name `???`, and the tip
  "טלאי סודי · מי שימצא אותו, יידע." Its real picture is `/assets/badges/the_way.acc4adef.webp` – a name nobody
  guesses: send it only once it is earned.
- **Just earned:** add `.new` once; the patch stitches itself onto the wall.
- **The way to it:** on a computer the glass card opens above the patch on hover; on a phone (or any touch screen) a tap
  sets `aria-expanded="true"` and it rises from the bottom. One open at a time; a tap elsewhere closes it.

| id | name | shelf |
|---|---|---|
| peg | יתד ראשונה | התחלה ועקביות |
| ember | גחלת | 〃 |
| fire | מדורה | 〃 |
| eternal | אש תמיד | 〃 (with the verse in a `q`) |
| rest_return | שבת למנוחה | 〃 (for those who keep Shabbat; other traditions get their own later) |
| rest_seven | אֶת־שַׁבְּתֹתַי תִּשְׁמֹרוּ | 〃 |
| pole | עמוד האוהל | התקדמות |
| standing | האוהל עומד | 〃 |
| journey | מסע | 〃 |
| tracker | גשש | 〃 (waits for the research assistant) |
| dawn | עלות השחר | 〃 |
| night | משמרת לילה | 〃 |
| traveller | איש / אשת מסע | 〃 |
| gifts | מתנות קטנות | 〃 |
| milestones | אבני דרך | 〃 |
| highway | דרך ראשית | 〃 |
| way_of_life | דרך חיים | 〃 |
| the_way | דרך החיים (secret) | 〃 |
| kings_way | דרך המלך | 〃 |
| tribe | שבט | משפחה וחברים |
| angel | מלאך דרך | 〃 |
| adviser | יועץ | 〃 |
| shoulder | כתף תומכת | 〃 |

All 23 are embroidered.
