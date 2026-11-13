# The social layer and the first minute: the technical plan (ai-features)

Following vision batch 8 (`docs/vision/social.md`, `docs/vision/first-minute.md`; the decision "The social layer, the first
minute, and the app icon"). In small deploys, each standing on its own. **Critical** marks what goes to the master for review
(sign-in, invitations, privacy, data exposure).

| # | Slice | What | Tables / routes | Owner |
|---|---|---|---|---|
| A | **Discovery** | Tools discovered: "גילית 6 מתוך 18 כלים", and the "סייר" badge. The same data feeds the owner's usage dashboard (who comes in, which tools; never content) | `tool_visits` (email, tool, first, last, count); `POST /api/visits`, `GET /api/discover` | ai-features. The look: design |
| B | **Friends** | A request inside the app and approval; the friends list; removing a friend. A friend who is not family sees only that friend's own details | `friendships` (a, b, status, by, at); `/api/friends…` | ai-features |
| B2 | **Invitation by link** | Someone without an account joins through the link straight into the friends list | `friend_invites` (token hash, from, expires); the join flow | **critical**: `join.ts` is the master's. A proposal |
| C | **Sharing and following** | A goal the person chose to share; progress posts in a small friends' feed; a heart (tap or double tap); advice (a short open message), and a heart on advice → the "יועץ" badge | `goals.shared` (column), `goal_posts`, `post_hearts`, `post_advice` | ai-features. Under 12: no advice or messages from outside the family |
| D | **A family goal** | Two or more family members with roles; each sees their part and everyone's progress; the "שבט" badge (relatives only), the "מלאך דרך" badge (friends) | `goal_members` (goal, email, role) | ai-features |
| E | **"גילינו שאתם קרובים"** | A friend who is also a relative in the forest: both are told, with the relationship, only within both sides' privacy levels; anonymous or hidden people are never revealed | the forest's rules (`kin.ts`) | ai-features, **critical** (privacy): to the master for review |
| F | **The setup wizard** | Name and picture, religion and calendar, city, colour theme, figure (the figure guides the wizard), create or join a family. Saved in the settings (`H.prefs`) | no new tables; joining a family uses the existing invitation | ai-features (JS), design (the look). Joining: **critical** |

**Proposed order:**
- A first: small, it serves both the first minute and the owner's dashboard.
- Then B and C: they unblock goals part 2.
- Then D and F.
- E and B2 last, after the master's review.

Every slice comes with tests for its rules (who may see what, the under-12 rule, approval from both sides) and is checked at
375 and 1280.
