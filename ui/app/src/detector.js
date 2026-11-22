/*
 * Scam Shield rules detector.
 * Deterministic: the same scenario always gives the same result.
 * Input: a scenario in the brief's JSON format. Output: see analyze() below.
 * Works in the browser (window.SSDetector) and in Node (globalThis.SSDetector) for tests.
 */
(function (g) {
  'use strict';

  var CAT = g.SS_CATALOG;
  var POINTS = CAT.red_flag_points;
  var REQUEST_FLAGS = ['RF_CODE_REQUEST', 'RF_DATA_REQUEST', 'RF_PAYMENT_REQUEST', 'RF_REMOTE_ACCESS'];

  /* Lowercase and strip diacritics without changing string length, so match
     positions in the folded text are also positions in the original text. */
  function fold(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      var b = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (b.length !== 1) b = c;
      var l = b.toLowerCase();
      out += l.length === 1 ? l : b;
    }
    return out;
  }
  function squash(s) { return fold(s || '').replace(/[^a-z0-9]/g, ''); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ---------- Official contacts ---------- */

  function kindOf(name) {
    var f = fold(name);
    if (/banca|bank/.test(f)) return 'bank';
    if (/curier|courier|posta/.test(f)) return 'courier';
    if (/anaf/.test(f)) return 'authority';
    if (/piata/.test(f)) return 'marketplace';
    return 'shop';
  }

  var ORGS = CAT.official_contacts.map(function (o) {
    var folded = fold(o.organisation);
    var compact = folded.replace(/\s+/g, '');
    var words = folded === compact ? [compact] : [folded, compact];
    // Not inside a domain or a longer word: "bancadunarea-securitate.com" is a link, not a claim.
    var re = new RegExp('(?<![a-z0-9.@-])(' + words.map(escapeRe).join('|') + ')(?![a-z0-9-]|\\.[a-z])', 'g');
    return { name: o.organisation, site: o.website, phone: o.phone, key: compact, kind: kindOf(o.organisation), re: re };
  });

  function hostOf(url) {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
  }
  function isOfficialHost(host) {
    return ORGS.some(function (o) { return host === o.site || host.slice(-(o.site.length + 1)) === '.' + o.site; });
  }
  function digits(s) { return (s || '').replace(/\D/g, ''); }
  function isOfficialPhone(p) {
    var d = digits(p);
    return ORGS.some(function (o) { return o.phone && digits(o.phone) === d; });
  }

  var TLD = '(?:ro|com|net|org|info|eu|biz|xyz|top|online|site|shop|club|live|app|io|co|me|link|click|support|help)';
  var URL_RE = new RegExp('(?<![a-z0-9@.-])((?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)+' + TLD + '(?![a-z0-9-])(?:\\/[^\\s]*)?)', 'g');
  var EMAIL_RE = /[a-z0-9._%+-]+@((?:[a-z0-9-]+\.)+[a-z]{2,})/g;
  var PHONE_RE = /(?:\+40|\b0)[\s.]?\d{2,3}[\s.]?\d{3}[\s.]?\d{2,4}\b/g;

  /* ---------- Phrase rules (on folded text) ---------- */

  var RULES = [
    { code: 'RF_CODE_REQUEST', re: /\b(trimite(-mi|ti(-mi)?)?|retrimite|citeste(-mi)?|cititi(-mi)?|spune(-mi)?|spuneti(-mi)?|dictati(-mi)?|dicteaza(-mi)?|comunicati-mi|da-mi|dati-mi)\b[^.!?]{0,60}\bcod|\bcod\w*\b[\s\S]{0,80}?\b(mi-l|mi-o|inapoi|cititi|spuneti|dictati)\b/g, negatable: true },
    { code: 'RF_REMOTE_ACCESS', re: /\b(anydesk|teamviewer|team viewer|quicksupport|quick support|rustdesk|ultraviewer|supremo)\b|\b(instalati|instaleaza|descarcati)\b[^.!?]{0,60}\bde la distanta\b/g },
    { code: 'RF_DATA_REQUEST', re: /\bdatele (cardului|de card|bancare|de logare|contului|personale)\b|\b(numarul|nr\.?) (de )?card(ului)?\b|\bcnp\b|\bcod(ul)? pin\b|\bpin-ul\b|\bparola\b|\bcvv\b|\bcod(ul)? de securitate\b|\bpoza (cu|a) (buletin|cartea de identitate)|\b(intrati|logati-va|conectati-va) (in|pe) (contul|aplicatia) (de banca|bancii|bancar)/g, negatable: true },
    { code: 'RF_PAYMENT_REQUEST', re: /\b(achitati|achita|platiti|plateste|transfer|transferati|transfera|virament|depuneti|depozit|ridicati (banii|numerarul)|taxa de|o taxa|trimite(ti)?(-mi)? (bani|banii|suma))\b/g, negatable: true },
    { code: 'RF_NEW_NUMBER', re: /\b(numarul (meu )?nou|numar nou|noul (meu )?numar|mi-am schimbat numarul|mi s-a stricat telefonul|mi-am pierdut telefonul|asta e numarul|acesta e numarul)\b/g, unknownSenderOnly: true },
    { code: 'RF_SECRECY', re: /\bnu(-i| le| ii)? spune(ti)?\b(?![^.!?]{0,30}\bcod)|\bsa nu (stie|afle|spui|spuneti)\b|\bintre noi\b|\bsecretul nostru\b|\bnu (vorbiti|discutati) cu nimeni\b/g },
    { code: 'RF_TOO_GOOD', re: /\b(felicitari|ati castigat|ai castigat|castigatorul|castigatoarea|ati fost ales|ati fost aleasa|premiul|un premiu|tombola|garantat|garantata|profit|randament|bani usor|vesti bune|va creste cu|castig sigur)\b/g },
    { code: 'RF_URGENCY', re: /\b(urgent|urgenta|grabiti-va|grabeste-te|imediat|expira|ultima zi|ultima sansa|cat mai repede)\b/g },
    { code: 'RF_URGENCY', re: /\bin \d+ ?(h|ore|de ore|minute|de minute|zile)\b|\bintr-o ora\b|\bpana (la|in) \d|\bpana (azi|diseara|maine)\b|\bazi\b|\bastazi\b/g, weak: true },
    { code: 'RF_THREAT', re: /\b(blocat|blocata|blocam|suspendat|suspendata|amenda|inchisoare|dosar penal|executare silita|virusi|virus|virusat|compromis)\b/g },
    { code: 'RF_EMOTIONAL_PRESSURE', re: /\b(accident|spital|arestat|retinut|disperat|disperata|ajuta-ma|ajutati-ma|plang|e grav)\b/g },
    { code: 'RF_CHANNEL_SWITCH', re: /\b(telegram|signal|viber)\b|\b(vorbim|scrie-mi|scrieti-mi|continuam) pe\b/g }
  ];

  /* Claims to be an organisation that has no entry in the catalog. */
  var GENERIC_CLAIMS = [
    { kind: 'tech', re: /\b(suport(ul)? tehnic|microsoft|windows|apple support|departamentul it)\b/g },
    { kind: 'authority', re: /\b(politia|politist|politie|casa de pensii|ministerul|guvernul|primaria|dna|diicot|anpc|ghiseul)\b/g },
    { kind: 'bank', re: /\b(va sun|va contactam|va scriem|suntem) de la banca\b|\bdepartamentul de fraude\b/g },
    { kind: 'courier', re: /\b(fan courier|sameday|dhl|posta romana|cargus)\b/g }
  ];

  function allMatches(re, text) {
    var out = [];
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text))) {
      out.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
    return out;
  }
  function negated(text, start) {
    return /\b(nu|niciodata|nimanui)\b[^.!?]{0,25}$/.test(text.slice(Math.max(0, start - 30), start));
  }

  function contactsIn(f) {
    var found = [];
    allMatches(URL_RE, f).forEach(function (m) {
      var raw = f.slice(m.start, m.end).replace(/[.,;:!?)]+$/, '');
      found.push({ start: m.start, end: m.start + raw.length, official: isOfficialHost(hostOf(raw)) });
    });
    allMatches(EMAIL_RE, f).forEach(function (m) {
      var host = f.slice(m.start, m.end).split('@')[1];
      found.push({ start: m.start, end: m.end, official: isOfficialHost(host) });
    });
    allMatches(PHONE_RE, f).forEach(function (m) {
      found.push({ start: m.start, end: m.end, official: isOfficialPhone(f.slice(m.start, m.end)) });
    });
    return found;
  }

  function senderIsOrg(sender, org) {
    var id = squash(sender.name) + ' ' + squash(sender.address);
    if (id.indexOf(org.key) >= 0) return true;
    var at = (sender.address || '').split('@')[1];
    return !!at && hostOf(fold(at)) === org.site;
  }

  /* ---------- Main ---------- */

  function normalizeScenario(s) {
    var sender = s.sender || {};
    var msgs = Array.isArray(s.messages) ? s.messages : [];
    return {
      id: s.id != null ? String(s.id) : '',
      channel: s.channel || 'sms',
      sender: { name: sender.name || null, address: sender.address || null, known_contact: sender.known_contact === true },
      messages: msgs.map(function (m, i) {
        return { n: typeof m.n === 'number' ? m.n : i + 1, from: m.from === 'reader' ? 'reader' : 'sender', text: typeof m.text === 'string' ? m.text : '' };
      })
    };
  }

  function analyze(input) {
    var sc = normalizeScenario(input);
    var sender = sc.sender;
    var senderText = fold((sender.name || '') + ' ' + (sender.address || ''));

    // Pass 1: raw findings per message.
    var per = sc.messages.map(function (m) {
      var f = fold(m.text);
      var item = { n: m.n, from: m.from, text: m.text, spans: [], codes: {}, claims: [] };
      if (m.from !== 'sender' || !f.trim()) return item;

      RULES.forEach(function (rule) {
        if (rule.unknownSenderOnly && sender.known_contact) return;
        allMatches(rule.re, f).forEach(function (sp) {
          if (rule.negatable && negated(f, sp.start)) return;
          item.spans.push({ code: rule.code, start: sp.start, end: sp.end, weak: !!rule.weak });
        });
      });

      item.contacts = contactsIn(f);
      item.contacts.forEach(function (c) {
        if (!c.official) item.spans.push({ code: 'RF_SUSPICIOUS_CONTACT', start: c.start, end: c.end });
      });

      ORGS.forEach(function (o) {
        allMatches(o.re, f).forEach(function (sp) { item.claims.push({ org: o, kind: o.kind, start: sp.start, end: sp.end }); });
      });
      GENERIC_CLAIMS.forEach(function (gc) {
        allMatches(gc.re, f).forEach(function (sp) { item.claims.push({ org: null, kind: gc.kind, start: sp.start, end: sp.end }); });
      });
      return item;
    });

    var firstSender = per.filter(function (p) { return p.from === 'sender'; })[0];

    // Sender-level evidence, credited to the first sender message (no highlight span).
    var senderEmail = (sender.address || '').indexOf('@') > 0;
    var senderUnofficial = senderEmail && !isOfficialHost(hostOf(fold(sender.address.split('@')[1])));
    var senderClaims = [];
    ORGS.forEach(function (o) {
      // A name that presents itself as the organisation ("ANAF Rambursări"), not one that only mentions it ("Cumpărător PiațaMea").
      if (squash(sender.name).indexOf(o.key) === 0) senderClaims.push({ org: o, kind: o.kind });
    });
    if (firstSender) {
      if (senderUnofficial) firstSender.spans.push({ code: 'RF_SUSPICIOUS_CONTACT', start: -1, end: -1 });
      senderClaims.forEach(function (c) { firstSender.claims.push(c); });
    }

    var threadHasUnofficial = senderUnofficial || per.some(function (p) { return (p.contacts || []).some(function (c) { return !c.official; }); });
    var threadHasRequest = per.some(function (p) { return p.spans.some(function (s) { return REQUEST_FLAGS.indexOf(s.code) >= 0; }); });

    // Pass 2: decide impersonation and weak urgency per message.
    per.forEach(function (p) {
      p.claims.forEach(function (c) {
        var genuine = c.org && senderIsOrg(sender, c.org) && !threadHasUnofficial && !threadHasRequest;
        if (!genuine) p.spans.push({ code: 'RF_IMPERSONATION', start: c.start != null ? c.start : -1, end: c.end != null ? c.end : -1 });
      });
      var hasRequestHere = p.spans.some(function (s) { return REQUEST_FLAGS.indexOf(s.code) >= 0 || s.code === 'RF_SUSPICIOUS_CONTACT'; });
      p.spans = p.spans.filter(function (s) { return !s.weak || hasRequestHere; });
      p.spans.sort(function (a, b) { return a.start - b.start; });
    });

    // Pass 3: score the thread as a story; each flag counts once.
    var counted = {};
    var score = 0;
    var firstAlert = null;
    var messages = per.map(function (p) {
      var fresh = [];
      p.spans.forEach(function (s) {
        if (!counted[s.code]) { counted[s.code] = p.n; fresh.push(s.code); score += POINTS[s.code] || 0; }
      });
      var capped = Math.min(100, score);
      if (firstAlert === null && capped >= 25) firstAlert = p.n;
      return {
        n: p.n, from: p.from, text: p.text,
        flags: fresh,
        spans: p.spans.filter(function (s) { return s.start >= 0; }).map(function (s) { return { code: s.code, start: s.start, end: s.end }; }),
        score: capped
      };
    });

    score = Math.min(100, score);
    var verdict = score >= 50 ? 'SCAM' : score >= 25 ? 'SUSPICIOUS' : 'SAFE';
    var flags = Object.keys(counted).sort(function (a, b) { return counted[a] - counted[b] || POINTS[b] - POINTS[a]; });

    var allClaims = per.reduce(function (acc, p) { return acc.concat(p.claims); }, []);
    var ctx = {
      sc: sc, flags: counted, claims: allClaims,
      text: fold(sc.messages.filter(function (m) { return m.from === 'sender'; }).map(function (m) { return m.text; }).join(' \n ') + ' ' + senderText)
    };
    var scamType = verdict === 'SAFE' ? 'NONE' : classify(ctx);
    var org = pickOrg(allClaims, scamType);

    return {
      id: sc.id,
      channel: sc.channel,
      sender: sc.sender,
      verdict: verdict,
      scamType: scamType,
      score: score,
      firstAlert: verdict === 'SAFE' ? null : firstAlert,
      flags: flags,
      messages: messages,
      org: org ? { name: org.name, site: org.site, phone: org.phone, kind: org.kind } : null,
      familyName: familyName(sc),
      engine: 'rules'
    };
  }

  function hasKind(claims, kind) { return claims.some(function (c) { return c.kind === kind; }); }

  function classify(ctx) {
    var f = ctx.flags, t = ctx.text, c = ctx.claims;
    if (f.RF_REMOTE_ACCESS || hasKind(c, 'tech')) return 'TECH_SUPPORT';
    if (hasKind(c, 'authority')) return 'AUTHORITY_IMPERSONATION';
    if (hasKind(c, 'bank')) return 'BANK_IMPERSONATION';
    if (hasKind(c, 'courier') || /\b(coletul|colet|awb|livrare a coletului)\b/.test(t) && f.RF_PAYMENT_REQUEST) return 'COURIER_FEE';
    if (f.RF_NEW_NUMBER || /\b(mami|mama|tati|bunico|bunicule|mamaie|tataie)\b/.test(t) && (f.RF_PAYMENT_REQUEST || f.RF_EMOTIONAL_PRESSURE)) return 'FAMILY_EMERGENCY';
    if (hasKind(c, 'marketplace') || /\b(cumparator|o iau|mai este disponibil|mai e disponibil|livrare sigura|ca sa primiti banii|piatamea)\b/.test(t)) return 'MARKETPLACE';
    if (/\b(crypto|bitcoin|investiti|investitie|tranzactionare|randament|profit garantat|platforma de investitii)\b/.test(t)) return 'INVESTMENT';
    if (/\b(job|loc de munca|lucru de acasa|like-uri|aprecieri|sarcini|task|comision)\b/.test(t)) return 'JOB_OFFER';
    if (/\b(iubirea mea|dragul meu|draga mea|te iubesc|sufletul meu)\b/.test(t)) return 'ROMANCE';
    if (f.RF_TOO_GOOD) return 'PRIZE_LOTTERY';
    if (f.RF_CODE_REQUEST) return 'ACCOUNT_TAKEOVER';
    return 'OTHER';
  }

  function pickOrg(claims, type) {
    var want = { BANK_IMPERSONATION: 'bank', COURIER_FEE: 'courier', AUTHORITY_IMPERSONATION: 'authority', MARKETPLACE: 'marketplace' }[type];
    var withOrg = claims.filter(function (c) { return c.org; });
    var match = withOrg.filter(function (c) { return !want || c.kind === want; })[0] || withOrg[0];
    if (match) return match.org;
    if (type === 'MARKETPLACE') return ORGS.filter(function (o) { return o.kind === 'marketplace'; })[0] || null;
    return null;
  }

  /* "Eu, Andrei" in the thread, or the saved contact's first name. */
  function familyName(sc) {
    for (var i = 0; i < sc.messages.length; i++) {
      var m = sc.messages[i];
      if (m.from !== 'sender') continue;
      var r = /(?:^|[^A-Za-z])(?:[Ee]u|[Ss]unt)\s*,?\s+([A-ZĂÂÎȘȚŞŢ][a-zăâîșțşţ]+)/.exec(m.text);
      if (r) return r[1];
    }
    if (sc.sender.known_contact && sc.sender.name) return sc.sender.name.split(/[\s(]/)[0];
    return null;
  }

  g.SSDetector = { analyze: analyze, normalizeScenario: normalizeScenario, fold: fold, ORGS: ORGS };
})(typeof window !== 'undefined' ? window : globalThis);
