/*
 * The cat's voice on the desktop. The main process makes the audio (shield:tts):
 *   1. Azure "Alina" (female, natural) when an Azure Speech key is configured;
 *   2. otherwise the Windows Romanian voice, a female one if installed (Windows ships only "Andrei", male);
 * and if neither works, the browser speech (app/src/voice.js), which also prefers a female voice.
 *   ShieldVoice.prepare(text) → start making the audio now, so ▶ plays instantly
 *   ShieldVoice.play(text, { onStart, onProgress(charIndex), onEnd }) → { stop() }
 */
(function () {
  'use strict';
  var cache = {};

  function prepare(text) {
    if (!window.shield || !window.shield.tts) return Promise.resolve(null);
    if (!cache[text]) cache[text] = window.shield.tts(text).then(function (r) { return r && r.url ? r.url : null; }).catch(function () { return null; });
    return cache[text];
  }

  function play(text, cb) {
    var ctl = { stopped: false, audio: null, inner: null };
    ctl.stop = function () {
      ctl.stopped = true;
      if (ctl.audio) ctl.audio.pause();
      if (ctl.inner) ctl.inner.stop();
    };
    function fallback() { if (!ctl.stopped) ctl.inner = window.SSVoice.speak(text, cb); }
    prepare(text).then(function (url) {
      if (ctl.stopped) return;
      if (!url) { fallback(); return; }
      var audio = ctl.audio = new Audio(url);
      // The voice speaks at an even pace, so the playback position tells which sentence is being said.
      audio.ontimeupdate = function () { if (audio.duration && cb.onProgress) cb.onProgress(audio.currentTime / audio.duration * text.length); };
      audio.onended = function () { cb.onEnd(); };
      audio.onerror = fallback;
      audio.play().then(function () { if (cb.onStart) cb.onStart(); }).catch(fallback);
    });
    return ctl;
  }

  window.ShieldVoice = { prepare: prepare, play: play };
})();
