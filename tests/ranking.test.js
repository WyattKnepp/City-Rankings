const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

// Preference order used throughout: earlier = more liked.
const CITIES = ['Austin, TX', 'Boise, ID', 'Chicago, IL', 'Denver, CO', 'El Paso, TX', 'Fresno, CA', 'Gilbert, AZ'];
const shuffled = ['Denver, CO', 'Gilbert, AZ', 'Austin, TX', 'Fresno, CA', 'Boise, ID', 'El Paso, TX', 'Chicago, IL'];
const rankText = list => list.map((c, i) => `${i + 1}. ${c}`).join('\n') + '\n';

describe('logic: ranking', () => {
  test('ranks every city in the order the user prefers and saves rankings.txt text', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    await app.answerBy(CITIES);
    assert.deepEqual(app.rankings(), [rankText(CITIES)]);
    assert.match(app.html(), /Final rankings/);
  });

  test('produces the reverse order when preferences are reversed', async () => {
    const rev = [...CITIES].reverse();
    const app = await loadApp({ cities: shuffled, answers: [] });
    await app.answerBy(rev);
    assert.deepEqual(app.rankings(), [rankText(rev)]);
  });

  test('never asks the same pair twice and stays within the shown comparison estimate', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const asked = await app.answerBy(CITIES);
    const keys = asked.map(p => [...p].sort().join('|'));
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(asked.length <= app.total(), `${asked.length} > ${app.total()}`);
  });

  test('saves the full answer history to the server after every pick', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const [a, b] = app.pair();
    await app.click('b');
    const saves = app.posts.filter(p => p.url === '/api/answers');
    assert.equal(saves.length, 1);
    assert.deepEqual(JSON.parse(saves[0].body), [{ a, b, w: b }]);
  });

  test('a single city is ranked immediately without any questions', async () => {
    const app = await loadApp({ cities: ['Boise, ID'], answers: [] });
    assert.equal(app.pair(), null);
    assert.deepEqual(app.rankings(), ['1. Boise, ID\n']);
  });
});

describe('logic: not here and undo', () => {
  test('"Not here" drops a city from the final ranking', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const [a] = app.pair();
    await app.click('xa');
    assert.deepEqual(app.answers().at(-1), { x: a });
    await app.answerBy(CITIES);
    assert.deepEqual(app.rankings().at(-1), rankText(CITIES.filter(c => c !== a)));
  });

  test('"Not here" keeps earlier answers instead of asking them again', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const done = await app.answerBy(CITIES.slice()).then(() => app.answers().filter(e => e.w));
    // Restart from a saved history containing those picks plus a removal; no pick should be re-asked.
    const keep = done.slice(0, 3);
    const app2 = await loadApp({ cities: shuffled, answers: keep });
    const loser = [app2.pair()[0]];
    const asked = [];
    await app2.click('xa');
    for (let p = app2.pair(); p; p = app2.pair()) {
      asked.push([...p].sort().join('|'));
      await app2.click(CITIES.indexOf(p[0]) < CITIES.indexOf(p[1]) ? 'a' : 'b');
    }
    for (const e of keep) assert.ok(!asked.includes([e.a, e.b].sort().join('|')), 're-asked ' + e.a + ' vs ' + e.b);
    assert.deepEqual(app2.rankings().at(-1), rankText(CITIES.filter(c => !loser.includes(c))));
  });

  test('undo removes the last pick and asks that same pair again', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    await app.click('a');
    const second = app.pair();
    await app.click('b');
    await app.click('u');
    assert.equal(app.answers().length, 1);
    assert.deepEqual(app.pair(), second);
  });

  test('undo on the final ranking reopens the last comparison', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const asked = await app.answerBy(CITIES);
    await app.click('u');
    assert.deepEqual(app.pair(), asked.at(-1));
  });

  test('undo is disabled before any answer is given', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    assert.match(app.html(), /id="u" disabled/);
  });
});

describe('logic: resume and migration', () => {
  test('resuming with a complete saved history goes straight to the final ranking', async () => {
    const first = await loadApp({ cities: shuffled, answers: [] });
    await first.answerBy(CITIES);
    const app = await loadApp({ cities: shuffled, answers: first.answers() });
    assert.equal(app.pair(), null);
    assert.deepEqual(app.rankings(), [rankText(CITIES)]);
  });

  test('converts old true/false progress files into pair answers with the same result', async () => {
    const first = await loadApp({ cities: shuffled, answers: [] });
    await first.answerBy(CITIES);
    // Old format: one boolean per comparison, true = left city won.
    const old = first.answers().map(e => e.w === e.a);
    const app = await loadApp({ cities: shuffled, answers: old });
    assert.deepEqual(app.answers(), first.answers());
    assert.deepEqual(app.rankings(), [rankText(CITIES)]);
  });

  test('converts a partial old progress file and continues from where it stopped', async () => {
    const first = await loadApp({ cities: shuffled, answers: [] });
    await first.answerBy(CITIES);
    const all = first.answers();
    const app = await loadApp({ cities: shuffled, answers: all.slice(0, 4).map(e => e.w === e.a) });
    assert.deepEqual(app.answers(), all.slice(0, 4));
    assert.deepEqual(app.pair(), [all[4].a, all[4].b]);
  });
});

describe('ui: comparison screen', () => {
  test('left and right arrow keys pick the left and right city', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const [a, b] = app.pair();
    await app.key('ArrowLeft');
    assert.deepEqual(app.answers()[0], { a, b, w: a });
    const [c, d] = app.pair();
    await app.key('ArrowRight');
    assert.deepEqual(app.answers()[1], { a: c, b: d, w: d });
  });

  test('shift + right arrow marks the right city "Not here"', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const [, b] = app.pair();
    await app.key('ArrowRight', true);
    assert.deepEqual(app.answers(), [{ x: b }]);
  });

  test('shows each city\'s summary under its name', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] });
    const [a, b] = app.pair();
    assert.equal(app.el('a0').textContent, 'Sunny in ' + a);
    assert.equal(app.el('b0').textContent, 'Sunny in ' + b);
  });

  test('shows "Summary unavailable" with the reason when the summary fails', async () => {
    const app = await loadApp({ cities: shuffled, answers: [] }, { summary: () => ({ error: 'No ANTHROPIC_API_KEY found in .env' }) });
    assert.equal(app.el('a0').textContent, 'Summary unavailable: No ANTHROPIC_API_KEY found in .env');
  });
});
