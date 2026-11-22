/*
 * Turns whatever the user gives us into a scenario in the brief's JSON format:
 * pasted text (one message, a WhatsApp copy, "Eu:" lines, an e-mail), a .json file,
 * or the expected-results CSV for the self-check.
 */
(function (g) {
  'use strict';

  // "[19.11.2026, 10:02] Andrei: text"  or  "19.11.2026, 10:02 - Andrei: text"
  var WA_LINE = /^‎?\[?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?)\]?\s*(?:-\s*)?([^:\n]{1,40}?):\s?(.*)$/;
  var ROLE_LINE = /^(eu|me|reader|cititor|dumneavoastră|dumneavoastra|el|ea|ei|sender|expeditor|necunoscut|apelant)\s*:\s*(.*)$/i;
  var READER_ROLES = /^(eu|me|reader|cititor|dumneavoastră|dumneavoastra)$/i;

  function emptyScenario(id, channel, known) {
    return { id: id, channel: channel, sender: { name: null, address: null, known_contact: !!known }, messages: [] };
  }

  function fromWhatsApp(lines, known) {
    var sc = emptyScenario('TEXT', 'whatsapp', known);
    var first = null;
    lines.forEach(function (line) {
      var m = WA_LINE.exec(line);
      if (m) {
        var who = m[3].trim();
        if (first === null && !READER_ROLES.test(who)) first = who;
        sc.messages.push({ who: who, text: m[4] });
      } else if (sc.messages.length && line.trim()) {
        sc.messages[sc.messages.length - 1].text += '\n' + line;
      }
    });
    // The first author is the one who wrote to the reader; anyone else is the reader.
    sc.sender.name = first;
    sc.messages = sc.messages.map(function (m, i) {
      return { n: i + 1, from: m.who === first ? 'sender' : 'reader', text: m.text.trim() };
    }).filter(function (m) { return m.text && !/^<(media omitted|fișier media omis|mesaj șters)>$/i.test(m.text); });
    sc.messages.forEach(function (m, i) { m.n = i + 1; });
    return sc;
  }

  function fromRoles(lines, known, channel) {
    var sc = emptyScenario('TEXT', channel || 'chat', known);
    lines.forEach(function (line) {
      var m = ROLE_LINE.exec(line.trim());
      if (m) sc.messages.push({ n: sc.messages.length + 1, from: READER_ROLES.test(m[1]) ? 'reader' : 'sender', text: m[2] });
      else if (sc.messages.length && line.trim()) sc.messages[sc.messages.length - 1].text += '\n' + line.trim();
      else if (line.trim()) sc.messages.push({ n: sc.messages.length + 1, from: 'sender', text: line.trim() });
    });
    return sc;
  }

  function fromEmail(text, known) {
    var sc = emptyScenario('TEXT', 'email', known);
    var from = /^(?:from|de la|de)\s*:\s*(.+)$/im.exec(text);
    if (from) {
      var addr = /<([^>]+)>/.exec(from[1]) || /([^\s<>]+@[^\s<>]+)/.exec(from[1]);
      sc.sender.address = addr ? addr[1].trim() : null;
      sc.sender.name = from[1].replace(/<[^>]*>/, '').replace(/"/g, '').trim() || null;
      if (sc.sender.name === sc.sender.address) sc.sender.name = null;
    }
    var split = text.split(/\r?\n\s*\r?\n/);
    var body = split.length > 1 ? split.slice(1).join('\n\n') : text.replace(/^(from|de la|de|to|către|subject|subiect|date|data)\s*:.*$/gim, '');
    sc.messages.push({ n: 1, from: 'sender', text: body.trim() });
    return sc;
  }

  function looksLikeScenario(o) { return o && typeof o === 'object' && Array.isArray(o.messages); }

  /* Returns { scenario, detected } or null for empty input. */
  function parsePasted(text, opts) {
    opts = opts || {};
    var t = (text || '').replace(/\r\n?/g, '\n').trim();
    if (!t) return null;

    if (t.charAt(0) === '{') {
      try {
        var o = JSON.parse(t);
        if (looksLikeScenario(o)) return { scenario: o, detected: { kind: 'json', channel: o.channel, count: o.messages.length } };
      } catch (e) { /* not JSON: read it as text */ }
    }

    var lines = t.split('\n');
    var waCount = lines.filter(function (l) { return WA_LINE.test(l); }).length;
    if (waCount >= 1) {
      var wa = fromWhatsApp(lines, opts.known);
      if (wa.messages.length) return { scenario: wa, detected: { kind: 'whatsapp', channel: 'whatsapp', count: wa.messages.length, senderName: wa.sender.name } };
    }

    if (lines.filter(function (l) { return ROLE_LINE.test(l.trim()); }).length >= 2) {
      var ro = fromRoles(lines, opts.known, opts.channel);
      return { scenario: ro, detected: { kind: 'roles', channel: ro.channel, count: ro.messages.length } };
    }

    if (/^(from|de la|de)\s*:/im.test(t) && /^(subject|subiect)\s*:/im.test(t)) {
      var em = fromEmail(t, opts.known);
      return { scenario: em, detected: { kind: 'email', channel: 'email', count: 1, senderAddress: em.sender.address } };
    }

    var single = emptyScenario('TEXT', opts.channel || 'sms', opts.known);
    single.messages.push({ n: 1, from: 'sender', text: t });
    return { scenario: single, detected: { kind: 'single', channel: single.channel, count: 1 } };
  }

  /* Reads a scenario .json File. Rejects with a Romanian message the UI can show. */
  function readScenarioFile(file) {
    return file.text().then(function (txt) {
      var o;
      try { o = JSON.parse(txt.replace(/^﻿/, '')); } catch (e) { throw new Error('nu este un fișier JSON valid'); }
      if (!o || typeof o !== 'object') throw new Error('nu conține un scenariu');
      if (!Array.isArray(o.messages)) throw new Error('lipsește câmpul „messages”');
      if (!o.id) o.id = file.name.replace(/\.json$/i, '');
      return o;
    });
  }

  function parseExpectedCsv(text) {
    var lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
    var cols = lines.shift().split(',').map(function (c) { return c.trim(); });
    var map = {};
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var v = line.split(',');
      var row = {};
      cols.forEach(function (c, i) { row[c] = (v[i] || '').trim(); });
      if (row.id) map[row.id] = row;
    });
    return map;
  }

  /* Compares one result with its expected row; returns a list of differences. */
  function compare(result, exp) {
    var got = {
      verdict: result.verdict,
      scam_type: result.scamType,
      risk_score: String(result.score),
      first_alert: result.firstAlert == null ? '' : String(result.firstAlert),
      red_flags: result.flags.slice().sort().join(';')
    };
    var want = {
      verdict: exp.verdict, scam_type: exp.scam_type, risk_score: exp.risk_score, first_alert: exp.first_alert,
      red_flags: (exp.red_flags || '').split(';').filter(Boolean).sort().join(';')
    };
    var labels = { verdict: 'Verdict', scam_type: 'Scam type', risk_score: 'Risk score', first_alert: 'First alert', red_flags: 'Red flags' };
    return Object.keys(got).filter(function (k) { return got[k] !== want[k]; }).map(function (k) {
      return { field: labels[k], got: got[k] || '—', want: want[k] || '—' };
    });
  }

  function toCsv(results) {
    var rows = results.slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }); });
    return ['id,verdict,scam_type,risk_score,first_alert,red_flags'].concat(rows.map(function (r) {
      return [r.id, r.verdict, r.scamType, r.score, r.firstAlert == null ? '' : r.firstAlert, r.flags.join(';')].join(',');
    })).join('\n') + '\n';
  }

  g.SSParse = { parsePasted: parsePasted, readScenarioFile: readScenarioFile, parseExpectedCsv: parseExpectedCsv, compare: compare, toCsv: toCsv };
})(typeof window !== 'undefined' ? window : globalThis);
