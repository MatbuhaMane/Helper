# Area: Business modeling

**Worktree:** `M:\Claude Code\Helper-business` · **Branch:** `business` · No dev server (documents only).

## Scope

Whether and how the helper becomes a product for the public: the business model, pricing, costs, the market, strategy
and plans.

## Owned paths

- `docs/business/` (start: `docs/business/standalone-feasibility.md`)

Everything else is read-only for this area. Numbers that the code must use (a price, a quota, a plan's limits) are
decisions: log them in `docs/decisions.md` for the master and ai-features.

## Goals

- **Cost per user.** The AI meter has recorded every Claude and Gemini call since 2026-11-12 (the admin page, behind the
  moon's secret, shows the cost report; `server/prices.ts` holds the prices). After two weeks (around 2026-11-26), turn the
  family's real use into a cost per user per month.
- **The model.** Compare the three AI options in the feasibility doc (a subscription with quotas, the user's own key, a
  free tier) against that cost; pricing and quotas.
- **Storage.** The plan where each user's files live in their own cloud (Drive or iCloud), so the owner pays no storage.
- **The market.** Who it is for (Hebrew-speaking families first?), what exists, what makes it different (the family tree
  and the forest, kashrut and keto in recipes, the companion).

## Open questions

- Who pays: subscriptions through the app stores, Stripe, or both?
- What must stay free so a family can try it?
- What does the forest (families linked by marriage) mean commercially, and what does privacy cost there?
