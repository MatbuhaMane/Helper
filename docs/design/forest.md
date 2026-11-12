# היער – first sketches for the forest view (stage 3)

Design session, 2026-11-12. A sketch, not a spec: how the forest of linked family trees could look and move, so that
stage 2 (linking trees, computed on the server) can give the page what it needs. Picture: [forest-sketch.svg](forest-sketch.svg).

## Three ways to draw it

| | The idea | Good | Weak |
|---|---|---|---|
| **A. A map** | each household a tree standing on a landscape, roads between them | warm, reads as "places" | the landscape is decoration that says nothing; hard to lay out |
| **B. A network** | households as nodes, marriages as edges | honest, scales to thousands | cold, looks like a diagram, not like a family |
| **C. A canopy from above** | each household a tree crown seen from above, its people the leaves; crowns that share a person touch or are joined by a root | it *is* a forest, zooms naturally from leaves (people) to crowns (families) | needs a careful layout so crowns do not overlap |

**Recommendation: C, the canopy from above,** laid out like B underneath (a force layout over households, with a fixed seed
so the forest does not reshuffle between visits). The crown is the household; the leaves are its people; a root on the
forest floor joins two crowns where one person belongs to both (a daughter-in-law in her parents' tree and in ours).

## The zoom: one continuous movement, four levels

The names come and go with the scale, not with separate pages (a semantic zoom):

| Level | What is on screen | Names |
|---|---|---|
| 0 – המשפחה | today's nuclear-family view: cards, grandparents to grandchildren | every name, the relation to me |
| 1 – כל העץ | our whole household tree, generations as rows | names while a card is at least ~88 px wide |
| 2 – היער הקרוב | our crown and the crowns linked to it; people as leaves (dots) | household names; a person's name only on hover/tap |
| 3 – היער כולו | crowns only, sized by the number of people | only our tree, the tree we are looking for, and the one under the finger |

Going from 0 to 2, the cards shrink into the leaves of our crown (the same FLIP glide the tree already uses), and the
other crowns grow in around it: about 600 ms with `--ease-river`. With `prefers-reduced-motion` the levels cross-fade.

- **Phone:** pinch to zoom; a tap on a crown flies to it; the path in words in a bottom sheet.
- **PC:** wheel or the ＋/− buttons; a side panel with the path in words; arrow keys move between crowns.

## The glowing line

From us to the person we look for: a line of light along the roots and through the leaves on the way.

- An SVG path drawn twice: a wide blurred copy at low opacity (the glow) under a thin bright line.
- By day: vine (`--primary`) with an olive halo. At night: olive-gold, like a lantern on a dark path.
- It is drawn once from us outward (stroke-dashoffset, about 1.2 s), then breathes slowly; with reduced motion it simply appears and stays.
- Each person on the way is a lit leaf; the words under it are the same Hebrew path as "איך אנחנו קשורים?" ("בת של אח של סבתא").

## Privacy, visible

- An anonymous person is a hollow leaf with no name, *קרוב/ת משפחה*, and the line still passes through it.
- A household we may see only at the `forest` level: a crown with no name and no count of people.
- Nothing from outside our household is ever shown larger than level 2 allows.

## What the page will need from stage 2 (for ai-features)

- Households: id, display name (or none), number of people, our own flagged.
- Links between households: the shared person (masked when anonymous), so a root can be drawn.
- A path: the list of people and households from us to the target, each already masked by the server.
- A stable layout seed per forest, so the crowns keep their places.

## Technique

SVG up to a couple of thousand leaves (crisp, accessible, styled with the tokens); a canvas layer only if forests grow
beyond that. Crowns are circles packed with their people's leaves (a small circle-packing per household); roots are
quadratic curves between trunks. No new tokens are needed: `--primary`, `--olive`, `--soil` and `--tint` cover it.

## Open questions for the owner

- Should a crown show anything of the family inside it (a photo, a family name) when zoomed out?
- How far out may one zoom: only trees linked to ours, or the whole forest of the hub?
