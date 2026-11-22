// Checks that the Python warnings (app/tools/warnings_ro.py) and the app's JS port (app/src/warnings.js)
// give the same lines for every validation scenario, using the answer key's verdict, type and flags.
// Usage: node app/tools/check_warnings_parity.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const data = path.resolve(__dirname, '..', '..', '..', 'data');  // repo/data
const appDir = path.resolve(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(appDir, 'src', 'warnings.js'), 'utf8'));

const py = JSON.parse(execFileSync('python', ['-I', '-X', 'utf8', path.join(__dirname, 'warnings_ro.py'), data, '--json'], { encoding: 'utf8' }));
const [head, ...rows] = fs.readFileSync(path.join(data, 'validation_expected_results.csv'), 'utf8').trim().split(/\r?\n/);
const cols = head.split(',');
let bad = 0;
for (const line of rows) {
  const v = line.split(',');
  const r = Object.fromEntries(cols.map((c, i) => [c, v[i] || '']));
  const sc = JSON.parse(fs.readFileSync(path.join(data, 'validation_set', r.id + '.json'), 'utf8'));
  const js = SSWarnings.compose({ verdict: r.verdict, scamType: r.scam_type, flags: r.red_flags.split(';').filter(Boolean), messages: sc.messages, sender: sc.sender }).lines;
  const same = JSON.stringify(js) === JSON.stringify(py[r.id]);
  if (!same) { bad++; console.log('DIFF ' + r.id + '\n  py: ' + py[r.id].join(' / ') + '\n  js: ' + js.join(' / ')); }
  else console.log('same ' + r.id + ' (' + js.length + ' lines)');
}
console.log(bad ? `\n${bad} scenario(s) differ` : '\nPython and JS give identical warnings');
process.exit(bad ? 1 : 0);
