# עץ המשפחה – the family tree and the forest of families

The owner's vision (2026-11-12): the nuclear family's tree is the main page; one travels up its branches to the
grandparents with a smooth, animated interface; zooming out leads into **the forest** – many families' trees, joined where
their people married – with a glowing line, like a network, from us to the person we are looking for. Each person decides
who may see their details and files, and may stay fully anonymous.

## Stages

| Stage | What | Status |
|---|---|---|
| 1 | Relationships as their own records (several marriages, divorce and widowhood, biological/adoptive/step/foster parents, half-siblings, twins); the nuclear-family view as the main page, up to the grandparents; "how are we related?" in Hebrew; birthdays and yahrzeits in the family calendar; the name עץ המשפחה | this branch |
| 2 | **Linking trees between households**: the same person in two households' trees (a daughter-in-law in her parents' tree and in ours) is linked once, with the consent of both sides; per-person privacy levels and anonymity; paths and relationships across the linked trees, computed on the server | next |
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

## How are we related (stage 1, within a household's tree)

Shortest path over the links (up to a parent, down to a child, across to a partner), then a Hebrew name for the common
shapes – אבא/אמא, סבא/סבתא, סבא רבא, בן/בת, נכד/ה, נין/ה, אח/אחות (ולמחצה), דוד/דודה, אחיין/אחיינית, בן/בת דוד
(ראשון, שני, שלישי), בעל/אישה, חותן/חותנת, חם/חמות, חתן/כלה, גיס/גיסה, מחותנים – and for anything else, the path
itself in words ("בת של אח של סבתא"). Stage 2 runs the same search across linked households on the server.
