# יד ביד, שלב 1: the look (design → ai-features)

> **Batch 37 (2026-11-15) wins over batch 36 where they differ; see "Batch 37" at the end.**

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

## Batch 37: what changed (the owner, 2026-11-15)
1. **No redeem in stage 1:** the "בקשה לטובת הציבור" button and its sheet are gone (stage 2). The treasury page keeps "התרומה שלי לקופה" as a figure. `.yd-pub-ask` is now only that figure. An owner-posted deed is still `.yd-need.pub`, "לטובת הציבור".
2. **No GPS:** the area is a `select` (a town or a neighbourhood), chosen by hand once. No switch.
3. **The board:** the sort `.yd-seg` (מרחק / סוג) only. No quick chips, no advanced filter. (`.yd-adv` and `.yd-chips` stay in the CSS, unused, for later.)
4. **Distance is a range:** "עד 5 ק"מ", "5 עד 15 ק"מ", never a number.
5. **A need outside the list:** only its author sees it, in "הצרכים שלי", tagged `.yd-tag.pend` "ממתין לאישור הבעלים, רק את/ה רואה אותו". It is not in the board until approved (with its tier). The create sheet says so.
6. **Report and removed:** each board card has a small "דיווח" link (`.yd-link` in `.go`) that opens the report sheet (`data-sheet-id="report"`: a reason from `.yd-kind` buttons, an optional note). A removed need is a row `.yd-row.gone` (dimmed, struck through) with `.yd-tag.gone` "הוסר", in the past tab of the lists.
7. **Licence:** in the profile, a service that needs a licence carries `.yd-tag.pend` "דורש רישיון", and its group has `.yd-check.yd-decl`: "אני מצהיר/ה שיש לי רישיון לעסוק בזה. האוהל לא בודק זאת." (ticked before the service counts).
8. **The rules:** a small link "כללי יד ביד" under the two buttons opens a sheet with `ol.yd-rules` (3 rules; the final wording is the master and legal).
Checked at 375 px light (the audit clean); desktop and dark use the same classes as batch 36.

## Batch 38: never look verified (2026-11-15)
- A professional's service shows only the plain grey note `.yd-tag` "לפי הצהרת המשתמש" (board card, my lists). **Never** "מוסמך" or "מאומת", never a tick, a shield, a seal or a green colour beside it. "דורש רישיון" stays only on the type in the profile list.
- The profile asks only for the declaration tick-box: no licence number field, no upload.
- **The owner queue** lives in the existing "ממתין לאישור" page (a filter "יד ביד" and one count of what waits). No new screen from design yet: the page exists, and vision is still writing the rest of the queue spec with the owner.

## Batch 41: the licence declaration follows the type, not the tier (2026-11-15)
- **Profile:** "דורש רישיון" (`.yd-tag.pend`) sits on any type, at any tier, inside its normal group (the old "רפואה ומשפט" group is gone). One declaration (`.yd-decl`) closes the list; it applies to every marked type the person ticks. The text keeps batch 38: a declaration only, no number, no documents.
- **Wherever a declared professional shows:** only the grey "לפי הצהרת המשתמש". No badge, no tick.
- **The owner's list editor** (prototype screen "עריכת הרשימה"): per type, a row with its name and tier and one on/off switch "דורש רישיון" (`.yd-switch`, 48 px).
- **In the queue,** "להוסיף לרשימה" is followed by the same on/off, "דורש רישיון" (`.yd-qadd` with `role="switch"`).
