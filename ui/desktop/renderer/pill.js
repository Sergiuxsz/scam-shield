/*
 * The floating island.
 *   listening → a small pill; the cat sits calmly and slow-blinks.
 *   a message arrives → her eyes follow it for a moment (nothing to read).
 *   a scam → the pill lights up and cascades down into a card: the cat, holding the stop sign,
 *            gives up to three short reasons one by one, then ▶ Ascultă and Vezi tot.
 * Safe and suspicious messages never light it up.
 */
(function () {
  'use strict';
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
  var S = window.ScamShield;
  var CHANNELS = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'e-mail', chat: 'chat', call_transcript: 'apel' };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function senderLabel(item) {
    var s = item.sender || {};
    return [CHANNELS[item.channel] || item.channel, s.name || s.address].filter(Boolean).join(' · ');
  }

  /* The cat says the warning lines (warnings_ro); the reasons she shows light up when they are spoken. */
  function buildSpeech(r) {
    var lines = r.warning_lines && r.warning_lines.length ? r.warning_lines : [r.warning || ''];
    var text = '', starts = [];
    lines.forEach(function (l) { if (text) text += ' '; starts.push(text.length); text += l; });
    // clause = the words used for this reason inside the 3-sentence warning (null if not spoken)
    var marks = (r.reasons || []).map(function (x) { return x.clause ? text.indexOf(x.clause) : -1; });
    var al = r.action_line != null ? Math.min(r.action_line, starts.length - 1) : starts.length - 1;
    return { text: text, marks: marks, todoAt: starts[al] != null ? starts[al] : text.length };
  }

  function chime() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [660, 0.18]].forEach(function (t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = t[0];
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t[1]);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t[1] + 0.32);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t[1]); o.stop(ctx.currentTime + t[1] + 0.35);
      });
      setTimeout(function () { ctx.close(); }, 1000);
    } catch (e) { /* no audio device */ }
  }
  /* Plays the alert sound and resolves when it has finished (alert.mp3, or the built-in chime). */
  function playAlertSound() {
    return new Promise(function (resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      var a = new Audio('alert.mp3');
      a.volume = 0.8;
      a.addEventListener('ended', finish);
      a.play().catch(function () { chime(); setTimeout(finish, 650); });
      setTimeout(finish, 4000); // never wait longer than this
    });
  }

  function PlayIcon(p) {
    return h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': true },
      p.playing ? h('rect', { x: 6, y: 6, width: 12, height: 12, rx: 2, fill: 'currentColor' }) : h('path', { d: 'M8 5.5v13l10.5-6.5z', fill: 'currentColor' }));
  }

  function PhoneIcon() {
    return h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': true },
      h('path', { d: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z', fill: 'currentColor' }));
  }

  /*
   * The alert card, in the order an older reader needs it:
   *   1. WHAT TO DO   the one action, large, first (this is what protects them)
   *   2. WHY          the reasons, one at a time, with the words from the message
   *   3. BUTTONS      call the official number (when there is one), listen, see everything
   * Several alerts queue up (oldest first): "1 din 3" and "Următoarea" instead of replacing the card.
   */
  function AlertIsland(p) {
    var item = p.item, r = item.result;
    var st = useState(false), playing = st[0], setPlaying = st[1];
    var sp = useState(-1), spoken = sp[0], setSpoken = sp[1]; // reason being spoken; reasons.length = the action
    var voice = useRef(null);
    var reasons = r.reasons || [];
    var lines = r.warning_lines || [];
    var actionAt = r.action_line != null ? Math.min(r.action_line, lines.length - 1) : lines.length - 1;
    var actionText = lines[actionAt] || '';
    var speech = buildSpeech(r);

    useEffect(function () {
      window.ShieldVoice.prepare(speech.text);
      return function () { if (voice.current) voice.current.stop(); };
    }, [speech.text]);

    // Narration starts by itself once the card has opened (the sound already played before it opened).
    useEffect(function () {
      if (!p.autoSpeak) return undefined;
      var t = setTimeout(function () { if (!voice.current) play(); }, 1100);
      return function () { clearTimeout(t); };
    }, []);

    function stop() { if (voice.current) voice.current.stop(); voice.current = null; setPlaying(false); setSpoken(-1); }
    function play() {
      if (playing) { stop(); return; }
      var s = speech;
      setPlaying(true);
      voice.current = window.ShieldVoice.play(s.text, {
        onProgress: function (charIndex) {
          var i = -1;
          s.marks.forEach(function (m, k) { if (m >= 0 && charIndex >= m) i = k; });
          if (charIndex >= s.todoAt) i = reasons.length;
          setSpoken(i);
        },
        onEnd: function () { voice.current = null; setPlaying(false); setSpoken(-1); }
      });
    }
    function next() { stop(); window.shield.dismiss(item.id); }

    var queue = p.total > 1 ? h('span', { className: 'alert-queue', 'aria-label': 'alerta ' + p.index + ' din ' + p.total }, p.index + ' din ' + p.total) : null;
    return h('section', { className: 'island is-open', role: 'alertdialog', 'aria-labelledby': 'island-title', 'aria-describedby': 'island-action', style: { '--n': reasons.length } },
      h('header', { className: 'island-head' },
        h(S.VerdictIcon, { verdict: 'SCAM', size: 26 }),
        h('span', { className: 'alert-text' },
          h('span', { id: 'island-title', className: 'alert-title' }, 'Pare o țeapă' + (p.demo ? ' · demonstrație' : '')),
          h('span', { className: 'alert-sub' }, senderLabel(item))),
        queue,
        h('button', { className: 'alert-x', 'aria-label': 'Am înțeles, închide alerta', title: 'Închide alerta', onClick: next }, '×')),
      h('div', { className: 'island-body' },
        h('div', { className: 'do-row' },
          h('div', { className: 'island-cat' },
            h(S.Mascot, { mood: 'scam', paws: 'sign', size: 84, className: playing ? 'is-talking' : '' })),
          h('div', { className: 'step step-do' + (spoken === reasons.length ? ' is-spoken' : '') },
            h('span', { className: 'step-label' }, 'Ce să faceți acum'),
            h('p', { id: 'island-action', className: 'do-text' }, actionText))),
        reasons.length ? h('div', { className: 'step step-why' },
          h('span', { className: 'step-label' }, 'De ce'),
          h('ol', { id: 'island-reasons', className: 'reasons' }, reasons.map(function (x, i) {
            return h('li', { key: x.code, className: spoken === i ? 'is-spoken' : '', style: { '--i': i } },
              h('span', { className: 'reason-text' }, x.text),
              x.quote ? h('span', { className: 'quote' }, '„' + x.quote + '”') : null);
          }))) : null,
        h('div', { className: 'island-actions' },
          r.action && r.action.tel ? h('button', { className: 'btn btn-call', onClick: function () { window.shield.call(r.action.tel); } },
            h(PhoneIcon), h('span', null, r.action.label)) : null,
          h('button', { className: 'btn btn-play' + (playing ? ' is-playing' : ''), onClick: play, 'aria-pressed': playing, autoFocus: !reduceMotion },
            h(PlayIcon, { playing: playing }), h('span', null, playing ? 'Oprește' : 'Ascultă')),
          h('button', { className: 'btn btn-more', onClick: function () { stop(); window.shield.openFull(item.id); } }, 'Vezi tot'),
          p.total > 1 ? h('button', { className: 'btn btn-next', onClick: next }, 'Următoarea →') : null)));
  }

  function Island() {
    var st = useState(null), snap = st[0], setSnap = st[1];
    var tk = useState(0), setTick = tk[1];
    var rv = useState(null), revealed = rv[0], setRevealed = rv[1]; // id of the alert whose card may open
    useEffect(function () { window.shield.onState(setSnap); }, []);

    // Queue: the OLDEST unseen alert first, so a new scam never replaces one that is being read.
    var unseen = snap ? snap.history.filter(function (i) { return !i.seen && i.result.verdict === 'SCAM'; })
      .sort(function (x, y) { return (x.alertAt || 0) - (y.alertAt || 0); }) : [];
    var first = unseen[0] || null;
    // Alert sequence: 1. the sound plays while the pill pulses red, 2. then the card opens, 3. then it narrates.
    useEffect(function () {
      if (!first || first.id === revealed) return undefined;
      var cancelled = false;
      playAlertSound().then(function () { if (!cancelled) setRevealed(first.id); });
      return function () { cancelled = true; };
    }, [first && first.id]);
    useEffect(function () {
      if (!snap || !snap.activity) return undefined;
      var t = setTimeout(function () { setTick(Date.now()); }, 1600);
      return function () { clearTimeout(t); };
    }, [snap && snap.activity && snap.activity.at]);

    if (!snap || snap.status === 'starting') {
      return h('div', { className: 'pill', role: 'status' },
        h(S.Mascot, { mood: 'sleeping', size: 34 }), h('span', { className: 'pill-name' }, 'Scam Shield'), h('span', { className: 'pill-sub' }, 'pornește…'));
    }
    if (snap.status === 'error') {
      return h('button', { className: 'pill is-error', onClick: window.shield.togglePane },
        h(S.Mascot, { mood: 'suspicious', size: 34 }), h('span', null, snap.error));
    }
    if (first && first.id === revealed) {
      return h(AlertIsland, { key: first.id, item: first, index: 1, total: unseen.length, demo: snap.demo, autoSpeak: snap.autoSpeak !== false });
    }
    if (first) { // the sound is playing: the pill pulses red, the card opens right after
      return h('div', { className: 'pill is-alerting', role: 'alert', 'aria-label': 'Alertă: pare o țeapă' },
        h(S.Mascot, { mood: 'scam', size: 34 }), h('span', { className: 'pill-name' }, 'Scam Shield'));
    }

    var a = snap.activity;
    var looking = a && a.kind === 'checking' && Date.now() - a.at < 1500;
    // Resting pill: just the name. A soft pulse while a message is being checked; details live in the pane.
    return h('button', { className: 'pill' + (looking ? ' is-checking' : ''), onClick: window.shield.togglePane, title: 'Deschide Scam Shield', 'aria-label': 'Scam Shield' + (snap.demo ? ' (demonstrație)' : '') },
      h(S.Mascot, { mood: looking ? 'checking' : 'idle', size: 34 }),
      h('span', { className: 'pill-name' }, 'Scam Shield'));
  }

  /* The window is transparent and larger than the island: clicks pass through everywhere except the island. */
  function Stage() {
    return h('div', {
      className: 'stage',
      onMouseOver: function (e) { window.shield.pillHover(!!e.target.closest('.pill, .island')); },
      onMouseLeave: function () { window.shield.pillHover(false); }
    }, h(Island));
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(Stage));
})();
