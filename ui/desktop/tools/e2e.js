/*
 * Automated walk-through of the alert flow, for testing only.
 * Loaded by main.js when SCAM_SHIELD_E2E=<folder> is set. After the first scam alert it:
 *   1. waits for the cascade to finish and saves the island,
 *   2. presses ▶ Ascultă and saves the island while it speaks,
 *   3. presses Vezi tot and saves the full-screen pane,
 * and writes the speech voices available on this computer to voices.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function e2e({ pill, getPane, dir }) {
  fs.mkdirSync(dir, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (win, name) => fs.writeFileSync(path.join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const run = (win, js) => win.webContents.executeJavaScript(js, true);
  let started = false;

  return async function onAlert() {
    if (started) return;
    started = true;
    try {
      const voices = await run(pill, 'new Promise(r => { const v = speechSynthesis.getVoices(); if (v.length) r(v); else speechSynthesis.onvoiceschanged = () => r(speechSynthesis.getVoices()); setTimeout(() => r(speechSynthesis.getVoices()), 2000); }).then(v => v.map(x => x.name + " | " + x.lang))');
      fs.writeFileSync(path.join(dir, 'voices.json'), JSON.stringify(voices, null, 2));
      await wait(250); await shot(pill, 'e2e-1-cascading');
      await wait(3600); await shot(pill, 'e2e-2-cascade-done');
      await run(pill, '(function () { window.__trace = []; var A0 = window.Audio; window.Audio = function (u) { var a = new A0(u); ["play", "playing", "pause", "ended", "error"].forEach(function (e) { a.addEventListener(e, function () { window.__trace.push(e + "@" + a.currentTime.toFixed(1) + "/" + a.duration); }); }); return a; }; var P0 = window.ShieldVoice.play; window.ShieldVoice.play = function (t, cb) { var c = P0(t, cb); var s0 = c.stop; c.stop = function () { window.__trace.push("stop from: " + new Error().stack.split("\\n").slice(2, 5).join(" | ")); return s0(); }; return c; }; document.querySelector(".btn-play").click(); return true; })()');
      const samples = [];
      for (let i = 0; i < 12; i++) { await wait(500); samples.push(await run(pill, '(document.querySelector(".btn-play.is-playing") ? "P" : "-") + [...document.querySelectorAll(".reasons li")].findIndex(li => li.classList.contains("is-spoken"))')); }
      fs.writeFileSync(path.join(dir, 'samples.json'), JSON.stringify({ samples, trace: await run(pill, 'window.__trace') }));
      const ticks = await run(pill, 'new Promise(r => { let n = 0; const id = setInterval(() => n++, 100); setTimeout(() => { clearInterval(id); r(n); }, 1000); })');
      await wait(3500); await shot(pill, 'e2e-3-playing');
      const spoken = await run(pill, 'JSON.stringify({ timerTicksPerSecond: ' + ticks + ', speaking: speechSynthesis.speaking, pending: speechSynthesis.pending, playing: !!document.querySelector(".btn-play.is-playing"), spokenReason: [...document.querySelectorAll(".reasons li")].findIndex(li => li.classList.contains("is-spoken")), catTalking: !!document.querySelector(".is-talking") })');
      fs.writeFileSync(path.join(dir, 'playing.json'), spoken);
      await run(pill, 'document.querySelector(".btn-more").click()');
      await wait(1500); await shot(getPane(), 'e2e-4-full');
      await shot(pill, 'e2e-5-pill-after');
      fs.writeFileSync(path.join(dir, 'done.txt'), 'ok');
    } catch (e) {
      fs.writeFileSync(path.join(dir, 'error.txt'), String(e && e.stack || e));
    }
  };
};
