# The owner's approval queue for יד ביד (batch 39, 2026-11-15)

Prototype: `docs/design/prototype/yad-queue.html` (4 screens). CSS: the last section of `public/tools/yad/yad.css` (`.yd-q*`, `.yd-rej`, `.yd-consent`). Clean at 375 and 1280 px, light and dark (T9 unmeasured, hidden pane).

## Inside the existing "ממתין לאישור" page
- A header with one count (`.yd-qhead`, `.yd-qcount`) and a scrolling filter row (`.yd-qfilter`: הכול · יד ביד · משפחה, each chip with its count, 44 px tall). The "יד ביד" chip is the new one; the page itself is not changed.
- Items in `ul.yd-qlist` (one column on a phone, two from 880 px). Each item is `li.card.yd-q`; `.urgent` (amber side strip) marks the kinds that notify at once: a report, a need outside the list, a fund request for a person. Deeds and public fund requests have no strip (daily summary). Order: urgent first, then by age.
- Empty state: `.yd-qdone`.

## The four kinds (same card: icon, title, who and when, tags, optional line, actions)
1. **Deed:** hours stepper `.yd-hours` (44 px buttons, half-hour steps), the computed amount and the tithe on a line (`.sum`). A deed outside the list adds the tag "לא ברשימה, הרמה המוצעת: N" and the "להוסיף לרשימה" checkbox (`.yd-qadd`).
2. **Need outside the list:** proposed tier tag, the two answers (קושי, מומחיות) in `.sum`, the figure on the right, the "להוסיף לרשימה" checkbox.
3. **Fund request:** "בשביל אדם" shows the one-line why in `.why` labelled "רק הבעלים רואה" and says the person agreed. "לטובת הציבור" has no why line.
4. **Report:** the reason as a tag, what was written in `.why`, then three actions: "להסיר את השירות/הצורך" and "להסיר את האדם" side by side, "לדחות את הדיווח" under them (`.yd-qacts.three`). A person's declared licence shows the grey "לפי הצהרת המשתמש", never a tick.

Actions on 1–3: two equal buttons, "מאשר" (primary) and "דוחה" (red outline), 48 px. "דוחה" swaps the buttons for `.yd-reject`: a reason field ("נשלחת לאדם") and ביטול / שליחת הדחייה. No modal, so nothing covers the item.

## On the person's side
- Waiting: the existing `.yd-tag.pend` "ממתין לאישור הבעלים, רק את/ה רואה אותו".
- Rejected: tag "נדחה" plus `.yd-rej` with "הסיבה של הבעלים" and one button "לתקן ולשלוח שוב".

## Create a need: "מהקופה"
A switch "מהקופה" and a one-line why (private to the owner). Three-way `.yd-kinds`: בשבילי / בשביל מישהו אחר / לטובת הציבור; "מישהו אחר" shows a person picker. The note says the person must agree before it goes to the owner. The button reads "שליחה להסכמה". The other person sees `.yd-consent`: who asks, what, "מסכים/ה" / "לא מסכים/ה", and that the why stays with the owner.

## The board
Public needs show `.yd-tag.pubgood` "לטובת הציבור". A need the owner posts shows `.yd-tag.ohel` "מאת האוהל" instead of a name, and a plain tag "חוזר כל חודש" when recurring.

## Does not fit / questions for vision
- Four quick actions on a report is the most that fits a phone card; the removal of a person should ask once more (a confirm line, "הידיים שלו יוקפאו, אפשר לבטל"). I left that to the JS (`H.confirm`).
- The owner's "מאת האוהל" form (open a public need, recurring) is not designed: it is a variant of "יצירת צורך" with a recurrence picker. Say if it is wanted now.
- The consent step needs a place to arrive for the other person (a notification into "הצרכים שלי"): ai-features' call.
