/* Scam Shield app: the reader screen (#verifica) and the jury dashboard (#rezultate). */
(function () {
  'use strict';

  var h = React.createElement;
  var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;
  var S = window.ScamShield, A = window.SSAnalyzer, P = window.SSParse, W = window.SSWarnings;

  var CHANNELS = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'e-mail', chat: 'chat', call_transcript: 'apel telefonic' };

  /* ---------- shared pieces ---------- */

  // `seen` is shared across the whole thread: each label is named once, at its first phrase.
  function highlighted(text, spans, on, seen) {
    if (!on || !spans || !spans.length) return text;
    var out = [], pos = 0;
    spans.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (s, i) {
      if (s.start < pos || s.end > text.length) return;
      if (s.start > pos) out.push(text.slice(pos, s.start));
      var first = !seen[s.code];
      seen[s.code] = true;
      out.push(h(S.FlagMark, { key: i, code: s.code, tag: first }, text.slice(s.start, s.end)));
      pos = s.end;
    });
    if (pos < text.length) out.push(text.slice(pos));
    return out;
  }

  function Thread(p) {
    var r = p.result;
    var seen = {};
    return h('div', { className: 'ss-thread' + (p.why ? ' is-why' : '') }, r.messages.map(function (m) {
      return h(S.MessageBubble, {
        key: m.n, n: m.n, from: m.from,
        alert: r.verdict !== 'SAFE' && r.firstAlert === m.n,
        alertVerdict: r.verdict
      }, m.text ? highlighted(m.text, m.spans, p.why, seen) : h('em', null, '(mesaj gol)'));
    }));
  }

  function callAction(r) {
    if (!r.action || !r.action.tel) return undefined;
    return function () { window.location.href = 'tel:' + r.action.tel.replace(/\s/g, ''); };
  }

  function ReadAloud(p) {
    var st = useState(false), on = st[0], setOn = st[1];
    var ctl = useRef(null);
    useEffect(function () { return function () { if (ctl.current) ctl.current.stop(); }; }, []);
    if (!('speechSynthesis' in window)) return null;
    function toggle() {
      if (on) { if (ctl.current) ctl.current.stop(); setOn(false); return; }
      setOn(true);
      // A Romanian voice, female whenever the device has one (src/voice.js).
      ctl.current = window.SSVoice.speak(p.text, { onEnd: function () { setOn(false); } });
    }
    return h(S.Button, { variant: 'secondary', size: 'md', onClick: toggle, 'aria-pressed': on }, on ? 'Opriți citirea' : 'Citește cu voce tare');
  }

  function describeSource(d, r) {
    if (!d) return null;
    if (d.fromFile) return 'Fișier: ' + d.fromFile + ' · ' + r.messages.length + (r.messages.length === 1 ? ' mesaj' : ' mesaje');
    var ch = CHANNELS[d.channel] || d.channel;
    if (d.kind === 'whatsapp') return 'Am citit ' + d.count + ' mesaje din WhatsApp' + (d.senderName ? ', de la „' + d.senderName + '”' : '') + '.';
    if (d.kind === 'email') return 'Am citit un e-mail' + (d.senderAddress ? ' de la ' + d.senderAddress : '') + '.';
    if (d.count > 1) return 'Am citit o conversație de ' + d.count + ' mesaje.';
    return d.channel === 'call_transcript' ? 'Am citit ce vi s-a spus la telefon.' : null;
  }

  function verdictTitle(v) { return S.VERDICTS[v].title; }

  /* ---------- Reader screen ---------- */

  function Reader() {
    var tx = useState(''), text = tx[0], setText = tx[1];
    var kn = useState('unknown'), known = kn[0], setKnown = kn[1];
    var md = useState('message'), mode = md[0], setMode = md[1];
    var ph = useState('idle'), phase = ph[0], setPhase = ph[1];
    var rs = useState(null), res = rs[0], setRes = rs[1];
    var wy = useState(false), why = wy[0], setWhy = wy[1];
    var hn = useState(''), hint = hn[0], setHint = hn[1];
    var sr = useState(null), source = sr[0], setSource = sr[1];
    var fileRef = useRef(null);
    var resultRef = useRef(null);

    useEffect(function () {
      if (phase === 'result' && resultRef.current) {
        resultRef.current.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      if (phase === 'idle') { var el = document.getElementById('ss-message'); if (el && res === null && text === '') el.focus(); }
    }, [phase]);

    function run(scenario, detected) {
      setPhase('checking'); setWhy(false); setHint('');
      var t0 = Date.now();
      A.analyze(scenario).then(function (r) {
        setTimeout(function () { setRes(r); setSource(detected || null); setPhase('result'); }, Math.max(0, 450 - (Date.now() - t0)));
      }).catch(function () {
        setPhase('idle');
        setHint('Nu am putut verifica mesajul. Încercați din nou.');
      });
    }

    function check() {
      var parsed = P.parsePasted(text, { known: known === 'known', channel: mode === 'call' ? 'call_transcript' : null });
      if (!parsed) {
        setHint('Lipiți mai întâi un mesaj în căsuța de mai sus.');
        var el = document.getElementById('ss-message'); if (el) el.focus();
        return;
      }
      if (parsed.detected.kind === 'json') parsed.detected = { fromFile: 'text lipit', count: parsed.detected.count };
      run(parsed.scenario, parsed.detected);
    }

    function reset() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setPhase('idle'); setRes(null); setText(''); setWhy(false); setSource(null); setHint('');
    }

    function paste() {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setHint('Țineți apăsat în căsuță și alegeți „Lipește”, sau apăsați Ctrl și V.');
        return;
      }
      navigator.clipboard.readText().then(function (t) {
        if (t && t.trim()) { setText(t); setHint(''); }
        else setHint('Nu aveți nimic copiat. Copiați întâi mesajul, apoi apăsați „Lipește”.');
      }).catch(function () {
        setHint('Țineți apăsat în căsuță și alegeți „Lipește”, sau apăsați Ctrl și V.');
      });
    }

    function openFile(file) {
      if (!file) return;
      P.readScenarioFile(file).then(function (sc) {
        setText('');
        run(sc, { fromFile: file.name });
      }).catch(function (err) { setHint('Fișierul „' + file.name + '” nu poate fi citit: ' + err.message + '.'); });
    }

    function onDrop(e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.json$/i.test(f.name)) openFile(f);
    }

    var options = [
      { id: 'file', icon: 'file', label: 'Deschide un fișier' },
      { id: 'call', icon: 'call', label: mode === 'call' ? 'A fost un mesaj scris' : 'A fost un apel' }
    ];

    var island;
    if (phase === 'idle') {
      island = h(React.Fragment, null,
        h(S.CheckIsland, {
          state: 'idle', value: text,
          onChange: function (e) { setText(e.target.value); if (hint) setHint(''); },
          onCheck: check, onPaste: paste,
          label: mode === 'call' ? 'Ce vi s-a spus la telefon?' : 'Ați primit un mesaj ciudat?',
          placeholder: mode === 'call' ? 'Scrieți cu cuvintele dumneavoastră ce v-a cerut persoana…' : 'Lipiți aici mesajul sau scrieți ce vi s-a spus la telefon…'
        }),
        hint ? h('div', { className: 'reader-hint', role: 'alert' }, h(S.Mascot, { mood: 'suspicious', size: 44 }), h('p', null, hint)) : null,
        h(S.SourceOptions, { options: options, onSelect: function (id) {
          if (id === 'file') fileRef.current.click();
          if (id === 'call') setMode(mode === 'call' ? 'message' : 'call');
        } }),
        h(S.SenderChoice, { value: known, onChange: setKnown }));
    } else if (phase === 'checking') {
      island = h(S.CheckIsland, { state: 'checking' });
    } else {
      island = h(S.CheckIsland, { state: 'result', verdict: res.verdict, onReset: reset });
    }

    var result = null;
    if (phase === 'result' && res) {
      var sourceLine = describeSource(source, res);
      var showThread = why || res.messages.length > 1;
      result = h('div', { className: 'reader-result', ref: resultRef, tabIndex: -1 },
        h(S.VerdictCard, {
          verdict: res.verdict, warning: res.lines || res.warning, action: res.action,
          onAction: callAction(res),
          onWhy: function () { setWhy(!why); },
          onShare: res.verdict !== 'SAFE' ? function () { window.open('https://wa.me/?text=' + encodeURIComponent(W.shareText(res)), '_blank', 'noopener'); } : undefined
        }),
        h('div', { className: 'reader-tools' },
          h(ReadAloud, { text: W.speech({ verdict: res.verdict, lines: res.lines, actionLine: res.actionLine, warning: res.warning }).text })),
        sourceLine ? h('p', { className: 'reader-source' }, sourceLine) : null,
        showThread ? h('section', { className: 'reader-thread', 'aria-label': 'Conversația' },
          h('h2', { className: 'section-title' }, why ? 'De ce credem asta' : 'Conversația'),
          why && !res.messages.some(function (m) { return m.spans.length; }) ? h('p', { className: 'reader-source' }, 'Nu am găsit cuvinte periculoase în mesaj.') : null,
          h(Thread, { result: res, why: why })) : null);
    }

    return h('main', { className: 'reader', onDragOver: function (e) { e.preventDefault(); }, onDrop: onDrop },
      h('input', { type: 'file', accept: '.json,application/json', ref: fileRef, hidden: true, onChange: function (e) { openFile(e.target.files[0]); e.target.value = ''; } }),
      h('div', { className: 'reader-col' }, island, result));
  }

  /* ---------- Jury dashboard ---------- */

  function readEntries(items) {
    // Folders dropped onto the page: walk them with the entries API.
    var files = [];
    function walk(entry) {
      if (!entry) return Promise.resolve();
      if (entry.isFile) return new Promise(function (res) { entry.file(function (f) { files.push(f); res(); }, function () { res(); }); });
      if (entry.isDirectory) {
        var reader = entry.createReader();
        return new Promise(function (res) {
          var all = [];
          (function next() {
            reader.readEntries(function (batch) {
              if (!batch.length) Promise.all(all.map(walk)).then(res);
              else { all = all.concat(Array.from(batch)); next(); }
            }, function () { res(); });
          })();
        });
      }
      return Promise.resolve();
    }
    var entries = Array.from(items).map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; });
    return Promise.all(entries.map(walk)).then(function () { return files; });
  }

  function pool(items, size, fn) {
    var i = 0;
    function worker() { if (i >= items.length) return Promise.resolve(); var item = items[i++]; return fn(item).then(worker); }
    var workers = [];
    for (var k = 0; k < Math.min(size, items.length); k++) workers.push(worker());
    return Promise.all(workers);
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function ScoreSteps(p) {
    var r = p.result, POINTS = window.SS_CATALOG.red_flag_points;
    return h('div', { className: 'ss-table-wrap' }, h('table', { className: 'ss-table steps' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'From'), h('th', { scope: 'col' }, 'New red flags'), h('th', { scope: 'col', className: 'ss-num' }, 'Score'))),
      h('tbody', null, r.messages.map(function (m) {
        var isAlert = r.verdict !== 'SAFE' && r.firstAlert === m.n;
        return h('tr', { key: m.n, className: isAlert ? 'is-alert' : undefined },
          h('td', { className: 'ss-mono' }, m.n),
          h('td', null, m.from),
          h('td', null, m.flags.length ? h('div', { className: 'ss-flags' }, m.flags.map(function (f) { return h('code', { key: f, className: 'ss-code' }, f + ' +' + POINTS[f]); })) : '—'),
          h('td', { className: 'ss-num' }, m.score, isAlert ? h('span', { className: 'steps-alert' }, ' ← first alert') : null));
      }))));
  }

  function Detail(p) {
    var r = p.row.result;
    var meta = [CHANNELS[r.channel] || r.channel, r.sender.name, r.sender.address, r.sender.known_contact ? 'known contact' : 'unknown contact'].filter(Boolean).join(' · ');
    return h('section', { className: 'detail', 'aria-label': 'Scenario ' + r.id },
      h('div', { className: 'detail-top' },
        h(S.Button, { variant: 'quiet', size: 'md', onClick: p.onBack }, '← Back to all results'),
        h('span', { className: 'detail-engine', title: r.engine },
          isAI(r) ? 'Engine: AI (rules + fine-tuned model), on this laptop' : 'Engine: backup rules (AI backend not reachable)')),
      h('div', { className: 'detail-head' },
        h('h2', { className: 'detail-id' }, r.id),
        h(S.VerdictBadge, { verdict: r.verdict }),
        h('code', { className: 'ss-code' }, r.scamType),
        h('span', { className: 'detail-meta' }, meta)),
      p.diffs && p.diffs.length ? h('div', { className: 'mismatch', role: 'note' },
        h('strong', null, 'Differs from the answer key: '),
        p.diffs.map(function (d) { return d.field + ' ' + d.got + ' (expected ' + d.want + ')'; }).join(' · ')) : null,
      h('div', { className: 'detail-grid' },
        h('div', { className: 'detail-col' },
          h(S.VerdictCard, { verdict: r.verdict, warning: r.lines || r.warning, action: r.action, onAction: callAction(r) }),
          h(S.RiskMeter, { score: r.score, label: 'Risk score' }),
          h(ScoreSteps, { result: r })),
        h('div', { className: 'detail-col' },
          h('h3', { className: 'section-title' }, 'Conversation, with red flags highlighted'),
          h(Thread, { result: r, why: true }))));
  }

  /* Engine that produced a row: our backend (AI) or the in-page rules fallback. */
  function isAI(r) { return r && /^api/.test(r.engine || ''); }

  /* Compact jury table (brief: 6 columns, sorted by ID, all rows on one or two screens, readable from a few metres). */
  function JuryTable(p) {
    var rows = p.rows.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return h('div', { className: 'jt-wrap' }, h('table', { className: 'jt' },
      h('thead', null, h('tr', null,
        ['ID', 'Verdict', 'Scam type', 'Risk', 'First alert', 'Red flags', 'Engine'].map(function (c, i) {
          return h('th', { key: c, scope: 'col', className: i === 3 || i === 4 ? 'jt-num' : undefined }, c);
        }))),
      h('tbody', null, rows.map(function (row) {
        if (row.error) return h('tr', { key: row.id }, h('td', { className: 'jt-id' }, row.id), h('td', { colSpan: 6, className: 'jt-err' }, row.error));
        var x = row.result, ai = isAI(x);
        var open = function () { p.onOpen(row.id); };
        return h('tr', { key: row.id, className: 'jt-row is-' + x.verdict.toLowerCase() + ((p.fresh || {})[row.id] ? ' is-new' : ''), tabIndex: 0, onClick: open,
          onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
          'aria-label': row.id + ': ' + x.verdict + ', deschide detaliile' },
          h('td', { className: 'jt-id' }, x.id || row.id),
          h('td', null, h(S.VerdictBadge, { verdict: x.verdict })),
          h('td', { className: 'jt-type' }, x.scamType),
          h('td', { className: 'jt-num' }, x.score),
          h('td', { className: 'jt-num' }, x.verdict === 'SAFE' || x.firstAlert == null ? '' : x.firstAlert),
          h('td', { className: 'jt-flags' }, x.flags.length ? x.flags.join(' · ') : '—'),
          h('td', null, h('span', { className: 'jt-engine ' + (ai ? 'is-ai' : 'is-rules'), title: x.engine }, ai ? 'AI' : 'rules')));
      }))));
  }

  function Dashboard() {
    var rw = useState([]), rows = rw[0], setRows = rw[1];
    var pg = useState(null), progress = pg[0], setProgress = pg[1];
    var ex = useState(null), expected = ex[0], setExpected = ex[1];
    var op = useState(null), openId = op[0], setOpenId = op[1];
    var dg = useState(false), dragging = dg[0], setDragging = dg[1];
    var nt = useState(''), notice = nt[0], setNotice = nt[1];
    var fr = useState({}), fresh = fr[0], setFresh = fr[1];  // ids added or re-run in the last batch
    var dirRef = useRef(null), filesRef = useRef(null), csvRef = useRef(null);

    // mode "replace": a new folder starts a fresh table. mode "add": new test entries are merged in;
    // a file whose scenario id is already in the table replaces that row (a re-run), new ids are appended.
    function loadFiles(list, mode) {
      var files = Array.from(list || []);
      setNotice('');
      var csv = files.filter(function (f) { return /\.csv$/i.test(f.name); })[0];
      if (csv) csv.text().then(function (t) { setExpected(P.parseExpectedCsv(t)); });
      var jsons = files.filter(function (f) { return /\.json$/i.test(f.name); });
      if (!jsons.length) { if (!csv) setNotice('No .json scenario files found in what you chose.'); return; }
      var adding = mode === 'add';
      setOpenId(null);
      if (!adding) setRows([]);
      setFresh({});
      setProgress({ done: 0, total: jsons.length });
      var done = 0, seenInBatch = {}, added = [];
      var before = {}; if (adding) rows.forEach(function (r) { before[r.id] = true; });
      pool(jsons, 4, function (file) {
        var base = file.name.replace(/\.json$/i, '');
        return P.readScenarioFile(file)
          .then(function (sc) { return A.analyze(sc).then(function (r) { return { id: r.id || base, file: file.name, result: r }; }); })
          .catch(function (err) { return { id: base, file: file.name, error: 'Invalid file ' + file.name + ': ' + err.message }; })
          .then(function (row) {
            if (seenInBatch[row.id]) row.id = row.id + ' (' + row.file + ')';  // two files with one id in the same batch
            seenInBatch[row.id] = true;
            added.push(row.id);
            done++;
            // Show each result as soon as it arrives.
            setRows(function (prev) { return prev.filter(function (r) { return r.id !== row.id; }).concat([row]); });
            setFresh(function (prev) { var n = Object.assign({}, prev); n[row.id] = true; return n; });
            setProgress({ done: done, total: jsons.length });
          });
      }).then(function () {
        setProgress(null);
        if (adding && Object.keys(before).length) {
          var rerun = added.filter(function (id) { return before[id]; }).length, fresh = added.length - rerun;
          var parts = [];
          if (fresh) parts.push(fresh + ' new scenario' + (fresh === 1 ? '' : 's') + ' added');
          if (rerun) parts.push(rerun + ' re-checked');
          setNotice(parts.join(', ') + '. Marked NEW in the table.');
        }
        if (adding && added.length === 1) setOpenId(added[0]);  // one new entry: show its result straight away
      });
    }

    function onDrop(e) {
      e.preventDefault(); setDragging(false);
      var dt = e.dataTransfer;
      var plain = Array.from(dt.files || []); // must be read now: the browser empties dataTransfer after the event
      // Dropping adds to the table (a dropped folder of new ids just adds rows; same ids are re-run).
      if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) {
        readEntries(dt.items).then(function (files) { loadFiles(files.length ? files : plain, 'add'); });
      } else loadFiles(plain, 'add');
    }

    var ok = rows.filter(function (r) { return r.result; });
    var count = function (v) { return ok.filter(function (r) { return r.result.verdict === v; }).length; };
    var diffsById = {};
    if (expected) ok.forEach(function (r) { if (expected[r.result.id]) diffsById[r.id] = P.compare(r.result, expected[r.result.id]); });
    var checked = Object.keys(diffsById);
    var fallbackCount = ok.filter(function (r) { return !isAI(r.result); }).length;
    var mismatched = checked.filter(function (id) { return diffsById[id].length; });

    var open = openId ? rows.filter(function (r) { return r.id === openId; })[0] : null;
    if (open) return h('main', { className: 'dash' }, h(Detail, { row: open, diffs: diffsById[open.id], onBack: function () { setOpenId(null); } }));

    var tableRows = rows.map(function (r) {
      if (r.error) return { id: r.id, error: r.error };
      var x = r.result;
      return { id: r.id, verdict: x.verdict, type: x.scamType, score: x.score, firstAlert: x.firstAlert, flags: x.flags };
    });

    return h('main', {
      className: 'dash' + (dragging ? ' is-dragging' : ''),
      onDragOver: function (e) { e.preventDefault(); if (!dragging) setDragging(true); },
      onDragLeave: function (e) { if (e.currentTarget === e.target) setDragging(false); },
      onDrop: onDrop
    },
      h('input', { type: 'file', ref: dirRef, hidden: true, webkitdirectory: '', directory: '', multiple: true, onChange: function (e) { loadFiles(e.target.files, 'replace'); e.target.value = ''; } }),
      h('input', { type: 'file', ref: filesRef, hidden: true, multiple: true, accept: '.json,.csv', onChange: function (e) { loadFiles(e.target.files, 'add'); e.target.value = ''; } }),
      h('input', { type: 'file', ref: csvRef, hidden: true, accept: '.csv', onChange: function (e) { var f = e.target.files[0]; if (f) f.text().then(function (t) { setExpected(P.parseExpectedCsv(t)); }); e.target.value = ''; } }),
      h('div', { className: 'dash-bar' },
        h('div', { className: 'dash-actions' },
          h(S.Button, { variant: 'primary', size: 'md', icon: 'file', onClick: function () { dirRef.current.click(); } }, 'Load folder'),
          h(S.Button, { variant: 'secondary', size: 'md', onClick: function () { filesRef.current.click(); } }, rows.length ? 'Add test files' : 'Choose files'),
          h(S.Button, { variant: 'secondary', size: 'md', onClick: function () { csvRef.current.click(); } }, expected ? 'Answer key loaded ✓' : 'Load answer key (CSV)'),
          ok.length ? h(S.Button, { variant: 'quiet', size: 'md', onClick: function () { download('scam_shield_results.csv', P.toCsv(ok.map(function (r) { return r.result; }))); } }, 'Export CSV') : null,
          rows.length && !progress ? h(S.Button, { variant: 'quiet', size: 'md', onClick: function () { setRows([]); setFresh({}); setOpenId(null); setNotice(''); } }, 'Clear') : null),
        h('p', { className: 'dash-hint' }, progress ? 'Checking ' + progress.done + ' / ' + progress.total + '…' : 'Or drag files or a folder onto this page to add them.')),
      notice ? h('p', { className: 'reader-hint', role: 'status' }, notice) : null,
      rows.length || progress ? h(S.ResultsSummary, { total: rows.length, scam: count('SCAM'), suspicious: count('SUSPICIOUS'), safe: count('SAFE') }) : null,
      expected && checked.length ? h('div', { className: 'selfcheck ' + (mismatched.length ? 'is-bad' : 'is-good'), role: 'status' },
        h(S.VerdictIcon, { verdict: mismatched.length ? 'SCAM' : 'SAFE', size: 24 }),
        h('span', null, mismatched.length
          ? mismatched.length + ' of ' + checked.length + ' differ from the answer key: ' + mismatched.join(', ')
          : 'All ' + checked.length + ' match the answer key')) : null,
      ok.length && (window.SS_CONFIG || {}).apiUrl && fallbackCount ? h('div', { className: 'selfcheck is-bad', role: 'alert' },
        h(S.VerdictIcon, { verdict: 'SUSPICIOUS', size: 24 }),
        h('span', null, fallbackCount + ' of ' + ok.length + ' rows used the backup rules because the AI backend did not answer. Start api.py, reload this page, and load the folder again.')) : null,
      rows.length ? h('p', { className: 'jt-caption' },
        'Detector: rules and link checks + a fine-tuned XLM-RoBERTa model, combined by a calibrated fusion. Everything runs on this laptop; no message leaves it.') : null,
      rows.length ? h(JuryTable, { rows: rows, fresh: rows.length > Object.keys(fresh).length ? fresh : {}, onOpen: setOpenId }) :
        progress ? null : h('div', { className: 'dash-empty' },
          h(S.Mascot, { form: 'full', mood: 'sleeping', size: 96, className: 'dash-empty-cat' }),
          h('p', { className: 'dash-empty-title' }, 'No scenarios loaded yet'),
          h('p', null, 'Load the validation_set or test set folder. Each .json file becomes one row; click a row to see its messages, red flags and warning.')));
  }

  /* ---------- Shell ---------- */

  function useTab() {
    function read() { return location.hash === '#rezultate' ? 'dashboard' : 'reader'; }
    var st = useState(read);
    useEffect(function () {
      function on() { st[1](read()); }
      window.addEventListener('hashchange', on);
      return function () { window.removeEventListener('hashchange', on); };
    }, []);
    return st[0];
  }

  /* Live status of the AI backend (polls /health). Green = verdicts come from the AI; amber = backup rules. */
  function BackendStatus() {
    var cfg = window.SS_CONFIG || {};
    var st = useState(cfg.apiUrl ? 'checking' : 'off'), status = st[0], setStatus = st[1];
    useEffect(function () {
      if (!cfg.apiUrl) return undefined;
      var url = cfg.apiUrl.replace(/\/(v1\/)?analyze\/?$/, '/health');
      var alive = true;
      function ping() {
        fetch(url, { cache: 'no-store' }).then(function (r) { if (alive) setStatus(r.ok ? 'on' : 'off'); })
          .catch(function () { if (alive) setStatus('off'); });
      }
      ping();
      var id = setInterval(ping, 5000);
      return function () { alive = false; clearInterval(id); };
    }, []);
    var label = status === 'on' ? 'AI activ' : status === 'checking' ? 'Se conectează…' : 'Mod de rezervă';
    var title = status === 'on' ? 'Verdictele vin de la modelul AI, pe acest calculator.' : 'Serverul AI nu răspunde: se folosesc regulile de rezervă.';
    return h('span', { className: 'status-chip is-' + status, role: 'status', title: title },
      h('span', { className: 'status-dot', 'aria-hidden': true }), h('span', { className: 'status-label' }, label));
  }

  function ShieldMark() {
    return h('span', { className: 'app-brand-mark', 'aria-hidden': true },
      h('svg', { viewBox: '0 0 24 24', width: 20, height: 20 },
        h('path', { d: 'M12 2.5 4.5 5.5v6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10v-6z', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' }),
        h('path', { d: 'm8.6 12.2 2.4 2.4 4.6-4.8', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })));
  }

  function App() {
    var tab = useTab();
    return h(React.Fragment, null,
      h('header', { className: 'app-header' }, h('div', { className: 'app-header-inner' + (tab === 'dashboard' ? ' is-wide' : '') },
        h('a', { className: 'app-brand', href: '#verifica' }, h(ShieldMark),
          h('span', { className: 'app-brand-text' }, 'Scam Shield', h('span', { className: 'app-brand-sub' }, 'Protecție împotriva fraudelor'))),
        h('div', { className: 'app-header-right' },
          h(BackendStatus),
          h('nav', { className: 'app-tabs', 'aria-label': 'Ecrane' },
            h('a', { href: '#verifica', className: 'app-tab' + (tab === 'reader' ? ' is-on' : ''), 'aria-current': tab === 'reader' ? 'page' : undefined }, 'Verifică'),
            h('a', { href: '#rezultate', className: 'app-tab' + (tab === 'dashboard' ? ' is-on' : ''), 'aria-current': tab === 'dashboard' ? 'page' : undefined }, 'Rezultate'))))),
      // Both screens stay mounted so switching tabs keeps the loaded dashboard.
      h('div', { hidden: tab !== 'reader' }, h(Reader)),
      h('div', { hidden: tab !== 'dashboard' }, h(Dashboard)));
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
