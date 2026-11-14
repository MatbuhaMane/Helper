// /food/diet/ – this page's script, moved out of the HTML so the site can forbid inline scripts (CSP script-src 'self', security review 2026-11-15 M2).

// תנועה ותזונה (vision batch 4, item 1; it was "דיאטה", the address stays): הקפדה, and הרגלי אכילה, one tool for every
// way of eating (the owner, 2026-11-14): ketosis, Atkins, paleo, low-carb, low sugar and fasting, each with its switch.
// Their dashboards stay in the groceries app (diets.js); the switch is in הרגלי אכילה.
H.folder({ title: 'תנועה ותזונה', sub: 'הקפדה, הדרך שבה אוכלים, ומה מתאים לה', back: { href: '/food/', label: 'אוכל' }, look: 'flat', apps: [
  { href: '/food/diet/hakpada/', ic: 'target', name: 'הקפדה', tint: '#ffd9c2', c1: '#ffb07a', c2: '#e0533d' },
  { href: '/food/diet/habits/', ic: 'habits', name: 'הרגלי אכילה', tint: '#c8f0ea', c1: '#6fe0d0', c2: '#1f8f8a' },
] });
