/*
 * Mesaje de avertizare pentru UI (română). Port JS al warnings_ro.py (app/tools/warnings_ro.py),
 * ca desktopul, aplicația web și mobilul să arate exact același text.
 *
 * Reguli (brief, M6):
 *   - cel mult 3 propoziții scurte, câte una pe rând (lines): ce se întâmplă, de ce, ce să faceți;
 *   - clar, calm, corect, o singură acțiune concretă, pe un canal oficial;
 *   - nu repetă niciodată linkurile sau numerele din mesajul analizat;
 *   - fără emoji, fără termeni tehnici, fără procente.
 *
 *   SSWarnings.compose({ verdict, scamType, flags, messages, sender, firstAlert })
 *     → { lines, text, show_at, org, actionLine }
 *   SSWarnings.build(detectorResult) → { warning, lines, actionLine, action }   (action = the call button, or null)
 *   SSWarnings.reasons(detectorResult, max) → [{ code, text, clause, quote }]  (the cat's short "why")
 *   SSWarnings.speech({ verdict, lines, actionLine, reasons, warning }) → { text, marks, actionAt }
 */
(function (g) {
  'use strict';

  /* ---------- contacte oficiale (official_catalog.json) ---------- */
  var OFFICIAL = {
    'Banca Dunărea': { website: 'bancadunarea.ro', phone: '0800 100 200' },
    'CurierExpres': { website: 'curierexpres.ro', phone: '0800 300 400' },
    'PiațaMea': { website: 'piatamea.ro', phone: null },
    'MegaShop': { website: 'megashop.ro', phone: '0800 500 600' },
    'ANAF': { website: 'anaf.ro', phone: '031 403 91 60' }
  };

  // Alte instituții recunoscute în text (fără contacte în catalog). Potrivire la început de cuvânt.
  var AUTHORITY_KEYS = [
    ['politie', 'Poliția'], ['poliția', 'Poliția'], ['politia', 'Poliția'], ['procuror', 'Poliția'], ['diicot', 'Poliția'], ['comisar', 'Poliția'],
    ['bnr', 'BNR'], ['banca nationala', 'BNR'], ['banca națională', 'BNR'],
    ['casa de pensii', 'Casa de Pensii'], ['pensi', 'Casa de Pensii'], ['cnas', 'CNAS'], ['card de sanatate', 'CNAS'], ['cardul de sănătate', 'CNAS'],
    ['primari', 'Primăria'], ['anaf', 'ANAF']
  ];

  /* ---------- 1. ce se întâmplă (după verdict): o propoziție ---------- */
  var TITLE = {
    SCAM: 'Atenție: acest mesaj pare o tentativă de fraudă.',
    SUSPICIOUS: 'Mesajul are semne de fraudă, așa că verificați înainte să faceți ceva.',
    SAFE: 'Nu am găsit semne de fraudă.'
  };

  /* ---------- 2. de ce. [0] = motivul întreg (îl arată și pisica); [1] = explicație, doar când motivul e singur ---------- */
  var REASONS_RO = {
    RF_CODE_REQUEST: ['Vi se cere un cod primit prin SMS.', 'Acest cod nu se dă nimănui, nici băncii.'],
    RF_REMOTE_ACCESS: ['Vi se cere să instalați un program prin care altcineva vă poate controla telefonul sau calculatorul.'],
    RF_DATA_REQUEST: ['Vi se cer datele cardului sau date personale.', 'Nicio bancă sau instituție nu le cere prin mesaj sau la telefon.'],
    RF_PAYMENT_REQUEST: ['Vi se cer bani.'],
    RF_SUSPICIOUS_CONTACT: ['{contact_line}'],
    RF_NEW_NUMBER: ['Cineva spune că e o rudă sau un prieten cu număr nou.'],
    RF_SECRECY: ['Vi se cere să nu spuneți nimănui.', 'Escrocii fac asta ca să nu vă oprească nimeni.'],
    RF_TOO_GOOD: ['Vi se promite un câștig neașteptat.'],
    RF_IMPERSONATION: ['Pretinde că vine de la {org}, dar nu folosește canalele oficiale.'],
    RF_URGENCY: ['Vă grăbește, ca să nu aveți timp să verificați.'],
    RF_THREAT: ['Vă sperie cu blocarea contului sau cu amenzi.'],
    RF_EMOTIONAL_PRESSURE: ['Încearcă să vă emoționeze, ca să acționați repede.'],
    RF_CHANNEL_SWITCH: ['Vă cere să mutați discuția în altă aplicație.']
  };
  /* Al doilea motiv, legat cu „, iar ...": scurt și cu subiect propriu. */
  var SECOND = {
    RF_CODE_REQUEST: 'vi se cere un cod primit prin SMS',
    RF_REMOTE_ACCESS: 'vi se cere să instalați un program prin care altcineva vă poate controla telefonul sau calculatorul',
    RF_DATA_REQUEST: 'vi se cer datele cardului sau date personale',
    RF_PAYMENT_REQUEST: 'vi se cer bani',
    RF_SUSPICIOUS_CONTACT: '{contact_clause}',
    RF_NEW_NUMBER: 'expeditorul spune că e o rudă sau un prieten cu număr nou',
    RF_SECRECY: 'vi se cere să nu spuneți nimănui',
    RF_TOO_GOOD: 'vi se promite un câștig neașteptat',
    RF_IMPERSONATION: 'mesajul pretinde că vine de la {org}',
    RF_URGENCY: 'mesajul vă grăbește',
    RF_THREAT: 'mesajul vă sperie cu blocarea contului sau cu amenzi',
    RF_EMOTIONAL_PRESSURE: 'mesajul încearcă să vă emoționeze',
    RF_CHANNEL_SWITCH: 'vi se cere să mutați discuția în altă aplicație'
  };
  var FLAG_ORDER = ['RF_CODE_REQUEST', 'RF_REMOTE_ACCESS', 'RF_DATA_REQUEST', 'RF_PAYMENT_REQUEST', 'RF_SUSPICIOUS_CONTACT',
    'RF_NEW_NUMBER', 'RF_SECRECY', 'RF_TOO_GOOD', 'RF_IMPERSONATION', 'RF_URGENCY', 'RF_THREAT',
    'RF_EMOTIONAL_PRESSURE', 'RF_CHANNEL_SWITCH'];

  /* ---------- 3. ce să faceți (după tip): o singură propoziție, [cu contact oficial, fără contact] ---------- */
  var NONE = '__none__';
  var ACTIONS = {
    BANK_IMPERSONATION: {
      'Banca Dunărea': ['Nu deschideți linkul și nu răspundeți; sunați la Banca Dunărea, la 0800 100 200.',
        'Nu deschideți linkul și nu răspundeți; sunați la bancă, la numărul de pe spatele cardului.'],
      __none__: [null, 'Nu deschideți linkul și nu răspundeți; sunați la bancă, la numărul de pe spatele cardului.']
    },
    COURIER_FEE: {
      'CurierExpres': ['Nu plătiți nimic; verificați coletul intrând singur pe curierexpres.ro.',
        'Nu plătiți nimic; verificați coletul în aplicația oficială a curierului.'],
      __none__: [null, 'Nu plătiți nimic; verificați coletul intrând singur pe site-ul oficial al curierului.']
    },
    FAMILY_EMERGENCY: {
      __none__: [null, 'Nu trimiteți bani; sunați persoana înapoi la numărul vechi, pe care îl știți deja.']
    },
    AUTHORITY_IMPERSONATION: {
      'ANAF': ['Nu completați nimic; verificați intrând singur pe anaf.ro.',
        'Nu completați nimic; verificați în contul dvs. de pe site-ul oficial ANAF, tastat de dvs.'],
      'Poliția': [null, 'Închideți, pentru că Poliția nu cere niciodată bani la telefon; dacă ați dat deja bani, sunați la 112.'],
      'BNR': [null, 'Închideți, pentru că Banca Națională nu mută banii oamenilor în conturi sigure; dacă ați dat deja bani, sunați la 112.'],
      'Casa de Pensii': [null, 'Închideți și mergeți cu buletinul la ghișeul Casei de Pensii.'],
      'CNAS': [null, 'Închideți și întrebați-l pe medicul de familie despre cardul de sănătate.'],
      'Primăria': [null, 'Nu plătiți din mesaj; verificați direct la ghișeul primăriei.'],
      __none__: [null, 'Nu dați nicio informație; mergeți direct la ghișeul instituției.']
    },
    TECH_SUPPORT: {
      __none__: [null, 'Închideți și nu instalați nimic, pentru că Microsoft nu sună niciodată clienții.']
    },
    MARKETPLACE: {
      'PiațaMea': ['Nu introduceți datele cardului; banii primiți îi vedeți doar în aplicație sau pe piatamea.ro.',
        'Nu introduceți datele cardului; banii primiți îi vedeți doar în aplicația oficială.'],
      __none__: [null, 'Nu introduceți datele cardului; banii primiți îi vedeți doar în aplicația oficială a platformei.']
    },
    ACCOUNT_TAKEOVER: {
      // Neutral: the contact may be a man or a woman, and the name may be missing.
      __none__: [null, 'Nu trimiteți codul, pentru că acel cont poate fi spart; verificați printr-un apel la numărul pe care îl știți.']
    },
    INVESTMENT: {
      __none__: [null, 'Nu trimiteți bani, pentru că nu există câștiguri garantate; întrebați-vă întâi banca.']
    },
    ROMANCE: {
      __none__: [null, 'Nu trimiteți bani cuiva pe care nu l-ați întâlnit în persoană; vorbiți întâi cu cineva apropiat.']
    },
    JOB_OFFER: {
      __none__: [null, 'Nu plătiți și nu trimiteți buletinul, pentru că un angajator adevărat nu cere bani.']
    },
    PRIZE_LOTTERY: {
      'MegaShop': ['Nu plătiți nicio taxă; verificați concursul intrând singur pe megashop.ro.',
        'Nu plătiți nicio taxă; verificați concursul în contul dvs. de client MegaShop.'],
      __none__: [null, 'Nu plătiți nicio taxă; verificați concursul intrând singur pe site-ul oficial al magazinului.']
    },
    OTHER: {
      __none__: [null, 'Nu plătiți din link; verificați în aplicația oficială a furnizorului sau la numărul de pe factura de hârtie.']
    }
  };

  var SAFE_TIPS = {
    code: 'Păstrați codul doar pentru dvs. și nu-l spuneți nimănui.',
    def: 'Dacă vi se cer ulterior bani, coduri sau date, verificați din nou.'
  };
  var MAX_LINES = 3; // brief: at most three short sentences

  /* ---------- utilitare ---------- */
  var LINK = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
  var NUM = /(?:\+?\d[\d ]{6,}\d|\*\d{3,4}|\b\d{3,}\b)/g;

  function plain(s) {
    return (s || '').toLowerCase().replace(/ş/g, 'ș').replace(/ţ/g, 'ț').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }
  function digits(s) { return (s || '').replace(/\D/g, ''); }
  function all(re, s) { var out = [], m; re.lastIndex = 0; while ((m = re.exec(s))) out.push(m[0]); return out; }
  function lcfirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function noPeriod(s) { return s.charAt(s.length - 1) === '.' ? s.slice(0, -1) : s; }

  function messageText(messages) {
    return (messages || []).filter(function (m) { return m.from === 'sender'; }).map(function (m) { return m.text || ''; }).join(' ');
  }

  /* Organizația pretinsă: întâi din cele 5 oficiale, apoi alte instituții. */
  function detectOrg(text, sender) {
    var t = plain(text + ' ' + ((sender && sender.name) || ''));
    var compact = t.replace(/ /g, '');
    for (var name in OFFICIAL) {
      var p = plain(name);
      if (t.indexOf(p) >= 0 || compact.indexOf(p.replace(/ /g, '')) >= 0) return name;
    }
    for (var i = 0; i < AUTHORITY_KEYS.length; i++) {
      // At the start of a word: "pensi" matches "pensia", not "suspensie".
      if (new RegExp('(^|[^a-z])' + plain(AUTHORITY_KEYS[i][0]).replace(/ /g, '\\s+')).test(t)) return AUTHORITY_KEYS[i][1];
    }
    if (/windows|microsoft/.test(t)) return 'Microsoft';
    return null;
  }

  /* True if the line repeats a link or a number that appears in the message. Numbers are compared whole,
     not as substrings of all the message's digits glued together (that wrongly dropped e.g. "sunați la 112"). */
  function containsMessageContact(line, text) {
    var pt = plain(text);
    var links = all(LINK, plain(line));
    for (var i = 0; i < links.length; i++) {
      var dom = links[i].replace(/^https?:\/\//, '').split('/')[0];
      if (dom && pt.indexOf(dom) >= 0) return true;
    }
    var msgNums = all(NUM, text).map(digits).filter(function (d) { return d.length >= 3; });
    var lineNums = all(NUM, line).map(digits).filter(function (d) { return d.length >= 3; });
    return lineNums.some(function (d) {
      return msgNums.some(function (m) { return m === d || (d.length >= 6 && m.length >= 6 && (m.indexOf(d) >= 0 || d.indexOf(m) >= 0)); });
    });
  }

  function contactLineFor(text, sender) {
    if (all(LINK, text).length) return 'Linkul din mesaj nu este cel oficial.';
    if (sender && sender.address && sender.address.indexOf('@') > 0) return 'Adresa de e-mail nu este cea oficială.';
    return 'Numărul din mesaj nu este cel oficial.';
  }

  function fmt(s, org, contactLine) {
    return s.replace('{org}', org || 'o instituție sau o firmă cunoscută').replace('{contact_line}', contactLine)
      .replace('{contact_clause}', lcfirst(noPeriod(contactLine)));
  }

  /* The exact fragments of sentence 2, in order (the read-aloud lights them up). */
  function reasonClauses(flags, org, contactLine) {
    var top = FLAG_ORDER.filter(function (f) { return flags.indexOf(f) >= 0; }).slice(0, 2);
    var clauses = top.map(function (f, i) {
      return i === 0 ? noPeriod(fmt(REASONS_RO[f][0], org, contactLine)) : fmt(SECOND[f], org, contactLine);
    });
    return { top: top, clauses: clauses };
  }

  /* "Vi se cere X și vi se cer Y" (same subject) or "X, iar mesajul Y" (different subjects). */
  function join(first, second) {
    var same = plain(first).indexOf('vi se') === 0 && second.indexOf('vi se') === 0;
    return first + (same ? ' și ' : ', iar ') + second + '.';
  }

  /* ---------- compunere: cel mult 3 propoziții (ce, de ce, ce să faceți) ---------- */
  function compose(o) {
    var verdict = o.verdict, scamType = o.scamType || 'NONE', flags = o.flags || [];
    var text = messageText(o.messages);
    var org = o.org || detectOrg(text, o.sender);
    var lines = [TITLE[verdict] || TITLE.SUSPICIOUS];

    if (verdict === 'SAFE') {
      lines.push(/\bcod/.test(plain(text)) ? SAFE_TIPS.code : SAFE_TIPS.def);
      return { lines: lines, text: lines.join('\n'), show_at: null, org: org, actionLine: lines.length - 1, usedOfficial: false };
    }

    var contactLine = contactLineFor(text, o.sender);
    var rc = reasonClauses(flags, org, contactLine);
    if (rc.clauses.length === 2) lines.push(join(rc.clauses[0], rc.clauses[1]));
    else if (rc.clauses.length === 1) {
      var extra = REASONS_RO[rc.top[0]][1];
      lines.push(rc.clauses[0] + (extra ? ': ' + lcfirst(extra) : '.'));
    }

    var byOrg = ACTIONS[scamType] || ACTIONS.OTHER;
    var pair = byOrg[org] || byOrg[NONE] || byOrg[Object.keys(byOrg)[0]];
    var withContact = pair[0], withoutContact = pair[1];
    var usedOfficial = !!withContact && !containsMessageContact(withContact, text);
    var actionLine = lines.length;
    lines.push(usedOfficial ? withContact : withoutContact);

    // Final guarantee: no line repeats a link or a number from the message.
    var kept = [];
    lines.forEach(function (l, i) { if (!containsMessageContact(l, text)) kept.push(l); else if (i < actionLine) actionLine--; });
    kept = kept.slice(0, MAX_LINES);
    return { lines: kept, text: kept.join('\n'), show_at: o.firstAlert == null ? null : o.firstAlert, org: org, actionLine: actionLine, usedOfficial: usedOfficial };
  }

  /* ---------- for the app: warning lines + the one call button ---------- */
  function build(r) {
    var w = compose({ verdict: r.verdict, scamType: r.scamType, flags: r.flags, messages: r.messages, sender: r.sender, firstAlert: r.firstAlert });
    var action = null;
    var official = w.org && OFFICIAL[w.org];
    // The button only when the warning itself sends the reader to the catalog's official number.
    if (r.verdict !== 'SAFE' && official && official.phone && w.usedOfficial && w.lines.some(function (l) { return l.indexOf(official.phone) >= 0; })) {
      action = { label: 'Sunați la ' + w.org, detail: official.phone + ' · numărul oficial ' + w.org, tel: official.phone };
    }
    return { warning: w.lines.join(' '), lines: w.lines, actionLine: w.actionLine, action: action };
  }

  /* ---------- the cat's reasons: one line each, most serious first ---------- */
  var UNSAFE_QUOTE = /(https?:|www\.|@|\.[a-z]{2,}(\/|\b)|\d{5,}|\+?\d[\d\s.]{6,})/i;
  var NO_QUOTE = ['RF_SUSPICIOUS_CONTACT', 'RF_IMPERSONATION', 'RF_DATA_REQUEST', 'RF_CODE_REQUEST'];
  function quoteFor(r, code) {
    if (NO_QUOTE.indexOf(code) >= 0) return null;
    for (var i = 0; i < r.messages.length; i++) {
      var m = r.messages[i], spans = m.spans || [];
      for (var j = 0; j < spans.length; j++) {
        if (spans[j].code !== code) continue;
        var q = m.text.slice(spans[j].start, spans[j].end).trim();
        // A phrase, not a single word, and never a link, an address or a number from the message.
        if (/\s/.test(q) && q.length <= 40 && !UNSAFE_QUOTE.test(q)) return q;
      }
    }
    return null;
  }
  function reasons(r, max) {
    var flags = r.flags || [];
    var text = messageText(r.messages);
    var org = detectOrg(text, r.sender);
    var contactLine = contactLineFor(text, r.sender);
    var spoken = reasonClauses(flags, org, contactLine).clauses;
    return FLAG_ORDER.filter(function (c) { return flags.indexOf(c) >= 0; }).slice(0, max || 3).map(function (code, i) {
      // text = the full reason shown on its own line; clause = the words used for it in the warning (or null).
      return { code: code, text: fmt(REASONS_RO[code][0], org, contactLine), clause: spoken[i] || null, quote: quoteFor(r, code) };
    });
  }

  /*
   * What the cat says out loud: the warning lines. marks[i] = where reason i starts in the text
   * (-1 if that reason isn't spoken), actionAt = where the action starts, so the UI can light them up.
   */
  function speech(input) {
    var lines = input.lines && input.lines.length ? input.lines : [input.warning || ''];
    var text = '', starts = [];
    lines.forEach(function (l) { if (text) text += ' '; starts.push(text.length); text += l; });
    var marks = (input.reasons || []).map(function (x) { return x.clause ? text.indexOf(x.clause) : -1; });
    var al = input.actionLine != null ? input.actionLine : lines.length - 1;
    return { text: text, marks: marks, actionAt: starts[Math.min(al, starts.length - 1)] != null ? starts[Math.min(al, starts.length - 1)] : text.length };
  }

  /* Short text for "Întreabă pe cineva de încredere": the verdict only, never the message's links or numbers. */
  function shareText(r) {
    var v = { SCAM: 'pare o țeapă', SUSPICIOUS: 'pare suspect', SAFE: 'pare în regulă' }[r.verdict];
    return 'Am primit un mesaj care ' + v + ' (Scam Shield). Mă poți suna să ne uităm împreună?';
  }

  g.SSWarnings = { compose: compose, build: build, reasons: reasons, speech: speech, shareText: shareText, detectOrg: detectOrg, containsMessageContact: containsMessageContact, MAX_LINES: MAX_LINES };
})(typeof window !== 'undefined' ? window : globalThis);
