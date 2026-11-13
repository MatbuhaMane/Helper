# Every AI tool, and its useful version without AI

The owner's decision (vision batch 3, 2026-11-12): every tool that uses AI also has a version that is not smart but
still useful – for whoever has no AI connected and no credit. The invitation to connect an AI or get credit comes in
addition to it, never instead of it. New tools are built this way from the start (the recipe book, the diets, the
weather). This is the list of today's AI tools, what each would do without AI, and a rough size; the owner sets the order.

| # | Tool (server module) | What the AI does today | Without AI | Size |
|---|---|---|---|---|
| 1 | Recipe import from a link (`kitchen.importRecipe`) | reads any recipe page | most recipe sites carry a structured recipe (schema.org JSON-LD): read it directly; otherwise a manual form | small, high value |
| 2 | Calculator (`calc.solve`) | solves and explains a problem, also from a photo | a real expression calculator, fractions, percentages, units and currency; the explanation stays with the AI | small |
| 3 | Keto foods and recipe nutrition (`keto.estimateFoods`, `keto.recipeNutrition`) | estimates nutrition of a food or recipe | look up an open food database (Open Food Facts) and our own foods table; manual entry | medium |
| 4 | Recipe check (`recipecheck`) | checks a recipe for keto, kosher and mistakes | rules: ingredient lists for keto, meat and dairy, missing quantities | small |
| 5 | Recipes of the world (`worldrecipes`) | finds and translates recipes | browse an open recipe database as it is (in its own language), with a link to translate the page | small |
| 6 | News: summary, translation, titles, corroboration, verification (`news`, `newsai`) | summarises, translates, checks a story | the original article in reading mode; a "translate this page" link; the same story in other sources by matching titles; the source's reliability rating (already there) | medium |
| 7 | The researcher: ask, search, translate, a word (`research`) | answers questions on the sources | Sefaria's own search and texts, and its dictionaries for a word (open, free) | small |
| 8 | The companion Ibn Ezra: chat and voice (`daemon`, `voice`) | talks with the person, speaks | a menu of what it can show ("take me to…", a verse of the day, a tip), and the browser's own voice for reading aloud | medium |
| 9 | The companion's animal forms (`daemon.formImage`) | draws a new form | a fixed set of ready forms | small |
| 10 | Music recommendations (`music`) | suggests what to hear | search Spotify and YouTube directly (already there), and ready lists by mood | small |
| 11 | Entertainment picks (`fun.picks`) | chooses recommendations | the shared daily picks (one cache for everyone) and lists from open sources | small |
| 12 | Notes (`notes`) | gives a note a title and order | a title from the first line, tags by keywords | small |
| 13 | The mail organizer (`mail`, the family only) | plans and sorts the mailbox | for the public: the guide for the person's own Claude (decided); without any AI: ready Gmail search filters to copy | small |

Not in the list: the owner's design image tool (owner only), and the AI meter itself.

**A suggested order** (value for the effort): 1, 2, 7, 4, 12 (each small and used often), then 3 and 6, then 8, 10, 11, 5, 9.
Each one, when built: the version without AI first, and the AI on top of it where it is connected or there is credit.

## Where it stands (2026-11-13)

Every item has its version without AI on `ai-features`, except #9 and #13:

| # | Done in | What it does without AI |
|---|---|---|
| 1 | 7446a8a | the page's structured recipe (JSON-LD), else the lists under its headings; ✨ only on the button |
| 2 | 344d777 | percentages, currencies, fractions, equations |
| 3 | 8f48e90 | a food's values from Open Food Facts (label values, the median of the matches whose name has every word asked; ODbL, so the page says where they came from); a recipe worked out from its amounts and the values per 100 g the page and the table know, naming what it could not tell (`server/keto-plain.ts`, 26 tests) |
| 4 | de986cb | word lists for kashrut, keto and missing amounts |
| 5 | 31c7ded | the open recipe database (TheMealDB) was already the search; a search that fails now turns to it too; a recipe page opens as it is written, with Google's translation of the page |
| 6 | 728081f | the article's opening sentences (said to be just that), Google's translation of the page, who else among the sources reports it (headlines that share words) and a Google News search (`server/news-plain.ts`, 11 tests) |
| 7 | 6565c41, eec895b | Sefaria's own search, texts, translations and dictionaries |
| 8 | 316e1d3 | the companion points to a place on the screen or takes you to a part of the tent by its words, else a tip and the ring's parts; his voice is the browser's when there is no voice service |
| 9 | – | not needed today: the companion is always Ibn Ezra (`loadDaemon` resets the form), and no page asks for `/api/daemon/form` – a question for the owner |
| 10 | a3110c8 | mood lists that search YouTube; with no YouTube key and no AI, the search on YouTube itself |
| 11 | c0a3004 | the shared board (one cache for everyone); with none, the category's latest headlines, said to be unfiltered and not kept |
| 12 | 1f52d57 | the note's first real line as its title, and #words as tags with filter chips (`server/notes-plain.ts`, 18 tests) |
| 13 | – | the family only; the guide for one's own Claude (decided) |

Checked on a second dev server with `--var GEMINI_API_KEY: --var ANTHROPIC_API_KEY: --var YOUTUBE_API_KEY:` (empty keys,
the same local database; two servers on one database can lock it, so run one at a time when writing much).
Outside services the plain versions use, all public and without keys: Open Food Facts (search.openfoodfacts.org, ODbL –
the values are kept in the shared `foods` table with source `off`), and links the person opens themselves to Google
Translate, Google News and YouTube search.
