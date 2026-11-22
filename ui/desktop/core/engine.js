/*
 * Loads the exact same detector, warnings and analyzer the web app uses
 * (app/src), so the pill, the dashboard and the jury's re-run always agree.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, '..', '..', 'app', 'src');

// Default: the Scam Shield backend (detector/api.py). Set SCAM_SHIELD_API_URL=off for rules only.
const apiUrl = process.env.SCAM_SHIELD_API_URL || 'http://127.0.0.1:8000/analyze';
if (apiUrl !== 'off') {
  globalThis.SS_CONFIG = { apiUrl, apiTimeoutMs: Number(process.env.SCAM_SHIELD_API_TIMEOUT_MS) || 120000 };
}
for (const f of ['catalog.js', 'detector.js', 'warnings.js', 'analyzer.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: path.join(SRC, f) });
}

module.exports = {
  analyze: (scenario) => globalThis.SSAnalyzer.analyze(scenario),
  forgetCache: () => globalThis.SSAnalyzer.clearCache()
};
