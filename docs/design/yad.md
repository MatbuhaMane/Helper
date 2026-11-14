# יד ביד, שלב 1: the look (design → ai-features)

Design, 2026-11-15, vision batch 36. The spec is vision's (`docs/vision/yad-beyad.md`). The styles are `public/tools/yad/yad.css`;
the prototype with every screen is `docs/design/prototype/yad.html` (copy it to `public/` for a moment). Copy its markup; its JS
only opens sheets and toggles states. Load `/assets/base.css` and `/tools/yad/yad.css`. Everything sits in `<main class="yd">`.
The owner's words are kept as they are: צורך, לוח הדרושים, יצירת צורך, הצרכים שמילאתי, הצרכים שלי, יד / ידיים.

## The token is not money
The hand glyph (`<svg class="yd-h"><use href="#yd-hand"/></svg>`, an outline hand, sprite in the prototype) beside a number. No coin, no disc,
no currency sign, no rising arrow, no gold. The tool's icon is `app-icons/yad.webp`.

## The screens
| Screen | What | Notes |
|---|---|---|
| First | `.yd-banner` (the user: silhouette, name, area) → `.yd-dash` (4 figures) → `.yd-acts` (2 buttons) → `.yd-lists` (2 lists) | one column on a phone; from 880 px the figures are one row of four and the lists sit side by side |
| Figures | `.yd-fig.bal` the balance · `.yd-fig.ex` given and received (this month, in total; each is a labelled pair, no ranking) · `a.yd-fig` my share to the treasury (opens the treasury) · `.yd-fig.wait(.has)` waiting for me (amber when there is something) | on a phone: balance and exchange on full rows, the other two side by side |
| Buttons | `.yd-acts`: לוח הדרושים (primary) and יצירת צורך, side by side at every width, 52 px tall | |
| Lists | `.yd-list` with `.yd-seg` (פעילים / מהעבר) and `.yd-rows` | a row: icon, title, a small line, tags, the hands on the end |
| Board sheet | `H.modal` with `.yd-sheet`: sort `.yd-seg` (מרחק / סוג), quick `.chip`s, `details.yd-adv` (advanced filter), then `.yd-need` cards | public needs are `.yd-need.pub` with the tag "לטובת הציבור"; a treasury-paid one says "לטובת הציבור, משולם מהקופה". Distance only as "כ-3 ק"מ" |
| Create sheet | description, `.yd-seg` מהרשימה / לא ברשימה, then either kinds (`.yd-kind`, the level comes with the kind, only the time is estimated) or two 1–5 scales (קושי, בקיאות) and the note `.yd-note.pend` ("הרמה ממתינה לאישור"); `.yd-est`; small link "עשיתי מעשה" | the link opens its own small sheet |
| Profile | `.yd-give`: services I am willing to give, grouped in `details`, and my area with the GPS switch | no offers board |
| Treasury | `.yd-pot` (the balance), `.yd-pub-ask` (my share, the "בקשה לטובת הציבור" button, disabled under 5 hands with the reason beside it), the latest expenses | spending shows an amount and a kind of help, no name unless the person agreed |
| Public request | a small sheet: the cap in `.yd-level`, a description, the note that the owner approves | |

Tags (`.yd-tag`): `.pub` spring green (a public deed), `.pend` amber (level waiting), `.act` the vine (needs a step), plain grey (done).

## Phone note for vision
Four figures and two buttons above two lists fit on a phone as designed (the first screen is about two screens tall); nothing needed to change. The only choice: the exchange is a labelled pair (נתתי / קיבלתי) instead of "5 · 3", because in a right-to-left line the order of two bare numbers confuses.

## Checked
375 and 1280 px, light and dark; the audit is clean (no overflow, targets 44 px and up). Motion is transform and opacity only (press, bar fill).
