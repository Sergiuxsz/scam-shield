/*
 * Scam Shield on a phone: everything the desktop has, in a phone shell.
 *   Acasă    calm home, the island at the top, the demo
 *   Verifică paste / open a file / "it was a call" / who wrote → result sheet
 *   Istoric  every checked conversation this session → tap to reopen
 *   Juriu    the results dashboard (index.html#rezultate)
 * A scam arriving in the background (the demo) cascades the island into the cat's reasons;
 * a check the person starts opens the result sheet directly. Sheets close with ✕, a swipe down,
 * or the phone's back gesture. Nothing is stored after the page closes.
 * A web page can't read SMS or WhatsApp in the background: that needs a native app.
 */
(function () {
  'use strict';
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
  var S = window.ScamShield, A = window.SSAnalyzer, W = window.SSWarnings, P = window.SSParse;
  var CHANNELS = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'E-mail', chat: 'Chat', call_transcript: 'Apel' };
  var WORD = { SAFE: 'În regulă', SUSPICIOUS: 'Atenție', SCAM: 'Țeapă' };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var canPaste = !!(window.isSecureContext && navigator.clipboard && navigator.clipboard.readText);

  // Validation scenarios from the kit, embedded so the page also works opened from disk.
  var DEMO = [
    { id: 'V03', channel: 'sms', sender: { name: 'BancaDunarea', address: 'BancaDunarea', known_contact: false },
      messages: [{ n: 1, from: 'sender', text: 'Banca Dunărea: Codul de confirmare este 482913. Nu comunicați acest cod nimănui, nici angajaților băncii.' }] },
    { id: 'V09', channel: 'sms', sender: { name: null, address: '+40 7xx xxx 904', known_contact: false },
      messages: [{ n: 1, from: 'sender', text: 'Felicitări! Ați fost ales câștigătorul unui telefon nou la tombola MegaShop. Răspundeți cu DA pentru detalii.' }] },
    { id: 'V04', channel: 'whatsapp', sender: { name: null, address: '+40 7xx xxx 318', known_contact: false },
      messages: [
        { n: 1, from: 'sender', text: 'Bună mami, mi s-a stricat telefonul, ăsta e numărul nou. Salvează-l 😘' },
        { n: 2, from: 'reader', text: 'Cine e?' },
        { n: 3, from: 'sender', text: 'Eu, Andrei, cine să fie 😅' },
        { n: 4, from: 'reader', text: 'A, bine, puiule.' },
        { n: 5, from: 'sender', text: 'Mami, am o problemă, trebuie să plătesc azi o factură și nu-mi merge aplicația. Poți să-mi faci tu un transfer de 1.850 lei? Ți-i dau înapoi mâine.' },
        { n: 6, from: 'sender', text: 'Te rog nu-i spune lui tata, se enervează.' }] },
    { id: 'V01', channel: 'sms', sender: { name: 'BancaDunarea', address: 'BancaDunarea', known_contact: false },
      messages: [{ n: 1, from: 'sender', text: 'Banca Dunărea: Cardul dvs. a fost blocat temporar din motive de securitate. Pentru deblocare, accesați în 24h: bancadunarea-securitate.com' }] }
  ];

  function senderOf(sc) { var s = sc.sender || {}; return [CHANNELS[sc.channel] || sc.channel, s.name || s.address].filter(Boolean).join(' · '); }
  function time(d) { return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }); }

  /* ---------- Read aloud (female Romanian voice when the phone has one), with the spoken reason lit up ---------- */

  function useSpeech(r) {
    var st = useState(false), playing = st[0], setPlaying = st[1];
    var sp = useState(-1), spoken = sp[0], setSpoken = sp[1];
    var ctl = useRef(null);
    useEffect(function () { return function () { if (ctl.current) ctl.current.stop(); }; }, []);
    function stop() { if (ctl.current) ctl.current.stop(); ctl.current = null; setPlaying(false); setSpoken(-1); }
    function toggle() {
      if (!r) return;
      if (playing) { stop(); return; }
      var s = W.speech({ verdict: r.verdict, lines: r.lines, actionLine: r.actionLine, reasons: r.reasons, warning: r.warning });
      var n = (r.reasons || []).length;
      setPlaying(true);
      ctl.current = window.SSVoice.speak(s.text, {
        onProgress: function (ci) { var i = -1; s.marks.forEach(function (m, k) { if (m >= 0 && ci >= m) i = k; }); if (ci >= s.actionAt) i = n; setSpoken(i); },
        onEnd: function () { ctl.current = null; setPlaying(false); setSpoken(-1); }
      });
    }
    return { playing: playing, spoken: spoken, toggle: toggle, stop: stop };
  }

  function PlayIcon(p) {
    return h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': true },
      p.playing ? h('rect', { x: 6, y: 6, width: 12, height: 12, rx: 2, fill: 'currentColor' }) : h('path', { d: 'M8 5.5v13l10.5-6.5z', fill: 'currentColor' }));
  }

  function NavIcon(p) {
    var d = {
      home: 'M4 11.2 12 4l8 7.2V20h-5.2v-5.4H9.2V20H4z',
      check: 'M12 3.2 19.5 6v5.6c0 4.4-3.1 8-7.5 9.2-4.4-1.2-7.5-4.8-7.5-9.2V6zM8.6 12.2l2.4 2.4 4.6-4.8',
      history: 'M12 4.5a7.5 7.5 0 1 1-7.1 5.1M4.5 4.8v4.6h4.6M12 8.2v4.3l2.9 1.8',
      jury: 'M4 5h16v14H4zM4 10h16M10 10v9'
    }[p.name];
    return h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: d }));
  }

  /* ---------- The island ---------- */

  function Island(p) {
    if (!p.alert) {
      return h('div', { className: 'm-island', role: 'status' },
        h(S.Mascot, { mood: p.looking ? 'checking' : 'idle', size: 30 }),
        h('span', { className: 'm-island-name' }, 'Scam Shield'),
        h('span', { className: 'm-island-sub' }, p.looking ? 'verific…' : p.demo ? 'demonstrație' : 'ascult'));
    }
    var item = p.alert, r = item.result, speech = p.speech;
    var reasons = r.reasons || [];
    return h('section', { className: 'm-card', role: 'alertdialog', 'aria-labelledby': 'm-card-title', 'aria-describedby': 'm-reasons', style: { '--n': reasons.length } },
      h('div', { className: 'm-card-head' },
        h(S.VerdictIcon, { verdict: 'SCAM', size: 24 }),
        h('span', { className: 'm-head-text' },
          h('span', { id: 'm-card-title', className: 'm-head-title' }, 'Pare o țeapă!' + (p.demo ? ' (demo)' : '')),
          h('span', { className: 'm-head-sub' }, senderOf(item.scenario))),
        h('button', { className: 'm-x', 'aria-label': 'Am înțeles, închide alerta', onClick: function () { speech.stop(); p.onDismiss(); } }, '×')),
      h('div', { className: 'm-card-body' },
        h('div', { className: 'm-card-top' },
          h('div', { className: 'm-card-cat' }, h(S.Mascot, { mood: 'scam', paws: 'sign', size: 70, className: speech.playing ? 'is-talking' : '' })),
          h('p', { className: 'm-lead' }, 'Iată de ce:')),
        h('ol', { id: 'm-reasons', className: 'm-reasons' }, reasons.map(function (x, i) {
          return h('li', { key: x.code, className: speech.spoken === i ? 'is-spoken' : '', style: { '--i': i } },
            h('span', null, x.text), x.quote ? h('span', { className: 'm-quote' }, '„' + x.quote + '”') : null);
        })),
        h('div', { className: 'm-actions' },
          h('button', { className: 'm-play' + (speech.playing ? ' is-playing' : ''), onClick: speech.toggle, 'aria-pressed': speech.playing },
            h(PlayIcon, { playing: speech.playing }), h('span', null, speech.playing ? 'Oprește' : 'Ascultă')),
          h('button', { className: 'm-more', onClick: function () { speech.stop(); p.onFull(); } }, 'Vezi tot'))));
  }

  /* ---------- The sheet: the full result, for every verdict ---------- */

  function highlighted(text, spans, seen) {
    if (!spans || !spans.length) return text;
    var out = [], pos = 0;
    spans.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (s, i) {
      if (s.start < pos || s.end > text.length) return;
      if (s.start > pos) out.push(text.slice(pos, s.start));
      var first = !seen[s.code]; seen[s.code] = true;
      out.push(h(S.FlagMark, { key: i, code: s.code, tag: first }, text.slice(s.start, s.end)));
      pos = s.end;
    });
    if (pos < text.length) out.push(text.slice(pos));
    return out;
  }

  /* Drag the handle (or the bar) down to close, like a native bottom sheet. */
  function useSwipeDown(onClose) {
    var st = useState(0), dy = st[0], setDy = st[1];
    var start = useRef(null);
    return {
      dy: dy,
      handlers: {
        onPointerDown: function (e) { start.current = e.clientY; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); },
        onPointerMove: function (e) { if (start.current !== null) setDy(Math.max(0, e.clientY - start.current)); },
        onPointerUp: function () { if (start.current !== null && dy > 110) onClose(); setDy(0); start.current = null; },
        onPointerCancel: function () { setDy(0); start.current = null; }
      }
    };
  }

  function Sheet(p) {
    var item = p.item, r = item.result;
    var speech = useSpeech(r);
    var swipe = useSwipeDown(function () { speech.stop(); p.onClose(); });
    var seen = {};
    var tel = r.action && r.action.tel;
    var reasons = r.reasons || [];
    return h('div', { className: 'm-sheet' + (swipe.dy ? ' is-dragging' : ''), role: 'dialog', 'aria-modal': true, 'aria-label': 'Rezultatul verificării', style: swipe.dy ? { transform: 'translateY(' + swipe.dy + 'px)' } : null },
      h('div', Object.assign({ className: 'm-sheet-bar' }, swipe.handlers),
        h('span', { className: 'm-grip', 'aria-hidden': true }),
        h('div', { className: 'm-sheet-row' },
          h('span', { className: 'm-sheet-title' }, senderOf(item.scenario) + ' · ' + time(item.at)),
          h('button', { className: 'm-sheet-close', onClick: function () { speech.stop(); p.onClose(); } }, 'Închide'))),
      h('div', { className: 'm-sheet-body' },
        h(S.VerdictCard, {
          verdict: r.verdict, warning: r.lines || r.warning,
          action: r.action ? { label: r.action.label, detail: r.action.detail } : undefined,
          onAction: tel ? function () { window.location.href = 'tel:' + tel.replace(/\s/g, ''); } : undefined,
          onShare: r.verdict !== 'SAFE' ? function () { window.open('https://wa.me/?text=' + encodeURIComponent(W.shareText(r)), '_blank', 'noopener'); } : undefined
        }),
        h('button', { className: 'm-play m-play-wide' + (speech.playing ? ' is-playing' : ''), onClick: speech.toggle, 'aria-pressed': speech.playing },
          h(PlayIcon, { playing: speech.playing }), h('span', null, speech.playing ? 'Oprește' : 'Ascultă')),
        reasons.length ? h('h2', { className: 'm-h2' }, 'Iată de ce') : null,
        reasons.length ? h('ol', { className: 'm-why' }, reasons.map(function (x, i) {
          return h('li', { key: x.code, className: speech.spoken === i ? 'is-spoken' : '' }, h('span', null, x.text), x.quote ? h('span', { className: 'm-quote' }, '„' + x.quote + '”') : null);
        })) : null,
        h('h2', { className: 'm-h2' }, r.messages.length > 1 ? 'Conversația' : 'Mesajul'),
        h('div', { className: 'ss-thread is-why' }, r.messages.map(function (m) {
          return h(S.MessageBubble, { key: m.n, n: m.n, from: m.from, alert: r.verdict !== 'SAFE' && r.firstAlert === m.n, alertVerdict: r.verdict },
            m.text ? highlighted(m.text, m.spans, seen) : '(mesaj gol)');
        }))));
  }

  /* ---------- Tabs ---------- */

  function Home(p) {
    return h('section', { className: 'm-page m-home' },
      h(S.Mascot, { form: 'full', mood: p.looking ? 'checking' : 'idle', size: 124, className: 'm-home-cat' }),
      h('h1', { className: 'm-home-title' }, 'Sunteți protejat'),
      h('p', { className: 'm-home-text' }, 'Scam Shield vă anunță doar dacă un mesaj pare o țeapă.'),
      p.checked ? h('p', { className: 'm-home-count' }, p.checked === 1 ? '1 mesaj verificat' : p.checked + ' mesaje verificate') : null,
      h('div', { className: 'm-home-actions' },
        h('button', { className: 'm-btn m-btn-primary', onClick: p.onCheck }, 'Verifică un mesaj'),
        h('button', { className: 'm-btn', onClick: p.onDemo, disabled: p.demoRunning }, p.demoRunning ? 'Demonstrația rulează…' : 'Vezi o demonstrație')));
  }

  function Check(p) {
    var tx = useState(''), text = tx[0], setText = tx[1];
    var kn = useState('unknown'), known = kn[0], setKnown = kn[1];
    var md = useState('message'), mode = md[0], setMode = md[1];
    var hn = useState(''), hint = hn[0], setHint = hn[1];
    var fileRef = useRef(null);

    function check() {
      var parsed = P.parsePasted(text, { known: known === 'known', channel: mode === 'call' ? 'call_transcript' : null });
      if (!parsed) { setHint('Lipiți mai întâi un mesaj în căsuța de mai sus.'); return; }
      setHint('');
      p.onRun(parsed.scenario).then(function () { setText(''); });
    }
    function paste() {
      navigator.clipboard.readText().then(function (t) { if (t && t.trim()) { setText(t); setHint(''); } else setHint('Nu aveți nimic copiat. Copiați întâi mesajul.'); })
        .catch(function () { setHint('Țineți apăsat în căsuță și alegeți „Lipește”.'); });
    }
    function openFile(f) {
      if (!f) return;
      P.readScenarioFile(f).then(function (sc) { p.onRun(sc); }).catch(function (e) { setHint('Fișierul nu poate fi citit: ' + e.message + '.'); });
    }

    return h('section', { className: 'm-page m-check' },
      h('input', { type: 'file', accept: '.json,application/json', ref: fileRef, hidden: true, onChange: function (e) { openFile(e.target.files[0]); e.target.value = ''; } }),
      h(S.CheckIsland, {
        state: 'idle', id: 'm-message', value: text,
        onChange: function (e) { setText(e.target.value); if (hint) setHint(''); },
        onCheck: check, onPaste: canPaste ? paste : undefined,
        label: mode === 'call' ? 'Ce vi s-a spus la telefon?' : 'Ați primit un mesaj ciudat?',
        placeholder: mode === 'call' ? 'Scrieți cu cuvintele dumneavoastră ce v-a cerut persoana…' : 'Țineți apăsat aici și alegeți „Lipește”…'
      }),
      hint ? h('div', { className: 'm-hint', role: 'alert' }, h(S.Mascot, { mood: 'suspicious', size: 40 }), h('p', null, hint)) : null,
      h(S.SourceOptions, {
        options: [{ id: 'file', icon: 'file', label: 'Deschide un fișier' }, { id: 'call', icon: 'call', label: mode === 'call' ? 'A fost un mesaj scris' : 'A fost un apel' }],
        onSelect: function (id) { if (id === 'file') fileRef.current.click(); if (id === 'call') setMode(mode === 'call' ? 'message' : 'call'); }
      }),
      h(S.SenderChoice, { value: known, onChange: setKnown }));
  }

  function History(p) {
    if (!p.items.length) {
      return h('section', { className: 'm-page m-empty' },
        h(S.Mascot, { form: 'full', mood: 'sleeping', size: 112 }),
        h('h1', { className: 'm-home-title' }, 'Nimic încă'),
        h('p', { className: 'm-home-text' }, 'Mesajele verificate apar aici. Nu le păstrăm după ce închideți pagina.'));
    }
    return h('section', { className: 'm-page m-history' },
      h('h1', { className: 'm-page-title' }, 'Istoric'),
      h('ul', { className: 'm-list' }, p.items.map(function (it) {
        var last = it.result.messages.filter(function (m) { return m.from === 'sender'; }).slice(-1)[0];
        return h('li', { key: it.id }, h('button', { className: 'm-row', onClick: function () { p.onOpen(it); } },
          h('span', { className: 'm-row-top' }, h(S.VerdictBadge, { verdict: it.result.verdict, label: WORD[it.result.verdict] }), h('span', { className: 'm-row-time' }, time(it.at))),
          h('span', { className: 'm-row-who' }, senderOf(it.scenario)),
          last ? h('span', { className: 'm-row-text' }, last.text) : null));
      })),
      h('button', { className: 'm-btn m-btn-quiet', onClick: p.onClear }, 'Șterge istoricul'));
  }

  var TABS = [['home', 'Acasă'], ['check', 'Verifică'], ['history', 'Istoric'], ['jury', 'Juriu']];
  function Nav(p) {
    return h('nav', { className: 'm-nav', 'aria-label': 'Secțiuni' }, TABS.map(function (t) {
      var on = p.tab === t[0];
      var props = { key: t[0], className: 'm-nav-item' + (on ? ' is-on' : ''), 'aria-current': on ? 'page' : undefined };
      if (t[0] === 'jury') return h('a', Object.assign(props, { href: 'index.html#rezultate' }), h(NavIcon, { name: 'jury' }), h('span', null, t[1]));
      return h('button', Object.assign(props, { onClick: function () { p.onTab(t[0]); } }),
        h(NavIcon, { name: t[0] }), h('span', null, t[1]),
        t[0] === 'history' && p.count ? h('span', { className: 'm-nav-count' }, p.count) : null);
    }));
  }

  /* ---------- App ---------- */

  function App() {
    var tb = useState('home'), tab = tb[0], setTab = tb[1];
    var al = useState(null), alert = al[0], setAlert = al[1];
    var sh = useState(null), sheet = sh[0], setSheet = sh[1];
    var hs = useState([]), history = hs[0], setHistory = hs[1];
    var ck = useState(0), checked = ck[0], setChecked = ck[1];
    var lk = useState(false), looking = lk[0], setLooking = lk[1];
    var dm = useState(false), demoRunning = dm[0], setDemoRunning = dm[1];
    var release = useRef(null);
    var speech = useSpeech(alert && alert.result);

    function record(result, scenario) {
      var item = { id: scenario.id + '-' + Date.now(), at: new Date(), result: result, scenario: scenario };
      setHistory(function (hs) { return [item].concat(hs.filter(function (x) { return x.scenario !== scenario; })).slice(0, 50); });
      return item;
    }

    // Sheets take a history entry, so the phone's back gesture closes them instead of leaving the page.
    function openSheet(item) { setSheet(item); if (!(window.history.state && window.history.state.ssSheet)) window.history.pushState({ ssSheet: true }, ''); }
    function closeSheet() { if (window.history.state && window.history.state.ssSheet) window.history.back(); else setSheet(null); }
    useEffect(function () {
      function onPop() { setSheet(null); }
      window.addEventListener('popstate', onPop);
      return function () { window.removeEventListener('popstate', onPop); };
    }, []);
    useEffect(function () { if (!sheet && release.current) { release.current(); release.current = null; } }, [sheet]);

    function finishAlert() { setAlert(null); if (!sheet && release.current) { release.current(); release.current = null; } }

    /* A check the person starts: the island looks, then the result sheet opens for any verdict. */
    function runCheck(scenario) {
      setLooking(true);
      var t0 = Date.now();
      return A.analyze(scenario).then(function (r) {
        return wait(Math.max(0, 700 - (Date.now() - t0))).then(function () {
          setLooking(false); setChecked(function (c) { return c + 1; });
          openSheet(record(r, scenario));
        });
      });
    }

    /* The demo: messages arrive one by one; only a scam interrupts, by cascading the island. */
    function runDemo() {
      if (demoRunning) return;
      setDemoRunning(true); setTab('home');
      (async function () {
        await wait(900);
        for (var d = 0; d < DEMO.length; d++) {
          var sc = DEMO[d], last = null, partial = null;
          for (var i = 0; i < sc.messages.length; i++) {
            partial = Object.assign({}, sc, { messages: sc.messages.slice(0, i + 1) });
            setLooking(true);
            last = await A.analyze(partial);
            setChecked(function (c) { return c + 1; });
            await wait(900); setLooking(false);
            if (last.verdict === 'SCAM') break; // the alert fires at the right message, not at the end
            await wait(sc.messages.length > 1 ? 1100 : 600);
          }
          var item = record(last, partial);
          if (last.verdict === 'SCAM') {
            if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
            setAlert(item);
            await new Promise(function (r) { release.current = r; });
            await wait(700);
          }
          await wait(1200);
        }
        setDemoRunning(false);
      })();
    }

    var page = tab === 'check' ? h(Check, { onRun: runCheck })
      : tab === 'history' ? h(History, { items: history, onOpen: openSheet, onClear: function () { setHistory([]); } })
      : h(Home, { checked: checked, looking: looking, onDemo: runDemo, demoRunning: demoRunning, onCheck: function () { setTab('check'); } });

    return h(React.Fragment, null,
      h('main', { className: 'm-main' + (alert ? ' is-dim' : ''), 'aria-hidden': alert ? true : undefined }, page),
      h(Nav, { tab: tab, onTab: setTab, count: history.length }),
      alert ? h('div', { className: 'm-backdrop', 'aria-hidden': true }) : null,
      h('div', { className: 'm-island-slot' },
        h(Island, { key: alert ? alert.id : 'idle', alert: alert, looking: looking, demo: demoRunning, speech: speech,
          onDismiss: finishAlert, onFull: function () { var it = alert; setAlert(null); openSheet(it); } })),
      sheet ? h(Sheet, { key: sheet.id, item: sheet, onClose: closeSheet }) : null);
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
