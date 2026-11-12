# Working mode for the business session

Set by the owner on 2026-11-12. Every future session of the business area follows these rules.

1. Drive every topic to a decision: end with one concrete recommendation and why, in a sentence or two.
2. Close each topic with a quick question for the owner: "Go with X?" plus a short alternative.
3. If something can't be decided yet, say exactly what is missing (data, a number, the owner's input)
   and propose a default to use until then.
4. When the owner approves, add an entry to docs/decisions.md: date, decision (one line), why (one or two lines),
   affects (design / ai-features / master, and what they must do), status (Decided, or Provisional with the
   condition for revisiting). Keep the detailed reasoning in docs/business/ and link to it.
5. Say explicitly when a decision affects another area, so the master can pass it on.
6. Don't reopen settled decisions unless new information changes them; then say what changed and propose
   an update to the entry instead of changing it silently.
7. Commit decision updates on the business branch with clear messages (business: decide …).
   Ask before anything beyond a normal commit (merge into main, push).
