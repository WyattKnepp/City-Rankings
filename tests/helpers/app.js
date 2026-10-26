// Runs the <script> from index.html in a vm sandbox with a minimal fake DOM and fetch,
// so the ranking flow (merge sort, undo, "Not here", resume) can be driven like a user would.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const SCRIPT = HTML.match(/<script>([\s\S]*)<\/script>/)[1];

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

function makeEl(id) {
  return { id, textContent: '', onclick: null, dataset: {}, classList: { toggle() {} },
           click() { this.onclick && this.onclick(); } };
}

// state: {cities, answers}; summary(city) -> response object for /api/summary
async function loadApp(state, { summary = city => ({ fields: [], data: { Weather: 'Sunny in ' + city } }) } = {}) {
  let els = new Map();
  const posts = [];
  const keyHandlers = [];
  const app = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      els = new Map();
      for (const [, id] of v.matchAll(/id="([^"]+)"/g)) els.set(id, makeEl(id));
    },
  };
  const document = {
    getElementById: id => (id === 'app' ? app : els.get(id) ?? null),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { if (type === 'keydown') keyHandlers.push(fn); },
    createElement: () => makeEl(''),
    body: { appendChild() {} },
  };
  const json = v => Promise.resolve({ json: async () => structuredClone(v) });
  const fetch = (url, opts = {}) => {
    if (opts.method === 'POST') { posts.push({ url, body: opts.body }); return json({}); }
    if (url === '/api/state') return json(state);
    if (url.startsWith('/api/summary')) return json(summary(decodeURIComponent(url.split('city=')[1])));
    return json({});
  };
  const ctx = vm.createContext({ document, fetch, localStorage: {}, window: { scrollTo() {} },
                                 alert() {}, console, Promise, Map, Set, JSON, Math, String });
  vm.runInContext(SCRIPT, ctx);
  await settle();

  const api = {
    posts,
    el: id => els.get(id) ?? null,
    html: () => app.innerHTML,
    answers: () => JSON.parse(vm.runInContext('JSON.stringify(answers)', ctx)),
    total: () => vm.runInContext('total', ctx),
    // The pair currently on screen, or null when the final ranking is showing.
    pair: () => (els.get('a') ? [els.get('a').textContent, els.get('b').textContent] : null),
    async click(id) { els.get(id).click(); await settle(); },
    async key(key, shiftKey = false) {
      for (const h of keyHandlers) h({ key, shiftKey, preventDefault() {} });
      await settle();
    },
    // Answers every comparison by the given preference order; returns the pairs asked.
    async answerBy(order) {
      const asked = [];
      for (let p = api.pair(); p; p = api.pair()) {
        asked.push(p);
        await api.click(order.indexOf(p[0]) < order.indexOf(p[1]) ? 'a' : 'b');
        if (asked.length > 1000) throw new Error('sort never finished');
      }
      return asked;
    },
    rankings: () => posts.filter(p => p.url === '/api/rankings').map(p => p.body),
  };
  return api;
}

module.exports = { loadApp };
