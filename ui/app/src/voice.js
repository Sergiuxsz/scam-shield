/*
 * The cat's voice in the browser (web app, mobile, and the desktop's fallback).
 * Always a Romanian voice, and a female one whenever the device has one:
 *   iPhone/iPad: "Ioana"; Edge (Windows, Android): "Alina Online (Natural)";
 *   Android (Google): the Romanian voice is female but its name says nothing, so any non-male voice is preferred.
 *
 *   SSVoice.pick()                          → the voice to use, or null
 *   SSVoice.speak(text, { onStart, onProgress(charIndex), onEnd }) → { stop() }
 */
(function (g) {
  'use strict';
  var FEMALE = /(alina|ioana|carmen|ana\b|female|femeie|feminin)/i;
  var MALE = /(andrei|emil|\bmale\b|bărbat|masculin)/i;
  var NATURAL = /(natural|neural|online|premium|enhanced)/i;

  function pick() {
    var ss = g.speechSynthesis;
    if (!ss) return null;
    var ro = ss.getVoices().filter(function (v) { return /^ro/i.test(v.lang); });
    if (!ro.length) return null;
    var rank = function (v) { return (FEMALE.test(v.name) ? 4 : MALE.test(v.name) ? 0 : 2) + (NATURAL.test(v.name) ? 1 : 0); };
    return ro.slice().sort(function (a, b) { return rank(b) - rank(a); })[0];
  }

  function isFemale(v) { return !!v && !MALE.test(v.name); }

  function speak(text, cb) {
    var ss = g.speechSynthesis;
    var ctl = { stopped: false, timer: null };
    ctl.stop = function () { ctl.stopped = true; clearInterval(ctl.timer); if (ss) ss.cancel(); };
    if (!ss) { setTimeout(cb.onEnd, 0); return ctl; }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ro-RO';
    var v = pick();
    if (v) u.voice = v;
    u.rate = 0.9;
    var got = false, started = false, t0 = 0;
    u.onboundary = function (e) { got = true; if (cb.onProgress) cb.onProgress(e.charIndex); };
    u.onstart = function () {
      started = true; t0 = Date.now(); if (cb.onStart) cb.onStart();
      // Some voices report no word positions: then follow the speech by time.
      ctl.timer = setInterval(function () { if (!got && cb.onProgress) cb.onProgress((Date.now() - t0) / 1000 * 13); }, 250);
    };
    u.onend = u.onerror = function () { clearInterval(ctl.timer); cb.onEnd(); };
    ss.cancel();
    ss.speak(u);
    // With no usable voice the speech can stay queued forever: give up after 2.5 s.
    setTimeout(function () { if (!started && !ctl.stopped) { ss.cancel(); cb.onEnd(); } }, 2500);
    return ctl;
  }

  // Voices load asynchronously in Chrome; touch the list early so pick() has it later.
  if (g.speechSynthesis) { g.speechSynthesis.getVoices(); g.speechSynthesis.onvoiceschanged = function () { g.speechSynthesis.getVoices(); }; }

  g.SSVoice = { pick: pick, speak: speak, isFemale: isFemale };
})(typeof window !== 'undefined' ? window : globalThis);
