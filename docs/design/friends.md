# Friends and the four-level privacy picker (the look, batch 27)

_Design, 2026-11-14. The logic is ai-features'. The CSS:_
- _the privacy picker: `public/assets/base.css`, section "Who sees it" (it applies on every page);_
- _the friends page: `public/family/family.css`, section "Friends";_
- _group chats and the avatar `.fr-av`: `public/messages/messages.css` (the friends page links it too)._

Every control is at least 44 px. Motion is `transform` and `opacity` only. The audit is clean at 375 and 1280 px, in light and dark mode.

## 1. Who sees it: four levels

`data-level` takes one of four values: `all` · `friends` · `family` · `me`. Each sets its colour (`--lv`) and its icon (`/assets/priv-icons/<level>.svg`, used as a mask).

| Level | Name | Who sees it | Colour |
|---|---|---|---|
| `all` | כולם | everyone in the tent | blue #3d7ea6 |
| `friends` | חברים ומשפחה | the family and my friends | rose #c0577d |
| `family` | רק משפחה | those in the family tree | the vine (`--primary`) |
| `me` | רק אני | only me | slate #5f636c |

These replace the three levels in `story.js` (`household` / `tribe` / `private`) and the `.fv-priv` label. Mapping the old values is the JS's job.

### The full picker

A 2×2 grid on a phone, four across from 640 px. The chosen option gets its level's border, a tint and a check.

```html
<fieldset class="priv-pick">
  <legend>מי יראה את זה?</legend>
  <label class="priv-opt" data-level="all">
    <input type="radio" name="level" value="all" aria-label="כולם">
    <span class="priv-ic"></span><b>כולם</b><small>כל מי שבאוהל</small>
  </label>
  … friends / family / me, the same …
  <p class="priv-note">חברים רואים רק מה שפרסמת להם.</p>   <!-- optional -->
</fieldset>
```

- The radio's name goes in `aria-label`, because the audit reads only that.
- A level that is not allowed here (for example "all" for a child) is shown dimmed with `disabled` on the input.

### The chip and the tag

- **The chip:** `<button class="priv-chip" data-level="family"><span class="priv-ic"></span>רק משפחה</button>`.
  - It sits by a publish button, shows the current level, and opens the full picker (`H.modal`).
- **The tag:** `<span class="priv-tag" data-level="friends"><span class="priv-ic"></span>חברים</span>`.
  - It appears in lists and on cards.
  - `.priv-tag.bare` shows the icon alone; give it `aria-label` and `title`.

## 2. The friends page (inside the tree)

```html
<section class="fr">
  <header class="fr-head"><h2>חברים</h2><input class="fr-search" type="search" aria-label="חיפוש חברים"><p class="muted">…</p></header>

  <div class="fr-invite"><p>…both sides approve…</p><code>https://…/f/…</code><button class="btn">העתקה</button></div>

  <div class="fr-found"><span class="fr-av" style="--c:…">דל</span><div><b>גילינו שאתם קרובים!</b><small>…</small></div><button class="btn">לעץ</button></div>

  <div class="fr-section"><h3>בקשות</h3>
    <ul class="fr-reqs">
      <li class="fr-req"><span class="fr-av">…</span><div><b>name</b><small>רוצה להתחבר</small></div>
        <div class="fr-req-acts"><button class="btn primary">אישור</button><button class="btn">לא עכשיו</button></div></li>
      <li class="fr-req out">…a request I sent, waiting…</li>
    </ul></div>

  <div class="fr-section"><h3>החברים שלי</h3>
    <ul class="fr-grid">
      <li class="fr-card"><span class="fr-av" style="--c:…"><img alt=""> or initials</span>
        <b>name<span class="fr-kin">גם משפחה</span></b><small>how we know each other</small>
        <button class="fr-talk" aria-label="שיחה עם …"></button></li>
    </ul>
    <!-- none yet: <p class="fr-empty">…</p> -->
  </div>
</section>
```

- **The avatar** `.fr-av` shows a picture, or initials on the person's colour (`--c`). It is 48 px; `.fr-av.sm` is 36 px.
- **The grid** is one column on a phone and auto-fills from 640 px (cards of at least 240 px).

## 3. Chats: one to one and groups

The chats use the `.dm` component from the messages page as it is: the list, the thread, the bubbles and the compose box. Groups add only:

- **A group row:** `<button class="dm-row group">` with `<span class="fr-av-stack">` first. The stack holds 2–3 `.fr-av` and then `<span class="fr-more">+3</span>`.
- **The group's head:** `<span class="dm-members">5 חברים</span>` after the `h2`.
- **The sender's name** above each run of their messages: `<p class="dm-msg theirs" style="--c:…"><b class="dm-who">מיכל</b>…</p>`. Show it only on the first message of a run.
- **A new group:**
  - `<input class="fr-group-name" aria-label="שם הקבוצה">`;
  - `<ul class="fr-pick">` of `<label><input type="checkbox"><span class="fr-av sm"></span><span>name</span></label>`.
- **The children's rule:** a child under 12 who is not family is shown with `disabled` (dimmed). The page says why with `<p class="fr-kid-note">ילדים מתחת לגיל 12 מקבלים הודעות רק מהמשפחה.</p>`.

## Class list

| Class | On |
|---|---|
| `[data-level=all\|friends\|family\|me]`, `priv-ic` | any element; sets `--lv` and the icon |
| `priv-pick` > `legend`, `priv-opt` > `input[type=radio]` + `priv-ic` + `b` + `small`, `priv-note` | the full picker |
| `priv-chip` | the compact button |
| `priv-tag`, `priv-tag.bare` | the list tag |
| `fr`, `fr-head`, `fr-search`, `fr-invite`, `fr-found`, `fr-section` | the friends page |
| `fr-reqs` > `fr-req` (`.out`), `fr-req-acts` | requests |
| `fr-grid` > `fr-card`, `fr-kin`, `fr-talk`, `fr-empty` | the friends grid |
| `fr-av` (`.sm`, `--c`), `fr-av-stack`, `fr-more` | avatars (in messages.css) |
| `dm-row.group`, `dm-who`, `dm-members` | group chats (in messages.css) |
| `fr-pick`, `fr-group-name`, `fr-kid-note` | a new group |
