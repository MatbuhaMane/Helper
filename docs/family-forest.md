# עץ המשפחה – the family tree and the forest of families

The owner's vision (2026-11-12): the nuclear family's tree is the main page; one travels up its branches to the
grandparents with a smooth, animated interface; zooming out leads into **the forest** – many families' trees, joined where
their people married – with a glowing line, like a network, from us to the person we are looking for. Each person decides
who may see their details and files, and may stay fully anonymous.

## Stages

| Stage | What | Status |
|---|---|---|
| 1 | Relationships as their own records (several marriages, divorce and widowhood, biological/adoptive/step/foster parents, half-siblings, twins); the nuclear-family view as the main page, up to the grandparents; "how are we related?" in Hebrew; birthdays and yahrzeits in the family calendar; the name עץ המשפחה | this branch |
| 2 | **Linking trees between households**: the same person in two households' trees (a daughter-in-law in her parents' tree and in ours) is linked once, with the consent of both sides; per-person privacy levels and anonymity; paths and relationships across the linked trees, computed on the server | `ai-features` (see "Stage 2" below) |
| 3 | **The forest**: the zoomed-out view of the linked trees, and the glowing path | graphics later |

## The data (stage 1)

- `family_people` – a person (name and details sealed with the vault key, as today).
- `family_links` – one row per relationship, in a household:
  - `parent`: `a` is the parent of `b`; `kind` = `bio` | `adopt` | `step` | `foster`
  - `partner`: `a` and `b` (in a fixed order); `kind` = `married` | `partner` | `engaged`; `status` = `together` | `divorced` | `widowed` | `separated`; `since`, `until` (dates)
- Siblings, half-siblings and twins are derived from shared parents (and the same birth date); grandparents, cousins and
  in-laws from paths.
- The old columns (`parent1`, `parent2`, `partner`) are read once into `family_links` and then left alone.

## Privacy (designed now, enforced in stage 2)

Per person, per field group (identity: name and photo; dates and places; notes; files), one of:

| Level | Who sees it |
|---|---|
| `private` | only the person themself (a member's own private items, as today) |
| `household` | the household that keeps the tree (today's default) |
| `linked` | also the households linked to ours by a marriage – the in-laws' side |
| `forest` | everyone in the connected forest |

**Anonymous** (a switch per person): outside the household the person appears only as *קרוב/ת משפחה* – no name, no photo,
no dates – but still counts in paths, so the line from one tree to another does not break. A person who is a member
of the helper sets their own levels; for a person who isn't (a grandparent, a child), the household that added them does.
Files never leave the household unless their owner shares them, and private files never leave their owner.

## Stage 2: the owner's decisions (2026-11-12)

**Roles.**
- **ראש משק בית** (household head): every household has one or more. The app owners are heads of their own
  household; a head may name other heads in their household; the app owner may name the head of any household.
  A head manages the nuclear family of their own household: the people in it who are not users (their details,
  their privacy, their anonymity), and the links of their tree to other trees.
- **הנהלת השבט** (the tribe head): the head of the extended family, if there is one; named by the app owner (for now).
  Mainly supervises the genealogical links: may break any link inside the tribe, and has a head's control over the
  people **who are not users** in every household of the tribe. Never over a user: a user always decides for themself.
- **השבט** (the tribe): all the households whose trees are joined by confirmed links. It is computed from the links, not stored.
  Later: friendship links between households (not genealogical, never in a path, not in the tribe), and associations
  that are not of family members.

**Linking two trees** (the same person in both, e.g. a daughter-in-law in her parents' tree and in ours):
1. Any member of household A picks the person in A's tree and sends a request to the email of a member of household B,
   with a note in their own words saying who it is ("דנה, הבת של רינה ויוסי"). Nothing of A's tree is shown to B with
   the request; the email may not be a member yet (the request waits, and nobody learns whether the email is registered).
2. A head of B checks the genealogical connection and approves by picking the person in B's tree – one head's approval
   is enough (A's side asked).
3. If the person is a user of the helper (their email is on either card) and is neither the one who asked nor the one
   who approved, the link waits for their own consent as well.
4. Either side may break the link at any time: a head of A or B, whoever asked, the person themself, or the tribe head.
   It ends at once; deleting the person from a tree ends their links too.
- The person stays two records, one in each tree (each household keeps its own data); the link says they are one person.

**Privacy.**
- Levels per field group – identity (name, sex, photo), dates (birth, death, place), notes, files – as in the table above;
  a new person starts at `household` for everything.
- `private` means the person themself if they are a user; for someone who is not, the heads of the household that keeps them.
- Who sets them: a user for themself (on every card that carries their email); for a non-user, a head of the household
  that keeps the card, or the tribe head. A household never changes another household's card.
- When the same person is in two trees with different levels, the strictest one decides what crosses between
  households – unless the person is a user: then their own levels decide, whatever the other trees left at the
  default (found while testing: otherwise a user who opened their name could stay hidden by a tree that never chose).
  Inside its own household a card follows its own levels.
- A card's email makes it a user's: only a head puts someone else's email on a card (anyone may put their own).
- **Anonymous**: outside its household the person is *קרוב/ת משפחה* (no name, sex, photo, dates, notes, email), with an
  opaque id, but still counts in paths. Any household that marks them anonymous makes them anonymous outside.
- Files do not leave their household in stage 2 at all, whatever the level.
- Everything is decided on the server (`server/vault/kin.ts`, used by `server/vault/index.ts` and `server/calendar.ts`);
  a field the viewer may not see is never sent, and saving a card keeps the fields the editor could not see.
- Every view of another household's people is written to that household's activity log too.

**Across the trees (on the server).** `GET /api/vault/forest` gives the tribe as the viewer may see it (households,
people, links, and which records are the same person); `GET /api/vault/related?from=&to=` names how two people
are related across the trees, the same Hebrew names as inside one tree. The zoomed-out forest view is stage 3.

## How are we related (stage 1, within a household's tree)

Shortest path over the links (up to a parent, down to a child, across to a partner), then a Hebrew name for the common
shapes – אבא/אמא, סבא/סבתא, סבא רבא, בן/בת, נכד/ה, נין/ה, אח/אחות (ולמחצה), דוד/דודה, אחיין/אחיינית, בן/בת דוד
(ראשון, שני, שלישי), בעל/אישה, חותן/חותנת, חם/חמות, חתן/כלה, גיס/גיסה, מחותנים – and for anything else, the path
itself in words ("בת של אח של סבתא"). Stage 2 runs the same search across linked households on the server.
