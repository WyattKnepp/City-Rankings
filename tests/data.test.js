const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers/server');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CITIES = read('cities.txt').split('\n').map(s => s.trim()).filter(Boolean);
const summaries = JSON.parse(read('summaries.json'));
const coords = JSON.parse(read('coords.json'));
const states = JSON.parse(read('states.json'));
const FIELDS = ['Weather', 'Music Scene', 'Nightlife', 'Size', 'Housing situation',
  'Political climate', 'Average age', 'Anything concerning', 'Anything cool'];

describe('data: city files', () => {
  test('cities.txt lists each city once as "Name, ST"', () => {
    assert.equal(new Set(CITIES).size, CITIES.length);
    for (const c of CITIES) assert.match(c, /^[^,]+, [A-Z]{2}$/, c);
  });

  test('every city has a cached summary with all nine fields filled in', () => {
    const missing = CITIES.filter(c => !summaries[c] || FIELDS.some(f => !summaries[c][f]));
    assert.deepEqual(missing, []);
  });

  test('every city has coordinates inside the continental-US-plus-AK/HI box', () => {
    for (const c of CITIES) {
      assert.ok(coords[c], 'no coords for ' + c);
      const [lat, lon] = coords[c];
      assert.ok(lat > 18 && lat < 72 && lon > -170 && lon < -65, c);
    }
  });

  test('every city\'s state has an outline for the map', () => {
    const missing = CITIES.map(c => c.slice(-2)).filter(st => !states[st]);
    assert.deepEqual([...new Set(missing)], []);
  });
});
