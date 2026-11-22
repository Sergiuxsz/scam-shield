/*
 * One entry point for verdicts: analyze(scenario) → Promise<result>.
 * Results are cached by scenario content, so opening the same file again
 * (the jury's live re-run) always shows exactly what the dashboard showed.
 * Nothing is stored outside this page's memory.
 */
(function (g) {
  'use strict';

  var D = g.SSDetector, W = g.SSWarnings;
  var POINTS = g.SS_CATALOG.red_flag_points;
  var CODES = Object.keys(POINTS);
  var cache = new Map();

  function keyOf(sc) {
    var n = D.normalizeScenario(sc);
    return JSON.stringify([n.id, n.channel, n.sender, n.messages]);
  }

  function finish(r) {
    var w = W.build(r);
    r.warning = w.warning;
    r.lines = w.lines;
    r.actionLine = w.actionLine;
    r.action = w.action;
    r.reasons = r.verdict === 'SAFE' ? [] : W.reasons(r, 3);
    return r;
  }

  /* Rebuilds score, verdict and first alert from a backend's per-message flags. */
  function fromBackend(sc, data, rules) {
    var counted = {}, score = 0, firstAlert = null;
    var byN = {};
    (data.messages || []).forEach(function (m) { byN[m.n] = m; });
    var messages = rules.messages.map(function (m) {
      var b = byN[m.n] || {};
      var fresh = [];
      (Array.isArray(b.flags) ? b.flags : []).forEach(function (code) {
        if (CODES.indexOf(code) < 0 || counted[code]) return;
        counted[code] = m.n; fresh.push(code); score += POINTS[code];
      });
      var capped = Math.min(100, score);
      if (firstAlert === null && capped >= 25) firstAlert = m.n;
      return { n: m.n, from: m.from, text: m.text, flags: fresh, spans: Array.isArray(b.spans) ? b.spans : m.spans, score: capped };
    });
    score = Math.min(100, score);
    var verdict = score >= 50 ? 'SCAM' : score >= 25 ? 'SUSPICIOUS' : 'SAFE';
    var types = g.SS_CATALOG.scam_types;
    var scamType = verdict === 'SAFE' ? 'NONE' : (types.indexOf(data.scamType) >= 0 && data.scamType !== 'NONE' ? data.scamType : rules.scamType === 'NONE' ? 'OTHER' : rules.scamType);
    return Object.assign({}, rules, {
      verdict: verdict, scamType: scamType, score: score,
      firstAlert: verdict === 'SAFE' ? null : firstAlert,
      flags: Object.keys(counted).sort(function (a, b) { return counted[a] - counted[b]; }),
      messages: messages, engine: 'api'
    });
  }

  function callBackend(sc, cfg) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, cfg.apiTimeoutMs || 15000);
    return fetch(cfg.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sc), signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).finally(function () { clearTimeout(timer); });
  }

  function analyze(sc) {
    var key = keyOf(sc);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    var rules = D.analyze(sc);
    var cfg = g.SS_CONFIG || {};
    var p = cfg.apiUrl
      ? callBackend(sc, cfg).then(function (data) { return fromBackend(sc, data, rules); })
          .catch(function (err) { var r = Object.assign({}, rules); r.engine = 'rules (backend unavailable: ' + err.message + ')'; return r; })
      : Promise.resolve(rules);
    return p.then(function (r) {
      finish(r);
      cache.set(key, r);
      return r;
    });
  }

  g.SSAnalyzer = { analyze: analyze, clearCache: function () { cache.clear(); } };
})(typeof window !== 'undefined' ? window : globalThis);
