// Tests for public/food/kitchen/kitchen-logic.js (times in a recipe step, timers, temperatures). Run: node server/test-kitchen.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/food/kitchen/kitchen-logic.js', import.meta.url), 'utf8'), ctx);
const K = ctx.Kitchen;
let fail = 0, n = 0;
const eq = (got, want, what) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log(`✗ ${what}: got ${g}, want ${w}`); } };
const secs = (s) => K.times(s).map((t) => t.sec);

// times in a step
eq(secs('מבשלים 10 דקות על אש נמוכה'), [600], 'minutes');
eq(secs('אופים 5-7 דקות'), [300], 'a range gives its lower end');
eq(secs('אופים 25 עד 30 דקות'), [1500], 'a range with עד');
eq(secs('מבשלים שעה וחצי'), [5400], 'שעה וחצי');
eq(secs('מבשלים שעתיים'), [7200], 'שעתיים');
eq(secs('מניחים לתפוח חצי שעה'), [1800], 'חצי שעה');
eq(secs('עוד דקה ומגישים'), [60], 'a bare דקה is one');
eq(secs('מערבבים כמה דקות'), [], 'כמה דקות is not a time');
eq(secs('מטגנים 3 דקות מכל צד, ואז 20 דקות בתנור'), [180, 1200], 'two times, in order');
eq(secs('מחממים תנור ל-180 מעלות'), [], 'degrees are not a time');
eq(secs('מקציפים 30 שניות'), [30], 'seconds');
eq(secs('מבשלים 2 שעות'), [7200], 'hours');
eq(secs('מבשלים 1.5 שעות'), [5400], 'a decimal');
eq(secs(''), [], 'nothing');
eq(secs('10 דקות, ושוב 10 דקות'), [600], 'no repeats');

// labels and the clock
eq(K.label(600), '10 דק׳', 'label minutes');
eq(K.label(3600), 'שעה', 'label an hour');
eq(K.label(5400), 'שעה וחצי', 'label an hour and a half');
eq(K.label(45), '45 שנ׳', 'label seconds');
eq(K.clock(245), '4:05', 'clock');
eq(K.clock(3750), '1:02:30', 'clock with hours');
eq(K.clock(-3), '0:00', 'clock never negative');

// timers
const t = K.start('אורז', 600, 1000);
eq(K.left(t, 1000), 600, 'a new timer');
eq(K.left(t, 61000), 540, 'a minute later');
const p = K.pause(t, 61000);
eq(K.left(p, 999999), 540, 'a paused timer keeps its time');
const r = K.resume(p, 100000);
eq(K.left(r, 100000), 540, 'resumed where it stopped');
eq(K.left(K.addTime(r, 60, 100000), 100000), 600, 'a minute more');
eq(K.left(t, 999999), 0, 'done is zero');
eq(K.left(K.addTime(t, 60, 2000000), 2000000), 60, 'a minute more on a timer that rang counts from now');
eq(K.start('', 600, 1).name, '10 דק׳', 'a timer with no name is named by its time');

// temperatures
eq(K.temp(350, 'f').c, 177, '350°F');
eq(K.temp(180, 'c').f, 356, '180°C');

console.log(fail ? `${fail} of ${n} kitchen tests failed` : `kitchen: all ${n} tests passed`);
process.exit(fail ? 1 : 0);
