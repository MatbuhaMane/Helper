// Reading a recipe from a web page without AI (the owner's rule: every AI tool has a useful version without it;
// docs/ai/without-ai.md, #1). In order: the structured recipe most sites carry (schema.org JSON-LD), then microdata
// (itemprop="recipeIngredient"), then the plain page – the list under a heading like "מצרכים" and the one under
// "אופן ההכנה". Only when none of them finds a recipe is the AI asked (kitchen.importRecipe), and only when allowed.
// Tests: node server/test-recipe-parse.mjs

import { parseHTML } from 'linkedom';

export interface ParsedRecipe {
  title: string; image: string | null; source_url: string;
  ingredients: { name: string; measure: string }[]; steps: string[]; notes: string | null; tags: string[];
}

export function clean(s: unknown): string {
  return String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/[ \t ]+/g, ' ').trim();
}

/** "2 כוסות קמח" -> { measure: "2 כוסות", name: "קמח" }; best-effort, keeps the whole text when unsure. */
export function splitIngredient(s: string) {
  const m = s.match(/^([\d½¼¾⅓⅔.,/\s-]+(?:כוסות|כוס|כפות|כף|כפיות|כפית|גרם|ג'|ק"ג|קילו|מ"ל|ליטר|יחידות|יחידה|חבילה|חבילות|שיני|שן|קורט|קופסה|קופסת|פחית|cups?|tbsp|tsp|g|kg|ml|l|oz|lb)?\.?)\s+(.+)$/i);
  return m ? { measure: m[1].trim(), name: m[2].trim() } : { measure: '', name: s };
}

/* ---------------- 1. JSON-LD (schema.org Recipe) ---------------- */

export function recipeFromJsonLd(html: string, url: string): ParsedRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data: any;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const nodes: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      nodes.push(n);
      if (n['@graph']) walk(n['@graph']);
    };
    walk(data);
    const r = nodes.find((n) => ([] as string[]).concat(n['@type'] || []).some((t) => /recipe/i.test(t)));
    if (!r) continue;
    const ingredients = ([] as string[]).concat(r.recipeIngredient || r.ingredients || []).map((s) => splitIngredient(clean(s)));
    const steps: string[] = [];
    const addStep = (s: any) => {
      if (!s) return;
      if (typeof s === 'string') steps.push(...clean(s).split(/\n+/).filter(Boolean));
      else if (Array.isArray(s)) s.forEach(addStep);
      else if (s.itemListElement) addStep(s.itemListElement);
      else if (s.text) steps.push(clean(s.text));
    };
    addStep(r.recipeInstructions);
    const img = Array.isArray(r.image) ? r.image[0] : r.image;
    return {
      title: clean(r.name || 'מתכון'), image: typeof img === 'string' ? img : img?.url || null, source_url: url,
      ingredients, steps, notes: r.description ? clean(r.description) : null, tags: [],
    };
  }
  return null;
}

/* ---------------- 2 and 3: the page itself ---------------- */

// (JavaScript's \b knows only English letters, so a word's end is spelled out: the end, a space or a sign)
const END = String.raw`(?=$|[\s:：,.(\-–])`;
const INGREDIENTS = new RegExp(String.raw`^(ה?מצרכים|ה?רכיבים|ה?חומרים|מה צריך( להכין)?|ingredients?)` + END, 'i');
const STEPS = new RegExp(String.raw`^(אופן ה?הכנה|הוראות( ה?הכנה)?|ה?הכנה|דרך ה?הכנה|instructions?|directions?|method|preparation)` + END, 'i');
const text = (el: any) => clean(el?.textContent || '');

/** the page's own title: og:title, the first h1, or <title> */
function titleOf(document: any): string {
  return clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content')) || text(document.querySelector('h1')) || text(document.querySelector('title')) || 'מתכון';
}
function imageOf(document: any, url: string): string | null {
  const src = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  try { return src ? new URL(src, url).href : null; } catch { return null; }
}

/** microdata: itemprop="recipeIngredient" / "ingredients" and "recipeInstructions" */
function fromMicrodata(document: any): { ingredients: string[]; steps: string[] } {
  const ingredients = [...document.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]')].map(text).filter(Boolean);
  const steps: string[] = [];
  for (const el of document.querySelectorAll('[itemprop="recipeInstructions"]')) {
    const items = [...el.querySelectorAll('li')].map(text).filter(Boolean);
    steps.push(...(items.length ? items : text(el).split(/\n+/).map((s: string) => s.trim()).filter(Boolean)));
  }
  return { ingredients, steps };
}

/** the lines under a heading that matches: its list (the next ul/ol), or its short paragraphs until the next heading */
function underHeading(document: any, re: RegExp): string[] {
  const heads = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, p, div, span')]
    .filter((el: any) => { const t = text(el); return t.length <= 40 && re.test(t.replace(/[:：]\s*$/, '')) && !el.querySelector('ul, ol'); });
  for (const h of heads) {
    // climb to the block the heading sits in (a <strong> inside a <p>), then look at what follows it
    let block: any = h;
    while (block.parentElement && !block.nextElementSibling && block.parentElement.tagName !== 'BODY') block = block.parentElement;
    const lines: string[] = [];
    for (let el = block.nextElementSibling, k = 0; el && k < 30; el = el.nextElementSibling, k++) {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag) || (INGREDIENTS.test(text(el)) || STEPS.test(text(el))) && text(el).length <= 40) break;   // the next heading
      if (tag === 'UL' || tag === 'OL') { lines.push(...[...el.querySelectorAll('li')].map(text).filter(Boolean)); if (lines.length) break; continue; }
      const t = text(el);
      if (t) lines.push(...t.split(/\n+/).map((s: string) => s.trim()).filter(Boolean));
    }
    if (lines.length >= 2) return lines.slice(0, 80);
  }
  return [];
}

/** a recipe from the page without structured data, or null when it does not look like one (fewer than 2 ingredients) */
export function recipeFromPage(html: string, url: string): ParsedRecipe | null {
  const { document } = parseHTML(html);
  const md = fromMicrodata(document);
  const ingredients = md.ingredients.length >= 2 ? md.ingredients : underHeading(document, INGREDIENTS);
  if (ingredients.length < 2) return null;
  const steps = md.steps.length ? md.steps : underHeading(document, STEPS);
  return {
    title: titleOf(document), image: imageOf(document, url), source_url: url,
    ingredients: ingredients.map((s) => splitIngredient(s.replace(/^[-•*·•]\s*/, ''))),
    steps: steps.map((s) => s.replace(/^\d+[.)]\s*/, '')), notes: null, tags: [],
  };
}

/** when nothing was found: a draft to fill in by hand, with what the page does say (its title and picture) */
export function draftFromPage(html: string, url: string): ParsedRecipe {
  const { document } = parseHTML(html);
  return { title: titleOf(document), image: imageOf(document, url), source_url: url, ingredients: [], steps: [], notes: null, tags: [] };
}
