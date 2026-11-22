// Runs the rules detector over a scenario folder and compares it with an expected-results CSV.
// Usage: node app/tools/check_validation.js [folder] [expected.csv]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const data = path.resolve(__dirname, '..', '..', '..', 'data');  // repo/data
const appDir = path.resolve(__dirname, '..');
const folder = process.argv[2] || path.join(data, 'validation_set');
const csvPath = process.argv[3] || path.join(data, 'validation_expected_results.csv');

for (const f of ['catalog.js', 'detector.js', 'warnings.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(appDir, 'src', f), 'utf8'), { filename: f });
}

const expected = {};
const [head, ...lines] = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const cols = head.split(',');
for (const line of lines) {
  const v = line.split(',');
  const row = Object.fromEntries(cols.map((c, i) => [c, v[i] || '']));
  expected[row.id] = row;
}

let bad = 0;
for (const file of fs.readdirSync(folder).filter((f) => f.endsWith('.json')).sort()) {
  const r = SSDetector.analyze(JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')));
  const e = expected[r.id];
  const got = { verdict: r.verdict, scam_type: r.scamType, risk_score: String(r.score), first_alert: r.firstAlert == null ? '' : String(r.firstAlert), red_flags: [...r.flags].sort().join(';') };
  const diffs = [];
  if (e) {
    const want = { ...e, red_flags: e.red_flags.split(';').filter(Boolean).sort().join(';') };
    for (const k of Object.keys(got)) if (got[k] !== want[k]) diffs.push(`${k}: got ${got[k] || '∅'}, want ${want[k] || '∅'}`);
  }
  const w = SSWarnings.build(r);
  // warnings_ro rules: at most 6 lines, and no line repeats a link or number from the message.
  if (w.lines.length > SSWarnings.MAX_LINES) diffs.push(`warning has ${w.lines.length} lines`);
  const msgText = r.messages.filter((m) => m.from === 'sender').map((m) => m.text).join(' ');
  w.lines.forEach((l) => { if (SSWarnings.containsMessageContact(l, msgText)) diffs.push(`line repeats the message: ${l}`); });
  if (diffs.length) bad++;
  console.log(`${diffs.length ? 'FAIL' : 'ok  '} ${r.id} ${r.verdict} ${r.scamType} ${r.score} alert=${r.firstAlert ?? '-'} ${diffs.join(' | ')}`);
  w.lines.forEach((l) => console.log('       ' + l));
  if (w.action) console.log('       [button] ' + w.action.label + ' · ' + w.action.detail);
}
console.log(bad ? `\n${bad} scenario(s) differ` : '\nAll scenarios match');
process.exit(bad ? 1 : 0);
