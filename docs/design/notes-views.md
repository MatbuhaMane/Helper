# Notes: four views and the formatting toolbar (design → ai-features)

Vision batch 14 (2026-11-14). The look is in `public/tools/notes/notes.css`. The sample is `docs/design/prototype/notes-views.html`; copy it to `public/` to view it.
- `?view=cols|panes|list|board` picks the view.
- `&edit=1` shows the editor; add `&pop=colors|fonts` to open a menu.
- `&theme=dark` works on any of them.

Checked at 375 and at desktop width, light and dark, with no sideways overflow in any view, with and without the editor.

## The views
Set `data-view` on the `.nt` root: `cols` (today's view and the default), `panes`, `list` or `board`. Keep the choice with `H.prefs('notes', { view: 'cols' })` and `H.savePrefs('notes')`.

The list's markup stays as it is today: `.nt-list > .nt-group > h3 + .nt-row > .nt-item + .nt-star`. Only the attribute changes.

**What each view is**
- **cols:** the list beside the editor, unchanged.
- **panes ("חלוניות"):** each note is a card in a grid under its day, showing up to six lines of its text. The star sits on the card's corner.
- **list:** one dense line per note: the title, the start of the text and the date. On a phone the text moves under the title. It suits many notes.
- **board:** a cork board in a wooden frame. Each note is a square of coloured paper, slightly askew, held by a coloured pin. A note straightens and rises on hover or focus. Its paper is dimmed a little at night.

**Opening a note:** in every view but `cols`, the editor replaces the notes, as it does on a phone today. `body.nt-editing` hides the head and the list, and "‹ כל הפתקים" shows at every width. The JS already sets that class, so nothing changes there.

**Text length:** panes and board show up to six lines, so give `.nt-snip` more text than today's 120 characters, about 400.

**Paper colour (optional):** on the board, the paper colour comes from the note's place in its day by default. To keep a note's colour fixed, set `data-paper="1"` to `"5"` on its `.nt-row`, for example from a hash of its id.

## The switch (in `.nt-head-acts`, before "הדבקה")
```html
<div class="nt-views" role="group" aria-label="תצוגה">
  <button type="button" aria-pressed="true" title="עמודות">(icon)<span>עמודות</span></button>
  <button type="button" aria-pressed="false" title="חלוניות">(icon)<span>חלוניות</span></button>
  <button type="button" aria-pressed="false" title="רשימה">(icon)<span>רשימה</span></button>
  <button type="button" aria-pressed="false" title="לוח">(icon)<span>לוח</span></button>
</div>
```
- Under 760 px the words are hidden visually but still read aloud, so only the icons show.
- Each icon is `<svg class="icon" viewBox="0 0 24 24">`:
  - cols `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M10 4.5v15"/>`
  - panes `<rect x="3.5" y="4" width="7.5" height="7" rx="1.6"/><rect x="13" y="4" width="7.5" height="7" rx="1.6"/><rect x="3.5" y="13" width="7.5" height="7" rx="1.6"/><rect x="13" y="13" width="7.5" height="7" rx="1.6"/>`
  - list `<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>`
  - board `<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="m7 8.5 4 .5-.4 3.8-4-.4zM13.5 9l4-.6.5 3.8-4 .6z"/><path d="M8.5 15.5h7"/>`

## The formatting toolbar (it had no look until now)
- notes.js builds `.nt-tools`, `.nt-tool`, `.nt-pop`, `.nt-swatch`, `.nt-font-b` and the `c-*` and `f-*` classes. All of them are styled now, with no change to the JS.
- The six ink colours have their own tokens (`--nc-*`) for light and dark, so a note written by day still reads at night.
- One request: put the toolbar between `.nt-meta` and the body (it already is), and keep the popups inside `.nt-tools`. They open under the toolbar.
