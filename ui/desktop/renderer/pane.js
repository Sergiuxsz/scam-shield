/* The floating pane: the alert, the history of checked conversations, and how to connect a provider. */
(function () {
  'use strict';
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect;
  var S = window.ScamShield;
  var CHANNELS = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'E-mail', chat: 'Chat', call_transcript: 'Apel telefonic' };

  function time(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }
  function who(item) {
    var s = item.sender || {};
    return s.name || s.address || 'Expeditor necunoscut';
  }

  /* The design system's result shape uses the web app's field names. */
  function asResult(item) {
    var r = item.result;
    return {
      verdict: r.verdict, firstAlert: r.first_alert, score: r.risk_score, flags: r.red_flags,
      messages: r.messages.map(function (m) { return { n: m.n, from: m.from, text: m.text, spans: m.spans || [] }; })
    };
  }

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

  function ReadAloud(p) {
    var st = useState(false), on = st[0], setOn = st[1];
    var ctl = React.useRef(null);
    useEffect(function () { window.ShieldVoice.prepare(p.text); return function () { if (ctl.current) ctl.current.stop(); }; }, [p.text]);
    function toggle() {
      if (on) { if (ctl.current) ctl.current.stop(); setOn(false); return; }
      setOn(true);
      ctl.current = window.ShieldVoice.play(p.text, { onProgress: function () {}, onEnd: function () { setOn(false); } });
    }
    return h(S.Button, { variant: 'secondary', size: 'md', onClick: toggle, 'aria-pressed': on }, on ? 'Opriți citirea' : 'Citește cu voce tare');
  }

  function AlertView(p) {
    var item = p.item;
    var wy = useState(!!p.full), why = wy[0], setWhy = wy[1];
    useEffect(function () { setWhy(!!p.full); }, [item && item.id, p.full]);
    if (!item) {
      return h('div', { className: 'empty' },
        h(S.Mascot, { form: 'full', mood: 'idle', size: 112, className: 'empty-cat' }),
        h('p', { className: 'empty-title' }, 'Nicio alertă'),
        h('p', null, 'Scam Shield ascultă în fundal. Vă anunțăm doar dacă un mesaj pare o țeapă.'));
    }
    var r = item.result;
    var res = asResult(item);
    var action = r.action;
    var tel = action && action.tel ? action.tel : null;
    var speech = window.SSWarnings.speech({ verdict: r.verdict, lines: r.warning_lines, actionLine: r.action_line, reasons: r.reasons, warning: r.warning }).text;
    var reasons = r.reasons || [];
    var main = h('div', { className: 'col-main' },
      h('p', { className: 'meta' }, (CHANNELS[item.channel] || item.channel) + ' · ' + who(item) + ' · ' + time(item.at) + (item.n > 1 ? ' · ' + item.n + ' mesaje' : '')),
      h(S.VerdictCard, {
        verdict: r.verdict, warning: (r.warning_lines && r.warning_lines.length) ? r.warning_lines : r.warning,
        action: action ? { label: action.label, detail: action.detail || undefined } : undefined,
        onAction: tel ? function () { window.shield.call(tel); } : undefined,
        onWhy: p.full ? undefined : function () { setWhy(!why); },
        onShare: r.verdict !== 'SAFE' ? function () { window.shield.share(window.SSWarnings.shareText({ verdict: r.verdict })); } : undefined
      }),
      h('div', { className: 'tools' }, h(ReadAloud, { text: speech })),
      reasons.length ? h('section', { className: 'why-list', 'aria-label': 'De ce' },
        h('h2', { className: 'section-title' }, 'Iată de ce'),
        h('ol', { className: 'why-items' }, reasons.map(function (x) {
          return h('li', { key: x.code }, h('span', null, x.text), x.quote ? h('span', { className: 'why-quote' }, '„' + x.quote + '”') : null);
        }))) : null);
    var seen = {};
    var thread = h('div', { className: 'col-thread' },
      h('h2', { className: 'section-title' }, why ? 'Mesajul, cu cuvintele periculoase marcate' : 'Mesajul'),
      h('div', { className: 'ss-thread' + (why ? ' is-why' : '') }, res.messages.map(function (m) {
        return h(S.MessageBubble, { key: m.n, n: m.n, from: m.from, alert: r.verdict !== 'SAFE' && res.firstAlert === m.n, alertVerdict: r.verdict },
          m.text ? highlighted(m.text, m.spans, why, seen) : '(mesaj gol)');
      })));
    return h('div', { className: 'alert-view' + (p.full ? ' is-full' : '') }, main, thread);
  }

  function HistoryView(p) {
    if (!p.items.length) return h('div', { className: 'empty' }, h(S.Mascot, { form: 'full', mood: 'sleeping', size: 112, className: 'empty-cat' }), h('p', { className: 'empty-title' },'Încă nu am verificat niciun mesaj'), h('p', null, 'Mesajele primite apar aici. Nu le păstrăm după ce închideți Scam Shield.'));
    return h(React.Fragment, null,
      h('ul', { className: 'list' }, p.items.map(function (it) {
        var last = it.result.messages.filter(function (m) { return m.from === 'sender'; }).slice(-1)[0];
        return h('li', { key: it.id }, h('button', {
          className: 'item' + (it.id === p.selectedId ? ' is-selected' : '') + (!it.seen && it.result.verdict === 'SCAM' ? ' is-unseen' : ''),
          onClick: function () { p.onOpen(it.id); }
        },
          h(S.VerdictBadge, { verdict: it.result.verdict, label: { SAFE: 'În regulă', SUSPICIOUS: 'Atenție', SCAM: 'Țeapă' }[it.result.verdict] }),
          h('span', { className: 'item-who' }, (CHANNELS[it.channel] || it.channel) + ' · ' + who(it) + ' · ' + time(it.at)),
          h('span', { className: 'item-text' }, last ? last.text : '')));
      })),
      h('div', { className: 'tools' }, h(S.Button, { variant: 'quiet', size: 'md', onClick: window.shield.clearHistory }, 'Șterge istoricul')));
  }

  function ConnectView() {
    var st = useState(null), info = st[0], setInfo = st[1];
    var sh = useState(false), show = sh[0], setShow = sh[1];
    var vc = useState(null), voice = vc[0], setVoice = vc[1];
    useEffect(function () { window.shield.integration().then(setInfo); }, []);
    // The read-aloud needs a Romanian voice; an English one reading Romanian is not understandable.
    useEffect(function () {
      // First choice: the Windows Romanian voice through the system speech API.
      window.shield.tts('Bună ziua.').then(function (r) {
        if (r && r.url) { setVoice({ ok: true, name: r.voice, female: r.female }); return; }
        var v = window.SSVoice.pick();
        setVoice({ ok: !!v, name: v ? v.name : null, female: window.SSVoice.isFemale(v) });
      });
    }, []);
    if (!info) return null;
    var curl = 'curl -X POST ' + info.url + '/v1/messages \\\n  -H "Authorization: Bearer ' + (show ? info.token : '<token>') + '" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"channel":"sms","thread_id":"abc","sender":{"address":"+40 7xx xxx 552"},"text":"Achitati taxa de 2,99 lei: curierexpres-livrare.info"}\'';
    return h('div', { className: 'dev' },
      h('p', { className: 'meta' }, 'For developers: any SMS gateway, mail hook, WhatsApp bot or chat app can send messages to this port. Only programs on this computer can reach it.'),
      h('div', { className: 'dev-row' }, h('span', { className: 'dev-label' }, 'Endpoint'),
        h('div', { className: 'dev-value' }, h('code', { className: 'val' }, 'POST ' + info.url + '/v1/messages'))),
      h('div', { className: 'dev-row' }, h('span', { className: 'dev-label' }, 'Token'),
        h('div', { className: 'dev-value' },
          h('code', { className: 'val' }, show ? info.token : '••••••••••••••••'),
          h(S.Button, { variant: 'secondary', size: 'md', onClick: function () { setShow(!show); } }, show ? 'Hide' : 'Show'),
          h(S.Button, { variant: 'secondary', size: 'md', onClick: function () { window.shield.copy(info.token); } }, 'Copy'))),
      h('div', { className: 'dev-row' }, h('span', { className: 'dev-label' }, 'Example'), h('pre', null, curl)),
      voice ? h('div', { className: 'dev-row' }, h('span', { className: 'dev-label' }, 'Romanian voice for "Ascultă"'),
        h('p', { className: 'meta' }, !voice.ok
          ? 'Missing. Install it in Windows: Settings › Time & language › Speech › Add voices › Romanian. Without it, "Ascultă" reads Romanian with an English voice.'
          : voice.female
            ? 'Using ' + voice.name + ' (female).'
            : 'Using ' + voice.name + ' (male): Windows has no female Romanian voice. For the female voice "Alina", set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (Azure Speech, free tier) and restart.')) : null,
      h('p', { className: 'meta' }, 'Messages with the same thread_id are one conversation. The answer includes verdict, scam_type, risk_score, first_alert, red_flags, warning and action. Full reference: desktop/README.md.'),
      h('div', { className: 'danger' }, h(S.Button, { variant: 'secondary', size: 'md', onClick: window.shield.quit }, 'Stop Scam Shield')));
  }

  function Pane() {
    var st = useState(null), snap = st[0], setSnap = st[1];
    var tb = useState('alert'), tab = tb[0], setTab = tb[1];
    useEffect(function () { window.shield.onState(setSnap); }, []);
    function Icon(p) {
      return h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true },
        h('path', { d: p.d, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }
    // A new alert always brings the pane back to the alert tab.
    var selected = snap && snap.history.filter(function (i) { return i.id === snap.selectedId; })[0];
    useEffect(function () { if (selected && !selected.seen) setTab('alert'); }, [selected && selected.id, selected && selected.seen]);
    if (!snap) return null;

    var listening = snap.status === 'listening';
    var alertItem = selected || null;
    var full = !!snap.paneFull;
    var bar = h('div', { className: 'bar' },
      h('div', { className: 'bar-title' },
        h('span', { className: 'bar-name' }, 'Scam Shield'),
        h('span', { className: 'bar-status' }, h('span', { className: 'dot' + (listening ? '' : ' is-off') }), listening ? (snap.demo ? 'Demonstrație cu mesaje de test · ' : 'Ascult în fundal · ') + snap.checked + ' verificate' : (snap.error || 'Pornește…'))),
      h('div', { className: 'win-btns' },
        h('button', { className: 'win-btn', onClick: window.shield.hidePane, title: 'Minimizează (Scam Shield continuă să asculte)', 'aria-label': 'Minimizează' }, h(Icon, { d: 'M5 12h14' })),
        h('button', { className: 'win-btn', onClick: full ? window.shield.restorePane : function () { window.shield.openFull(snap.selectedId); },
          title: full ? 'Fereastră mică' : 'Ecran complet', 'aria-label': full ? 'Fereastră mică' : 'Ecran complet' },
          h(Icon, { d: full ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' })),
        h('button', { className: 'win-btn is-close', onClick: window.shield.hidePane, title: 'Închide fereastra (Scam Shield continuă să asculte)', 'aria-label': 'Închide' }, h(Icon, { d: 'M6 6l12 12M18 6 6 18' }))));

    // Full screen: one alert, nothing else to choose. No tabs, no history.
    if (full) {
      return h('div', { className: 'pane is-full' }, bar,
        h('div', { className: 'body' }, h(AlertView, { item: alertItem, full: true })));
    }

    return h('div', { className: 'pane' }, bar,
      h('div', { className: 'tabs', role: 'tablist' },
        h('button', { role: 'tab', 'aria-selected': tab === 'alert', className: 'tab' + (tab === 'alert' ? ' is-on' : ''), onClick: function () { setTab('alert'); } }, 'Alertă'),
        h('button', { role: 'tab', 'aria-selected': tab === 'history', className: 'tab' + (tab === 'history' ? ' is-on' : ''), onClick: function () { setTab('history'); } }, 'Istoric', snap.history.length ? h('span', { className: 'tab-count' }, snap.history.length) : null),
        h('button', { role: 'tab', 'aria-selected': tab === 'connect', className: 'tab' + (tab === 'connect' ? ' is-on' : ''), onClick: function () { setTab('connect'); } }, 'Integrare')),
      h('div', { className: 'body', role: 'tabpanel' },
        tab === 'alert' ? h(AlertView, { item: alertItem }) :
        tab === 'history' ? h(HistoryView, { items: snap.history, selectedId: snap.selectedId, onOpen: function (id) { window.shield.select(id); setTab('alert'); } }) :
        h(ConnectView)));
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(Pane));
})();
