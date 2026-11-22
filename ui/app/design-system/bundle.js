/* @ds-bundle: {"format":4,"namespace":"ScamShield","components":[{"name":"Mascot"},{"name":"CheckIsland"},{"name":"SourceOptions"},{"name":"SenderChoice"},{"name":"Button"},{"name":"VerdictCard"},{"name":"VerdictBadge"},{"name":"VerdictIcon"},{"name":"MessageBubble"},{"name":"FlagMark"},{"name":"RiskMeter"},{"name":"ResultsSummary"},{"name":"ResultsTable"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }
  function omit(obj, keys) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) out[k] = obj[k];
    return out;
  }

  var VERDICTS = {
    SAFE: { word: 'SAFE', title: 'Pare în regulă', short: 'În regulă', tone: 'safe' },
    SUSPICIOUS: { word: 'SUSPICIOUS', title: 'Atenție, verificați înainte să răspundeți', short: 'Atenție', tone: 'caution' },
    SCAM: { word: 'SCAM', title: 'Pare o țeapă! Nu răspundeți', short: 'Țeapă', tone: 'scam' }
  };
  function verdictOf(v) { return VERDICTS[v] || VERDICTS.SAFE; }

  // The warnings_ro wording (app/tools/warnings_ro.py, REASONS), short enough to sit inline after the
  // marked phrase. The long or variable ones keep the start of the same sentence.
  var FLAG_LABELS = {
    RF_CODE_REQUEST: 'Vi se cere un cod primit prin SMS',
    RF_REMOTE_ACCESS: 'Vi se cere să instalați un program',
    RF_DATA_REQUEST: 'Vi se cer datele cardului sau date personale',
    RF_PAYMENT_REQUEST: 'Vi se cer bani',
    RF_SUSPICIOUS_CONTACT: 'Nu este cel oficial',
    RF_NEW_NUMBER: 'Cineva spune că e o rudă sau un prieten cu număr nou',
    RF_SECRECY: 'Vi se cere să nu spuneți nimănui',
    RF_TOO_GOOD: 'Vi se promite un câștig neașteptat',
    RF_IMPERSONATION: 'Pretinde că vine de la altcineva',
    RF_URGENCY: 'Vă grăbește',
    RF_THREAT: 'Vă sperie cu blocarea contului sau cu amenzi',
    RF_EMOTIONAL_PRESSURE: 'Încearcă să vă emoționeze',
    RF_CHANNEL_SWITCH: 'Vă cere să mutați discuția în altă aplicație'
  };

  function path(d) { return { t: 'path', d: d }; }
  function dot(cx_, cy) { return { t: 'circle', cx: cx_, cy: cy, r: 1.3, fill: true }; }
  function circle(cx_, cy, r) { return { t: 'circle', cx: cx_, cy: cy, r: r }; }

  var ICONS = {
    SAFE: [circle(12, 12, 9.5), path('M7.5 12.4l3 3 6-6.3')],
    SUSPICIOUS: [path('M12 3.2L21.6 19.8H2.4z'), path('M12 9.5v4.6'), dot(12, 16.9)],
    SCAM: [path('M8.1 2.6h7.8l5.5 5.5v7.8l-5.5 5.5H8.1l-5.5-5.5V8.1z'), path('M12 7.4v5.6'), dot(12, 16.3)],
    check: [path('M5 12.5l4.5 4.5L19 7.5')],
    photo: [path('M3.5 8h3.2l1.8-2.7h7l1.8 2.7h3.2v11.2h-17z'), circle(12, 13.3, 3.4)],
    file: [path('M6 3h8.2L18.5 7.3V21H6z'), path('M14 3v4.5h4.5')],
    call: [path('M5.2 3.8h3.6l1.8 4.6-2.3 1.4a11.5 11.5 0 0 0 5.9 5.9l1.4-2.3 4.6 1.8v3.6a1.4 1.4 0 0 1-1.5 1.4C10.4 19.6 4.4 13.6 3.8 5.3a1.4 1.4 0 0 1 1.4-1.5z')],
    paste: [path('M9 3.5h6v3H9z'), path('M7.2 5H5v15.5h14V5h-2.2'), path('M8.5 11h7M8.5 15h5')],
    reset: [path('M4.5 12a7.5 7.5 0 1 0 2.3-5.4'), path('M4.5 3.8v4.6h4.6')],
    person: [circle(12, 8, 3.8), path('M4.5 20.5a7.5 7.5 0 0 1 15 0')],
    why: [circle(12, 12, 9.5), path('M12 11v5.6'), dot(12, 7.6)]
  };

  function drawIcon(name, size, className) {
    var parts = ICONS[name] || [];
    var kids = parts.map(function (p, i) {
      if (p.t === 'path') return h('path', { key: i, d: p.d });
      return h('circle', { key: i, cx: p.cx, cy: p.cy, r: p.r, fill: p.fill ? 'currentColor' : 'none', stroke: p.fill ? 'none' : 'currentColor' });
    });
    return h('svg', {
      className: className || 'ss-icon', viewBox: '0 0 24 24', width: size, height: size,
      fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': true, focusable: 'false'
    }, kids);
  }

  function Icon(p) { return drawIcon(p.name, p.size || 24, cx('ss-icon', p.className)); }

  function VerdictIcon(p) {
    var name = VERDICTS[p.verdict] ? p.verdict : 'SAFE';
    return drawIcon(name, p.size || 24, cx('ss-vicon', p.className));
  }

  /* ---------- The cat: the recurring character of every output moment ---------- */

  var MOODS = { SAFE: 'safe', SUSPICIOUS: 'suspicious', SCAM: 'scam' };
  function moodFor(verdict) { return MOODS[verdict] || 'idle'; }

  function catEye(cx_, key, mood) {
    if (mood === 'idle') {
      // Relaxed, half-closed eyes: the slow blink is how a cat says "you're safe with me".
      // Smiling eyes: round pupils with a catch-light, and the lower lid pushed up into a soft arc.
      return h('g', { key: key },
        h('ellipse', { cx: cx_, cy: 26, rx: 2.9, ry: 3.3, className: 'ss-cat-eye' }),
        h('ellipse', { cx: cx_, cy: 26, rx: 1.8, ry: 2.2, className: 'ss-cat-pupil' }),
        h('circle', { cx: cx_ + 0.8, cy: 25.1, r: 0.75, className: 'ss-cat-shine' }),
        h('path', { d: 'M' + (cx_ - 3.6) + ' 30.4v-1.8q3.6-3 7.2 0v1.8z', className: 'ss-cat-lid' }),
        h('path', { d: 'M' + (cx_ - 3.2) + ' 28.6q3.2-2.6 6.4 0', className: 'ss-cat-line' }));
    }
    if (mood === 'scam') {
      // Wide, round, alarmed eyes with a catch-light.
      return h('g', { key: key },
        h('ellipse', { cx: cx_, cy: 26.2, rx: 3.4, ry: 3.9, className: 'ss-cat-eye' }),
        h('ellipse', { cx: cx_, cy: 26.6, rx: 2.1, ry: 2.4, className: 'ss-cat-pupil' }),
        h('circle', { cx: cx_ + 0.9, cy: 25.4, r: 0.8, className: 'ss-cat-shine' }));
    }
    return h('g', { key: key },
      h('ellipse', { cx: cx_, cy: 26, rx: 2.6, ry: 3.1, className: 'ss-cat-eye' }),
      h('ellipse', { cx: cx_, cy: 26.3, rx: 0.95, ry: 2.4, className: 'ss-cat-pupil' }),
      mood === 'suspicious' && key === 'r' ? h('path', { d: 'M' + (cx_ - 3.4) + ' 22.2h6.8v3.6h-6.8z', className: 'ss-cat-lid' }) : null,
      mood === 'suspicious' && key === 'r' ? h('path', { d: 'M' + (cx_ - 3) + ' 25.8h6', className: 'ss-cat-line' }) : null);
  }

  var MOUTHS = {
    idle: 'M21.4 33.2q2.6 2.4 5.2 0',
    scam: null, // an open "o", drawn as a shape
    other: 'M24 32.1q-1.4 1.9-3.4 1.1M24 32.1q1.4 1.9 3.4 1.1'
  };

  function catHead(mood) {
    var eyes;
    if (mood === 'safe') eyes = [h('path', { key: 'l', d: 'M14.5 26.6q2.5-3 5 0', className: 'ss-cat-line' }), h('path', { key: 'r', d: 'M28.5 26.6q2.5-3 5 0', className: 'ss-cat-line' })];
    else if (mood === 'sleeping') eyes = [h('path', { key: 'l', d: 'M14.5 25.6q2.5 2.6 5 0', className: 'ss-cat-line' }), h('path', { key: 'r', d: 'M28.5 25.6q2.5 2.6 5 0', className: 'ss-cat-line' })];
    else eyes = [h('g', { key: 'e', className: 'ss-cat-eyes' }, catEye(17, 'l', mood), catEye(31, 'r', mood))];
    var scam = mood === 'scam';
    return h('g', { className: 'ss-cat-face' + (mood === 'suspicious' ? ' is-tilted' : '') },
      h('path', { d: 'M9.5 22L11.5 5.5L22 14.5Z', className: 'ss-cat-fur' }),
      h('path', { d: 'M38.5 22L36.5 5.5L26 14.5Z', className: 'ss-cat-fur' }),
      h('path', { d: 'M12.6 16.8L13.4 9.6L18.4 14Z', className: 'ss-cat-inner' }),
      h('path', { d: 'M35.4 16.8L34.6 9.6L29.6 14Z', className: 'ss-cat-inner' }),
      // Alarmed: the fur on top of her head puffs up.
      scam ? h('path', { d: 'M18.6 15.2l1.6-4.2 2 3.2 1.8-4.4 1.8 4.4 2-3.2 1.6 4.2z', className: 'ss-cat-fur ss-cat-tuft' }) : null,
      h('ellipse', { cx: 24, cy: 27, rx: 16, ry: 13.5, className: 'ss-cat-fur' }),
      mood === 'idle' ? [h('ellipse', { key: 'bl', cx: 12.6, cy: 31.4, rx: 2.4, ry: 1.4, className: 'ss-cat-blush' }), h('ellipse', { key: 'br', cx: 35.4, cy: 31.4, rx: 2.4, ry: 1.4, className: 'ss-cat-blush' })] : null,
      // Worried, raised brows.
      scam ? h('path', { d: 'M13.2 20.4q3.4-3.1 7.2-1.2M34.8 20.4q-3.4-3.1-7.2-1.2', className: 'ss-cat-line' }) : null,
      eyes,
      h('path', { d: 'M22.4 30.2h3.2l-1.6 1.9z', className: 'ss-cat-nose' }),
      scam
        ? h('ellipse', { cx: 24, cy: 34.6, rx: 1.9, ry: 2.3, className: 'ss-cat-mouth' })
        : h('path', { d: mood === 'idle' ? MOUTHS.idle : MOUTHS.other, className: 'ss-cat-line' }),
      h('path', { d: scam ? 'M13 30L5 27M13 32L5 33M35 30L43 27M35 32L43 33' : 'M13 30.5L5 29.2M13 32.5L5.5 33.6M35 30.5L43 29.2M35 32.5L42.5 33.6', className: 'ss-cat-whisker' }),
      h('path', { d: 'M13 38.2q11 5.2 22 0', className: 'ss-cat-collar' }),
      h('path', { d: 'M21.6 40.6h4.8v2.6q0 2.4-2.4 3.4q-2.4-1-2.4-3.4z', className: 'ss-cat-tag' }),
      mood === 'sleeping' ? h('path', { d: 'M39 6h4.5l-4.5 4.5h4.5', className: 'ss-cat-line ss-cat-z' }) : null);
  }

  function catPaw(cx_, cy, key, cls) {
    return h('g', { key: key, className: cls },
      h('ellipse', { cx: cx_, cy: cy, rx: 5.4, ry: 3.6, className: 'ss-cat-fur' }),
      h('path', { d: 'M' + (cx_ - 1.6) + ' ' + (cy + 0.6) + 'v2.4M' + (cx_ + 1.6) + ' ' + (cy + 0.6) + 'v2.4', className: 'ss-cat-toe' }));
  }

  /*
   * form: "head" (pill, island, cards) or "full" (empty states).
   * paws: "none" | "rest" (over the edge of whatever she sits on) | "tap" (her right paw taps toward the main action).
   */
  function Mascot(p) {
    var mood = p.mood || 'idle';
    var form = p.form || 'head';
    var paws = p.paws || 'none';
    var size = p.size || (form === 'head' ? 40 : 112);
    var a11y = p.label ? { role: 'img', 'aria-label': p.label } : { 'aria-hidden': true };
    var cls = cx('ss-cat', 'ss-cat-' + form, 'ss-cat-' + mood, paws !== 'none' && 'ss-cat-paws-' + paws, p.className);
    if (form === 'head' && paws === 'sign') {
      // She holds the stop sign up in her right paw: the alert symbol and the character are one picture.
      var cxs = 52, cys = 9, r = 8.5, k = 3.52;
      var octagon = 'M' + (cxs - k) + ' ' + (cys - r) + 'L' + (cxs + k) + ' ' + (cys - r) + 'L' + (cxs + r) + ' ' + (cys - k) + 'L' + (cxs + r) + ' ' + (cys + k) +
        'L' + (cxs + k) + ' ' + (cys + r) + 'L' + (cxs - k) + ' ' + (cys + r) + 'L' + (cxs - r) + ' ' + (cys + k) + 'L' + (cxs - r) + ' ' + (cys - k) + 'Z';
      return h('svg', Object.assign({ className: cls, viewBox: '0 -2 62 54', width: Math.round(size * 62 / 48), height: Math.round(size * 54 / 48), focusable: 'false' }, a11y),
        catHead(mood),
        catPaw(14.5, 46.6, 'l', 'ss-cat-paw-l'),
        h('g', { className: 'ss-cat-sign' },
          h('path', { d: 'M35.5 41.5C42 37 46.5 28.5 48.5 20', className: 'ss-cat-arm-o' }),
          h('path', { d: 'M35.5 41.5C42 37 46.5 28.5 48.5 20', className: 'ss-cat-arm-f' }),
          h('path', { d: octagon, className: 'ss-cat-sign-plate' }),
          h('path', { d: 'M52 4.4v5.4', className: 'ss-cat-sign-mark' }),
          h('circle', { cx: 52, cy: 13.2, r: 1.25, className: 'ss-cat-sign-dot' }),
          catPaw(48.6, 18.6, 'sp', 'ss-cat-paw-sign')));
    }
    if (form === 'head') {
      var vh = paws === 'none' ? 48 : 52;
      return h('svg', Object.assign({ className: cls, viewBox: '0 0 48 ' + vh, width: size, height: Math.round(size * vh / 48), focusable: 'false' }, a11y),
        catHead(mood),
        paws !== 'none' ? [catPaw(14.5, 46.6, 'l', 'ss-cat-paw-l'), catPaw(33.5, 46.6, 'r', 'ss-cat-paw-r')] : null);
    }
    return h('svg', Object.assign({ className: cls, viewBox: '0 0 64 76', width: size, height: Math.round(size * 76 / 64), focusable: 'false' }, a11y),
      h('g', { className: 'ss-cat-tail' },
        h('path', { d: 'M47 71C61 69 63 51 55 46', className: 'ss-cat-tail-o' }),
        h('path', { d: 'M47 71C61 69 63 51 55 46', className: 'ss-cat-tail-f' })),
      h('path', { d: 'M15 75C11 59 17 45 32 45C47 45 53 59 49 75Z', className: 'ss-cat-fur' }),
      catPaw(25, 72.4, 'l', 'ss-cat-paw-l'),
      catPaw(39, 72.4, 'r', 'ss-cat-paw-r'),
      h('g', { transform: 'translate(8 4)' }, catHead(mood)));
  }

  function Button(p) {
    var variant = p.variant || 'primary';
    var size = p.size || 'lg';
    var rest = omit(p, ['variant', 'size', 'icon', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('ss-btn', 'ss-btn-' + variant, 'ss-btn-' + size, p.className)
    }),
      p.icon ? h(Icon, { name: p.icon, size: size === 'lg' ? 28 : 22 }) : null,
      h('span', null, p.children));
  }

  function VerdictBadge(p) {
    var v = verdictOf(p.verdict);
    return h('span', { className: cx('ss-badge', 'ss-badge-' + v.tone, p.className) },
      h(VerdictIcon, { verdict: p.verdict, size: 20 }),
      h('span', null, p.label || v.word));
  }

  function VerdictCard(p) {
    var v = verdictOf(p.verdict);
    var links = [];
    if (p.onWhy) links.push(h(Button, { key: 'why', variant: 'quiet', size: 'md', icon: 'why', onClick: p.onWhy }, 'De ce?'));
    if (p.onShare) links.push(h(Button, { key: 'share', variant: 'quiet', size: 'md', icon: 'person', onClick: p.onShare }, 'Întreabă pe cineva de încredere'));
    if (p.onReset) links.push(h(Button, { key: 'reset', variant: 'quiet', size: 'md', icon: 'reset', onClick: p.onReset }, 'Verifică alt mesaj'));
    var cat = p.mascot !== false;
    var holdsSign = cat && p.verdict === 'SCAM';
    return h('section', { className: cx('ss-card', 'ss-card-' + v.tone, cat && 'has-cat', holdsSign && 'has-sign', p.className), 'aria-live': 'polite' },
      h('div', { className: 'ss-card-band' },
        // On a scam she holds the stop sign herself, so the separate icon steps aside.
        holdsSign ? null : h(VerdictIcon, { verdict: p.verdict, size: 40 }),
        h('h2', { className: 'ss-card-title' }, p.title || v.title),
        // She sits on the band's edge; when there is an action, her paw taps toward it.
        cat ? h(Mascot, { mood: moodFor(p.verdict), paws: holdsSign ? 'sign' : p.action ? 'tap' : 'rest', size: 76, className: 'ss-card-cat' }) : null),
      h('div', { className: 'ss-card-body' },
        // A string, or an array of sentences shown one per line.
        Array.isArray(p.warning)
          ? h('p', { className: 'ss-card-warning ss-card-lines' }, p.warning.map(function (l, i) { return h('span', { key: i, className: 'ss-card-line' }, l); }))
          : p.warning ? h('p', { className: 'ss-card-warning' }, p.warning) : null,
        p.action ? h('div', { className: 'ss-card-action' },
          h(Button, { variant: 'primary', icon: p.action.icon || 'call', onClick: p.onAction }, p.action.label),
          p.action.detail ? h('p', { className: 'ss-card-detail' }, p.action.detail) : null) : null,
        links.length ? h('div', { className: 'ss-card-links' }, links) : null));
  }

  function CheckIsland(p) {
    var state = p.state || 'idle';
    if (state === 'checking') {
      return h('div', { className: 'ss-island ss-island-pill', role: 'status' },
        h(Mascot, { mood: 'checking', size: 40 }),
        h('span', null, p.checkingLabel || 'Verificăm mesajul…'));
    }
    if (state === 'result') {
      var v = verdictOf(p.verdict);
      return h('button', { type: 'button', className: cx('ss-island', 'ss-island-pill', 'ss-island-result', 'ss-tone-' + v.tone), onClick: p.onReset },
        p.verdict === 'SCAM'
          ? h(Mascot, { mood: 'scam', paws: 'sign', size: 38 })
          : [h(Mascot, { key: 'c', mood: moodFor(p.verdict), size: 40 }), h(VerdictIcon, { key: 'i', verdict: p.verdict, size: 26 })],
        h('span', { className: 'ss-island-verdict' }, v.short),
        h('span', { className: 'ss-island-sep', 'aria-hidden': true }),
        h('span', null, 'Verifică alt mesaj'));
    }
    var id = p.id || 'ss-message';
    var areaProps = { id: id, className: 'ss-island-input', rows: 4, placeholder: p.placeholder || 'Lipiți aici mesajul sau scrieți ce vi s-a spus la telefon…', onChange: p.onChange };
    if (p.value !== undefined) areaProps.value = p.value; else areaProps.defaultValue = p.defaultValue;
    var ready = typeof p.value === 'string' && p.value.trim().length > 0;
    return h('form', { className: cx('ss-island', 'ss-island-open', p.mascot !== false && 'has-cat'), onSubmit: function (e) { e.preventDefault(); if (p.onCheck) p.onCheck(); } },
      // She rests her paws on the box; once there is text, she taps: "now press the button".
      p.mascot !== false ? h(Mascot, { key: ready ? 'tap' : 'rest', mood: 'idle', paws: ready ? 'tap' : 'rest', size: 64, className: 'ss-island-cat' }) : null,
      h('label',{ className: 'ss-island-label', htmlFor: id }, p.label || 'Ați primit un mesaj ciudat?'),
      h('textarea', areaProps),
      h('div', { className: 'ss-island-actions' },
        p.onPaste ? h(Button, { variant: 'secondary', size: 'md', icon: 'paste', onClick: p.onPaste }, 'Lipește') : null,
        h(Button, { variant: 'primary', type: 'submit', className: 'ss-island-go' }, 'Verifică mesajul')),
      p.note === false ? null : h('p', { className: 'ss-island-note' }, p.note || 'Nu păstrăm mesajul dumneavoastră.'));
  }

  var DEFAULT_OPTIONS = [
    { id: 'photo', icon: 'photo', label: 'Poză' },
    { id: 'file', icon: 'file', label: 'Fișier' },
    { id: 'call', icon: 'call', label: 'Apel' }
  ];
  function SourceOptions(p) {
    var opts = (p.options || DEFAULT_OPTIONS).slice(0, 3);
    return h('div', { className: 'ss-options', role: 'group', 'aria-label': p.label || 'Alte moduri de a verifica' },
      opts.map(function (o) {
        return h('button', { key: o.id, type: 'button', className: 'ss-option', onClick: function () { if (p.onSelect) p.onSelect(o.id); } },
          h(Icon, { name: o.icon, size: 26 }), h('span', null, o.label));
      }));
  }

  function SenderChoice(p) {
    var st = useState(p.defaultValue || 'unknown');
    var val = p.value !== undefined ? p.value : st[0];
    function set(v) { if (p.value === undefined) st[1](v); if (p.onChange) p.onChange(v); }
    var opts = [['known', 'Cineva cunoscut'], ['unknown', 'Număr necunoscut']];
    return h('fieldset', { className: 'ss-seg' },
      h('legend', { className: 'ss-seg-legend' }, p.legend || 'Cine v-a scris? (opțional)'),
      h('div', { className: 'ss-seg-track' }, opts.map(function (o) {
        var on = val === o[0];
        return h('button', { key: o[0], type: 'button', className: cx('ss-seg-btn', on && 'is-on'), 'aria-pressed': on, onClick: function () { set(o[0]); } },
          on ? h(Icon, { name: 'check', size: 20 }) : null, h('span', null, o[1]));
      })));
  }

  function MessageBubble(p) {
    var reader = p.from === 'reader';
    return h('div', { className: cx('ss-msg', reader ? 'ss-msg-reader' : 'ss-msg-sender', p.alert && 'ss-msg-alert') },
      p.alert ? h('div', { className: 'ss-msg-alertlabel' },
        h(VerdictIcon, { verdict: p.alertVerdict || 'SCAM', size: 22 }),
        h('span', null, p.alertLabel || 'Aici începe pericolul')) : null,
      h('div', { className: 'ss-msg-bubble' },
        h('span', { className: 'ss-msg-n' }, '#' + p.n + (reader ? ' · Dumneavoastră' : '')),
        h('div', { className: 'ss-msg-text' }, p.children)));
  }

  function FlagMark(p) {
    var label = p.label || FLAG_LABELS[p.code] || p.code;
    return h('mark', { className: 'ss-flag', 'data-flag': p.code },
      p.children, p.tag === false ? null : h('span', { className: 'ss-flag-tag' }, label));
  }

  function RiskMeter(p) {
    var s = Math.max(0, Math.min(100, Math.round(p.score || 0)));
    var verdict = s >= 50 ? 'SCAM' : s >= 25 ? 'SUSPICIOUS' : 'SAFE';
    var tone = VERDICTS[verdict].tone;
    var label = p.label || 'Scor de risc';
    return h('div', { className: 'ss-meter' },
      h('div', { className: 'ss-meter-head' },
        h('span', { className: 'ss-meter-label' }, label),
        h('span', { className: cx('ss-meter-value', 'ss-ink-' + tone) }, h(VerdictIcon, { verdict: verdict, size: 22 }), s + ' / 100')),
      h('div', { className: 'ss-meter-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': s, 'aria-label': label },
        h('div', { className: 'ss-meter-zone ss-zone-safe' }),
        h('div', { className: 'ss-meter-zone ss-zone-caution' }),
        h('div', { className: 'ss-meter-zone ss-zone-scam' }),
        h('div', { className: cx('ss-meter-fill', 'ss-fill-' + tone), style: { width: 'calc(' + s + '% - 8px)' } })),
      h('div', { className: 'ss-meter-scale', 'aria-hidden': true },
        h('span', { style: { left: '0%' } }, '0'),
        h('span', { style: { left: '25%' } }, '25'),
        h('span', { style: { left: '50%' } }, '50'),
        h('span', { style: { left: '100%' } }, '100')));
  }

  function ResultsSummary(p) {
    var items = [
      { key: 'total', label: p.totalLabel || 'Loaded', value: p.total, verdict: null },
      { key: 'SCAM', label: 'SCAM', value: p.scam, verdict: 'SCAM' },
      { key: 'SUSPICIOUS', label: 'SUSPICIOUS', value: p.suspicious, verdict: 'SUSPICIOUS' },
      { key: 'SAFE', label: 'SAFE', value: p.safe, verdict: 'SAFE' }
    ];
    return h('div', { className: 'ss-summary' }, items.map(function (it) {
      var tone = it.verdict ? VERDICTS[it.verdict].tone : null;
      return h('div', { key: it.key, className: cx('ss-stat', tone && 'ss-stat-' + tone) },
        h('div', { className: 'ss-stat-label' }, it.verdict ? h(VerdictIcon, { verdict: it.verdict, size: 22 }) : null, h('span', null, it.label)),
        h('div', { className: 'ss-stat-value' }, it.value == null ? '—' : String(it.value)));
    }));
  }

  var COLUMNS = ['ID', 'Verdict', 'Scam type', 'Risk score', 'First alert', 'Red flags'];
  function ResultsTable(p) {
    var rows = (p.rows || []).slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    return h('div', { className: 'ss-table-wrap' },
      h('table', { className: 'ss-table' },
        h('thead', null, h('tr', null, COLUMNS.map(function (c) {
          return h('th', { key: c, scope: 'col', className: (c === 'Risk score' || c === 'First alert') ? 'ss-num' : undefined }, c);
        }))),
        h('tbody', null, rows.map(function (r) {
          var open = p.onOpen && !r.error ? function () { p.onOpen(r.id); } : undefined;
          var cells;
          if (r.error) {
            cells = [h('td', { key: 'e', colSpan: 5, className: 'ss-row-error' }, h(VerdictIcon, { verdict: 'SCAM', size: 20 }), h('span', null, r.error))];
          } else {
            var safe = r.verdict === 'SAFE';
            cells = [
              h('td', { key: 'v' }, h(VerdictBadge, { verdict: r.verdict })),
              h('td', { key: 't', className: 'ss-mono' }, safe ? 'NONE' : r.type),
              h('td', { key: 's', className: 'ss-num' }, r.score),
              h('td', { key: 'a', className: 'ss-num' }, safe || r.firstAlert == null ? '—' : r.firstAlert),
              h('td', { key: 'f' }, (r.flags && r.flags.length)
                ? h('div', { className: 'ss-flags' }, r.flags.map(function (f) { return h('code', { key: f, className: 'ss-code' }, f); }))
                : '—')
            ];
          }
          return h('tr', {
            key: r.id,
            className: cx(open && 'is-clickable', r.error && 'is-error'),
            onClick: open,
            tabIndex: open ? 0 : undefined,
            onKeyDown: open ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined
          }, [h('td', { key: 'id', className: 'ss-mono' }, r.id)].concat(cells));
        }))));
  }

  var api = {
    CheckIsland: CheckIsland, SourceOptions: SourceOptions, SenderChoice: SenderChoice, Button: Button,
    VerdictCard: VerdictCard, VerdictBadge: VerdictBadge, VerdictIcon: VerdictIcon,
    MessageBubble: MessageBubble, FlagMark: FlagMark, RiskMeter: RiskMeter,
    ResultsSummary: ResultsSummary, ResultsTable: ResultsTable,
    Mascot: Mascot, moodFor: moodFor,
    Icon: Icon, VERDICTS: VERDICTS, FLAG_LABELS: FLAG_LABELS
  };
  window.ScamShield = Object.assign(window.ScamShield || {}, api);
})();
