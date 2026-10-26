const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, startServer } = require('./helpers/server');

const CITIES = fs.readFileSync(path.join(ROOT, 'cities.txt'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const FIELDS = ['Weather', 'Music Scene', 'Nightlife', 'Size', 'Housing situation',
  'Political climate', 'Average age', 'Anything concerning', 'Anything cool'];

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const get = p => fetch(srv.url + p);
const post = (p, body) => fetch(srv.url + p, { method: 'POST', body });
const progressFile = () => path.join(srv.dataDir, 'progress.json');

describe('ui: main page', () => {
  test('serves index.html at the root', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /Where would you rather live\?/);
  });

  test('serves the page for any unknown path', async () => {
    const r = await get('/some/other/page');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<title>City Rankings<\/title>/);
  });

  test('serves the map data files as JSON', async () => {
    const coords = await (await get('/coords.json')).json();
    const states = await (await get('/states.json')).json();
    assert.deepEqual(coords['Chicago, IL'], [41.88, -87.63]);
    assert.ok(Array.isArray(states.IL) && states.IL.length > 0);
  });
});

describe('api: state', () => {
  test('a fresh start offers every city from cities.txt once with no answers', async () => {
    const s = await (await get('/api/state')).json();
    assert.deepEqual([...s.cities].sort(), [...CITIES].sort());
    assert.deepEqual(s.answers, []);
  });

  test('writes progress to the data dir and keeps the same city order on later loads', async () => {
    const first = await (await get('/api/state')).json();
    assert.ok(fs.existsSync(progressFile()));
    const second = await (await get('/api/state')).json();
    assert.deepEqual(second.cities, first.cities);
  });
});

describe('api: answers', () => {
  test('saves posted answers and returns them in the state', async () => {
    const { cities } = await (await get('/api/state')).json();
    const answers = [{ a: cities[0], b: cities[1], w: cities[1] }, { x: cities[2] }];
    assert.equal((await post('/api/answers', JSON.stringify(answers))).status, 200);
    const s = await (await get('/api/state')).json();
    assert.deepEqual(s.answers, answers);
    assert.deepEqual(s.cities, cities);
    assert.deepEqual(JSON.parse(fs.readFileSync(progressFile(), 'utf8')).answers, answers);
  });

  test('a non-JSON answers body leaves saved progress unchanged', async () => {
    const before = fs.readFileSync(progressFile(), 'utf8');
    await post('/api/answers', 'not json').catch(() => {});
    assert.equal(fs.readFileSync(progressFile(), 'utf8'), before);
  });

  test('rejects a non-JSON answers body with an error response',
    { todo: 'BUG: server.py raises on a non-JSON body and drops the connection without any HTTP response' },
    async () => {
      const r = await post('/api/answers', 'not json');
      assert.ok(r.status >= 400);
    });
});

describe('api: rankings', () => {
  test('writes the posted ranking text to rankings.txt in the data dir', async () => {
    const text = '1. Chicago, IL\n2. Austin, TX\n';
    assert.equal((await post('/api/rankings', text)).status, 200);
    assert.equal(fs.readFileSync(path.join(srv.dataDir, 'rankings.txt'), 'utf8'), text);
  });
});

describe('api: summary', () => {
  test('returns all nine summary fields for a known city', async () => {
    const r = await (await get('/api/summary?city=' + encodeURIComponent('Chicago, IL'))).json();
    assert.deepEqual(r.fields, FIELDS);
    for (const f of FIELDS) assert.ok(typeof r.data[f] === 'string' && r.data[f].length > 0, f);
  });

  test('returns an "Unknown city" error for a city not in the list', async () => {
    const r = await (await get('/api/summary?city=Atlantis%2C%20XX')).json();
    assert.deepEqual(r, { error: 'Unknown city' });
  });

  test('returns an error for a request with no city',
    { todo: 'BUG: /api/summary with no ?city= raises KeyError and drops the connection without any HTTP response' },
    async () => {
      const r = await (await get('/api/summary')).json();
      assert.ok(r.error);
    });

  test('keeps serving after a bad request', async () => {
    await get('/api/summary').catch(() => {});
    assert.equal((await get('/')).status, 200);
  });
});

describe('data: persistence', () => {
  test('progress and city order survive a server restart', async () => {
    const s = await startServer();
    let first;
    try {
      first = await (await fetch(s.url + '/api/state')).json();
      const answers = [{ a: first.cities[0], b: first.cities[1], w: first.cities[0] }];
      await fetch(s.url + '/api/answers', { method: 'POST', body: JSON.stringify(answers) });
      first.answers = answers;
    } finally { await s.stop(); }
    const s2 = await startServer(s.dataDir);
    try {
      assert.deepEqual(await (await fetch(s2.url + '/api/state')).json(), first);
    } finally { await s2.stop(); }
  });

  test('never touches progress.json or rankings.txt in the project folder', async () => {
    const snap = f => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : null);
    const before = [snap('progress.json'), snap('rankings.txt')];
    await post('/api/answers', '[]');
    await post('/api/rankings', 'x');
    assert.deepEqual([snap('progress.json'), snap('rankings.txt')], before);
  });
});
