// Scam Shield pitch deck. Run:  SKILL=<pptx skill dir> node build_deck.js
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require(process.env.SKILL + '/scripts/apply_theme.js');

// Palette = the app's own design tokens (the cat's outline, fur, collar; the verdict colours).
const HEX = { ink: '1D2B2A', ink2: '2E3F3D', white: 'FFFFFF', tint: 'F1F5F4', teal: '1F7A8C', red: 'C4161C',
  green: '2E7D4F', amber: 'D98E1F', grey: '6B7C7A', cream: 'F6F1E7' };
const THEME = { name: 'Scam Shield', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.ink, lt1: HEX.white, dk2: HEX.ink2, lt2: HEX.tint, accent1: HEX.teal, accent2: HEX.red,
            accent3: HEX.green, accent4: HEX.amber, accent5: HEX.grey, accent6: HEX.cream, hlink: HEX.teal, folHlink: HEX.grey } };

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';                    // 10 x 5.625 in
pres.theme = { headFontFace: 'Calibri', bodyFontFace: 'Calibri' };
pres.title = 'Scam Shield';
const C = pres.SchemeColor;
const CAT = (n) => path.join(__dirname, 'cat', `cat_${n}.png`);
const CAT_RATIO = { full: 76 / 64, head: 1, head_sign: 54 / 62 };

pres.defineSlideMaster({ title: 'DARK', background: { color: C.text1 }, objects: [
  { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.55, w: 5.6, h: 1.3, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
  { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 3.0, w: 5.4, h: 1.2, fontSize: 18, color: C.accent6, valign: 'top', align: 'left', margin: 0 }, text: '' } } ] });
pres.defineSlideMaster({ title: 'LIGHT', background: { color: C.background1 },
  slideNumber: { x: 9.25, y: 5.2, w: 0.4, h: 0.25, fontSize: 10, color: C.accent5 }, objects: [
  { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.35, w: 8.0, h: 0.75, fontSize: 30, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } } ] });

// ---------------- helpers ----------------
function slide(section, master, title, notes) {
  if (!slide.seen.has(section)) { pres.addSection({ title: section }); slide.seen.add(section); }
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  s.addText(title, { placeholder: 'title' });
  s.addNotes(notes);
  return s;
}
slide.seen = new Set();
function cat(s, name, x, y, w, alt) {
  const kind = name.endsWith('head_sign') ? 'head_sign' : name.endsWith('head') ? 'head' : 'full';
  s.addImage({ path: CAT(name), x, y, w, h: w * CAT_RATIO[kind], altText: alt || 'Scam Shield cat, ' + name.replace('_', ' ') });
}
function card(s, x, y, w, h, fill) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill || C.background2 }, line: { type: 'none' },
    shadow: { type: 'outer', color: '1D2B2A', opacity: 0.12, blur: 6, offset: 2, angle: 90 } });
}
function text(s, t, o) { s.addText(t, Object.assign({ isTextBox: true, margin: 0, fontSize: 14, color: C.text2, valign: 'top' }, o)); }
function dot(s, x, y, d, fill, label) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' } });
  if (label) text(s, label, { x, y, w: d, h: d, fontSize: 13, bold: true, color: C.background1, align: 'center', valign: 'middle' });
}
function stat(s, x, y, w, big, small, color) {
  text(s, big, { x, y, w, h: 0.75, fontSize: 40, bold: true, color: color || C.accent1, valign: 'bottom' });
  text(s, small, { x, y: y + 0.8, w, h: 0.55, fontSize: 12, color: C.accent5 });
}
function bullets(s, items, o) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: 6 } })),
    Object.assign({ isTextBox: true, margin: 0, fontSize: 15, color: C.text2, valign: 'top' }, o));
}

// ---------------- 1. Opening ----------------
let s = slide('Opening', 'DARK', 'Scam Shield', 'Hook: one sentence on the problem, then who we are (15 s).');
s.addText('Calm, clear scam warnings for people who never heard the word "phishing"', { placeholder: 'body' });
dot(s, 6.15, 0.95, 3.4, C.text2);
cat(s, 'idle_full', 6.75, 1.3, 2.2, 'Scam Shield cat, relaxed');
text(s, 'Echipa Surpriza · R Systems × EESTEC LC Bucharest · Hackathon 2026', { x: 0.6, y: 4.85, w: 6, h: 0.3, fontSize: 11, color: C.accent5 });

// ---------------- 2. Problem ----------------
s = slide('Problem', 'LIGHT', 'Scams arrive looking like normal messages', 'Who we protect and why keyword alarms fail (20 s).');
const msgs = [['WhatsApp · număr nou', '"Bună mami, mi s-a stricat telefonul, ăsta e numărul nou"', 'It looks harmless at first. The money request comes at message 5.', C.accent4],
  ['SMS · BancaDunarea', '"Cardul dvs. a fost blocat. Accesați în 24h: bancadunarea-securitate.com"', 'It looks official. Only the link gives it away.', C.accent2],
  ['SMS · BancaDunarea', '"Codul de confirmare este 482913. Nu comunicați acest cod nimănui."', 'This one is real. A false alarm here teaches people to ignore us.', C.accent3]];
msgs.forEach(([h, q, why, col], i) => {
  const x = 0.5 + i * 2.75; card(s, x, 1.45, 2.5, 3.0);
  dot(s, x + 0.2, 1.65, 0.22, col);
  text(s, h, { x: x + 0.5, y: 1.6, w: 1.9, h: 0.3, fontSize: 11, bold: true, color: C.accent5 });
  text(s, q, { x: x + 0.2, y: 2.05, w: 2.1, h: 1.45, fontSize: 13, italic: true, color: C.text1 });
  text(s, why, { x: x + 0.2, y: 3.6, w: 2.1, h: 0.75, fontSize: 12, color: C.accent5 });
});
text(s, 'We protect a 72-year-old who reads messages on a phone and must decide in seconds.', { x: 0.5, y: 4.7, w: 7.6, h: 0.35, fontSize: 14, bold: true, color: C.text1 });
cat(s, 'suspicious_full', 8.6, 3.85, 0.95);

// ---------------- 3. Approach ----------------
s = slide('Approach', 'LIGHT', 'Three layers, one official score', 'Overview before the deep dives (20 s). All local: nothing leaves the laptop.');
const layers = [['1', 'Rules', 'Rules check the facts we can verify exactly. They compare links and numbers with the official catalog.'],
  ['2', 'Fine-tuned encoders', 'The encoders read intent, even in new wording. They flag 13 red flags per message and name the scam type.'],
  ['3', 'Official formula', 'The official points give the risk score and the verdict. The reader gets a 3-sentence warning in Romanian.']];
layers.forEach(([n, h, d], i) => {
  const x = 0.5 + i * 3.05; card(s, x, 1.5, 2.75, 2.55);
  dot(s, x + 0.25, 1.75, 0.5, i === 2 ? C.accent2 : C.accent1, n);
  text(s, h, { x: x + 0.25, y: 2.4, w: 2.3, h: 0.4, fontSize: 18, bold: true, color: C.text1 });
  text(s, d, { x: x + 0.25, y: 2.85, w: 2.3, h: 1.1, fontSize: 13 });
  if (i < 2) text(s, '→', { x: x + 2.78, y: 2.5, w: 0.25, h: 0.4, fontSize: 22, bold: true, color: C.accent1, align: 'center' });
});
card(s, 0.5, 4.35, 8.85, 0.65, C.text1);
text(s, 'Everything runs on this laptop. No message reaches the cloud, and the same input always gets the same answer.', { x: 0.75, y: 4.35, w: 8.4, h: 0.65, fontSize: 15, bold: true, color: C.background1, valign: 'middle' });

// ---------------- 4. Rules: coverage ----------------
s = slide('Rules', 'LIGHT', 'Rules: what they cover', 'Why rules: precise, explainable, and a fake domain cannot fool a catalog lookup (30 s).');
const rulesCover = [['Links & numbers', 'We check every link, e-mail and phone number against the official catalog.'],
  ['Requests', 'We catch requests for codes, card data, money or AnyDesk. A warning is not a request.'],
  ['Who it claims to be', 'We detect when a message claims to be a bank, a courier, ANAF or the police.'],
  ['Signs of a genuine message', 'Phrases like "nu este necesară nicio acțiune" mark a real notice.'],
  ['Metadata', 'We use the sender data. A "new number" only matters when the sender is not a saved contact.']];
rulesCover.forEach(([h, d], i) => {
  const col = i < 3 ? 0 : 1, row = i < 3 ? i : i - 3, x = 0.5 + col * 4.55, y = 1.4 + row * 1.15;
  card(s, x, y, 4.3, 1.0);
  dot(s, x + 0.2, y + 0.27, 0.45, C.accent1, String(i + 1));
  text(s, h, { x: x + 0.85, y: y + 0.15, w: 3.3, h: 0.3, fontSize: 15, bold: true, color: C.text1 });
  text(s, d, { x: x + 0.85, y: y + 0.47, w: 3.3, h: 0.5, fontSize: 12 });
});
text(s, 'All the words and patterns live in one file. We can tune the rules without touching the code.', { x: 5.05, y: 4.0, w: 4.3, h: 0.6, fontSize: 13, italic: true, color: C.accent5 });

// ---------------- 5. Rules: process ----------------
s = slide('Rules', 'LIGHT', 'Rules alone were not enough', 'The overfitting story (25 s).');
card(s, 0.5, 1.45, 2.8, 2.2); stat(s, 0.75, 1.6, 2.4, '30/30', 'We wrote the rules from the 11 validation examples. They scored perfectly there.', C.accent3);
card(s, 3.5, 1.45, 2.8, 2.2); stat(s, 3.75, 1.6, 2.4, '15/30', 'On 300 conversations they had never seen, they missed 58 scams.', C.accent2);
bullets(s, ['When a rule fires, it is almost always right.', 'New wording slips past them.', 'So rules became our first layer, not the whole detector.', 'Every later fix came from errors on a separate dev set.'], { x: 6.6, y: 1.5, w: 2.9, h: 2.4, fontSize: 14 });
card(s, 0.5, 3.95, 8.85, 0.85, C.background2);
text(s, 'Our lesson: a perfect score on the examples you built from only proves the code runs. It does not prove it generalises.', { x: 0.75, y: 3.95, w: 8.4, h: 0.85, fontSize: 15, bold: true, color: C.text1, valign: 'middle' });

// ---------------- 6. Data: synthetic ----------------
s = slide('Data', 'LIGHT', 'Our synthetic training data', 'How the data was made and how we kept the evaluation honest (30 s).');
[['1,700', 'conversations to train on'], ['300', 'conversations kept aside to test'], ['26%', 'real messages that contain scam words'], ['129', 'test conversations with no shared templates']]
  .forEach(([b, t], i) => { card(s, 0.5 + i * 2.25, 1.4, 2.05, 1.45); stat(s, 0.7 + i * 2.25, 1.45, 1.75, b, t, i === 3 ? C.accent2 : C.accent1); });
bullets(s, ['Each conversation was generated from a recipe: scam type, verdict, channel, sender and diacritics. Every message carries the official flags.',
  'The test set uses wording held back from training. It also has near-identical safe and scam pairs.'], { x: 0.5, y: 3.1, w: 4.6, h: 1.8, fontSize: 13 });
card(s, 5.35, 3.1, 4.0, 1.75, C.background2);
text(s, 'Our leak audit', { x: 5.55, y: 3.22, w: 3.6, h: 0.3, fontSize: 14, bold: true, color: C.text1 });
text(s, 'We found 931 training conversations that reused test sentences. So we report only the 129 clean ones, and we split dev by template.', { x: 5.55, y: 3.55, w: 3.6, h: 1.2, fontSize: 12 });

// ---------------- 7. Data: hand-crafted ----------------
s = slide('Data', 'LIGHT', 'Hand-crafted entries', 'Why human-written data matters: it is the closest thing to the jury’s test set (20 s).');
card(s, 0.5, 1.4, 5.6, 2.85);
bullets(s, ['[Placeholder] Our team wrote about 20 scenarios by hand.', 'They read like real messages: no diacritics, typos, emoji and new stories.',
  'Each one was labelled with the official points by a different teammate.', 'We used them only to test, never to train or tune.'], { x: 0.75, y: 1.65, w: 5.1, h: 3.0, fontSize: 15 });
cat(s, 'checking_full', 6.9, 1.3, 2.1, 'Scam Shield cat, checking');
text(s, '[Result on the hand-crafted set]', { x: 6.5, y: 4.0, w: 2.9, h: 0.4, fontSize: 13, bold: true, color: C.accent1, align: 'center' });

// ---------------- 8. Encoder: why ----------------
s = slide('Encoder', 'LIGHT', 'Why an encoder fits this problem', 'Why an encoder and not a chatbot: the official formula already does the reasoning; what we need are reliable flags (30 s).');
const why = [['13 yes/no questions', 'Each message needs 13 yes/no answers. That is exactly what this model gives.'],
  ['Intent, not keywords', 'It understands that "trimite-mi codul" and "zi-mi cifrele" ask for the same thing.'],
  ['Romanian as people write it', 'It already knows Romanian, with or without diacritics and typos.'],
  ['Deterministic and fast', 'It reads each message once. The live re-run always gives the same answer.'],
  ['Laptop-sized', 'It runs on a laptop CPU. Its flags map straight onto the official points.'],
  ['Explainable', 'Every flag comes with its confidence and its source.']];
why.forEach(([h, d], i) => {
  const x = 0.5 + (i % 3) * 3.0, y = 1.4 + Math.floor(i / 3) * 1.75;
  card(s, x, y, 2.8, 1.55);
  dot(s, x + 0.2, y + 0.2, 0.3, C.accent1);
  text(s, h, { x: x + 0.62, y: y + 0.17, w: 2.05, h: 0.4, fontSize: 14, bold: true, color: C.text1 });
  text(s, d, { x: x + 0.2, y: y + 0.65, w: 2.45, h: 0.8, fontSize: 12 });
});

// ---------------- 9. Encoder: how ----------------
s = slide('Encoder', 'LIGHT', 'How we trained it', 'Training recipe and the bugs we caught on the way (30 s).');
const steps = [['Input', 'The model sees each message with its channel, sender and the 2 messages before it.'],
  ['Clean', 'We hide links and amounts. We add copies without diacritics or with typos.'],
  ['Learn', 'XLM-RoBERTa learns 13 yes/no outputs over 8 passes of the data.'],
  ['Tune', 'We pick one threshold per flag on a dev set it never trained on.'],
  ['Ship', 'We retrain on all the data. A second model names the scam type.']];
steps.forEach(([h, d], i) => {
  const x = 0.5 + i * 1.8;
  dot(s, x + 0.55, 1.45, 0.55, i === 4 ? C.accent3 : C.accent1, String(i + 1));
  if (i < 4) s.addShape(pres.shapes.LINE, { x: x + 1.15, y: 1.72, w: 1.15, h: 0, line: { color: HEX.teal, width: 1.5 } });
  text(s, h, { x, y: 2.15, w: 1.65, h: 0.35, fontSize: 15, bold: true, color: C.text1, align: 'center' });
  text(s, d, { x, y: 2.55, w: 1.65, h: 1.3, fontSize: 12, align: 'center' });
});
card(s, 0.5, 4.05, 8.85, 0.8, C.background2);
text(s, 'On the way, we caught two problems. Our first model gave wrong results on our GPU, and a random split leaked test sentences.', { x: 0.75, y: 4.05, w: 8.4, h: 0.8, fontSize: 13, color: C.text1, valign: 'middle' });

// ---------------- 10. Pill state model ----------------
s = slide('Pill', 'LIGHT', 'The pill: one cat, six moods', 'The state model of the pill, explained through the cat (40 s).');
const moods = [['sleeping_full', 'Starting', 'The models are loading.'], ['idle_full', 'Listening', 'It waits for messages.'], ['checking_full', 'Checking', 'A message just arrived.'],
  ['safe_full', 'Safe', 'It stays small. Click to see why.'], ['suspicious_full', 'Suspicious', 'It turns amber and shows a warning.'], ['scam_full', 'Scam', 'It turns red, opens and alerts.']];
const moodCol = [C.accent5, C.accent1, C.accent1, C.accent3, C.accent4, C.accent2];
moods.forEach(([img, h, d], i) => {
  const x = 0.45 + i * 1.53;
  card(s, x, 1.3, 1.38, 2.75);
  cat(s, img, x + 0.24, 1.42, 0.9);
  text(s, h, { x: x + 0.08, y: 2.6, w: 1.22, h: 0.35, fontSize: 14, bold: true, color: moodCol[i], align: 'center' });
  text(s, d, { x: x + 0.08, y: 2.98, w: 1.22, h: 0.95, fontSize: 11, align: 'center' });
});
card(s, 0.45, 4.25, 9.0, 0.7, C.text1);
text(s, 'The pill lights up only when a conversation gets more dangerous. The rest of the time, it stays calm.', { x: 0.7, y: 4.25, w: 8.6, h: 0.7, fontSize: 14, bold: true, color: C.background1, valign: 'middle' });

// ---------------- 10b. Adapters: the pill plugs into anything ----------------
s = slide('Pill', 'LIGHT', 'One local port, ready-made adapters', 'Adapter design (30 s): any app that can make an HTTP request can feed the pill; adapters translate each provider into one message format.');
const sources = [['WhatsApp', 'Connects through Meta’s webhook.'], ['SMS & WhatsApp', 'Connects through Twilio.'], ['Android SMS', 'A forwarder app sends each SMS.'], ['E-mail', 'A mail rule or Zapier sends it.'], ['Any code', 'One HTTP request is enough.']];
sources.forEach(([h, d], i) => {
  const y = 1.3 + i * 0.66;
  card(s, 0.45, y, 2.6, 0.56);
  text(s, h, { x: 0.62, y: y + 0.05, w: 2.3, h: 0.25, fontSize: 13, bold: true, color: C.text1 });
  text(s, d, { x: 0.62, y: y + 0.29, w: 2.3, h: 0.24, fontSize: 10, color: C.accent5 });
  s.addShape(pres.shapes.LINE, { x: 3.05, y: y + 0.28, w: 0.55, h: 0, line: { color: HEX.teal, width: 1.25, endArrowType: 'triangle' } });
});
card(s, 3.6, 1.3, 2.7, 3.2, C.text1);
text(s, '127.0.0.1:7777', { x: 3.8, y: 1.45, w: 2.3, h: 0.35, fontSize: 16, bold: true, color: C.background1 });
text(s, 'One adapter layer for all of them', { x: 3.8, y: 1.82, w: 2.3, h: 0.3, fontSize: 12, color: C.accent6 });
s.addText(['It understands each provider’s own format.', 'It groups messages into conversations.', 'It counts a repeated message only once.', 'It keeps each conversation in order.']
  .map((t, i, a) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: i < a.length - 1, paraSpaceAfter: 5 } })),
  { isTextBox: true, x: 3.8, y: 2.2, w: 2.35, h: 2.2, margin: 0, fontSize: 12, color: C.background1, valign: 'top' });
text(s, '→', { x: 6.32, y: 2.6, w: 0.35, h: 0.45, fontSize: 24, bold: true, color: C.accent1, align: 'center' });
const outs = [['Detector', 'It returns the verdict, the warning and the official number.'], ['The pill', 'It lights up when the danger rises.'], ['Live events', 'Dashboards and loggers can follow every result live.']];
outs.forEach(([h, d], i) => {
  const y = 1.3 + i * 1.1;
  card(s, 6.7, y, 2.7, 0.95);
  if (i === 1) cat(s, 'scam_head_sign', 8.6, y + 0.12, 0.7);
  text(s, h, { x: 6.88, y: y + 0.1, w: 1.8, h: 0.3, fontSize: 14, bold: true, color: C.text1 });
  text(s, d, { x: 6.88, y: y + 0.42, w: i === 1 ? 1.7 : 2.4, h: 0.5, fontSize: 11 });
});
card(s, 0.45, 4.6, 8.95, 0.5, C.background2);
text(s, 'It listens only on this laptop and needs a token. Messages stay in memory, and nothing is ever sent back to the scammer.',
  { x: 0.65, y: 4.6, w: 8.6, h: 0.5, fontSize: 12, color: C.text1, valign: 'middle' });

// ---------------- 11. Demo ----------------
s = slide('Demo', 'LIGHT', 'Live demo', 'Demo script, about 90 s. Dashboard is step 5 and the backup.');
const demo = [['idle_head', 'The pill waits quietly in the corner of the screen.'],
  ['safe_full', 'A real bank code arrives. The pill stays green, and a click explains why.'],
  ['scam_head_sign', 'A fake courier fee arrives. The pill turns red and gives the official number.'],
  ['suspicious_full', 'A "Hi mum, new number" chat arrives. The pill stays silent until message 5.'],
  ['checking_full', 'A juror types their own message. The cat checks it and answers.'],
  ['idle_full', 'The jury loads the test set or adds files. Any row opens the details.']];
demo.forEach(([img, d], i) => {
  const col = i < 3 ? 0 : 1, row = i % 3, x = 0.5 + col * 4.55, y = 1.35 + row * 1.2;
  card(s, x, y, 4.3, 1.05);
  cat(s, img, x + 0.15, y + 0.12, img.includes('head_sign') ? 0.9 : img.includes('head') ? 0.8 : 0.68);
  text(s, String(i), { x: x + 1.05, y: y + 0.12, w: 0.3, h: 0.35, fontSize: 16, bold: true, color: C.accent1 });
  text(s, d, { x: x + 1.35, y: y + 0.14, w: 2.8, h: 0.85, fontSize: 12, color: C.text1 });
});

// ---------------- 12. Results ----------------
s = slide('Results', 'LIGHT', 'Measured on data it never saw', 'Numbers (20 s). CLEAN = 129 eval conversations sharing no template with training.');
s.addChart(pres.charts.BAR, [{ name: 'Jury score /30 (clean eval)', labels: ['Rules only', 'Encoder only', 'Rules + encoders'], values: [19.9, 23.0, 28.4] }], {
  x: 0.5, y: 1.35, w: 5.2, h: 3.6, barDir: 'bar', chartColors: [HEX.grey, HEX.teal, HEX.green], varyColors: true,
  showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: HEX.ink, dataLabelFontFace: '+mn-lt', dataLabelFormatCode: '0.0',
  valAxisMinVal: 0, valAxisMaxVal: 30, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
  catAxisLabelColor: HEX.ink, catAxisLabelFontSize: 13, catAxisLabelFontFace: '+mn-lt', catAxisLineShow: false, showLegend: false,
  showTitle: true, title: 'Jury score out of 30, template-clean eval', titleFontSize: 13, titleColor: HEX.grey, titleFontFace: '+mn-lt' });
[['30/30', 'all 11 validation examples right', C.accent3], ['1', 'scam missed out of 78', C.accent2], ['0', 'false alarms on real messages', C.accent1]]
  .forEach(([b, t, col], i) => { card(s, 6.1, 1.35 + i * 1.22, 3.25, 1.05); stat(s, 6.3, 1.25 + i * 1.22, 2.9, b, t, col); });

// ---------------- 13. Limits: the decoder ----------------
s = slide('Limits', 'LIGHT', 'What we learned: the decoder we removed', 'Honesty + learning (25 s): we measured an LLM and removed it.');
[['0–29%', 'When the LLM disagreed with our model, it was right this rarely.'], ['2 → 8', 'Missed scams rose this much when the LLM could veto.'], ['0.7 s', 'The small model took this long per message. The big one took up to 9 s.']]
  .forEach(([b, t], i) => { card(s, 0.5 + i * 2.25, 1.4, 2.05, 1.7); stat(s, 0.7 + i * 2.25, 1.45, 1.75, b, t, i === 1 ? C.accent2 : C.accent1); });
bullets(s, ['We tried two local LLMs as a third signal and measured them carefully.', 'No setup beat rules plus encoders, so we removed the LLM.',
  'Our limits: the training data is synthetic, the hand-written test is small, and the GPU has 8 GB.'], { x: 0.5, y: 3.4, w: 6.6, h: 1.5, fontSize: 14 });
cat(s, 'sleeping_full', 7.8, 1.45, 1.5, 'Scam Shield cat, asleep');
text(s, 'LLM: switched off', { x: 7.35, y: 3.35, w: 2.4, h: 0.35, fontSize: 13, bold: true, color: C.accent5, align: 'center' });

// ---------------- 14. Close ----------------
s = slide('Close', 'DARK', 'Stop, check, call the official number', 'Close (10 s). Echipa Surpriza: Stefan Bejenescu, Francesca Micu, Sergiu Baroiamn.');
s.addText([{ text: 'Echipa Surpriza', options: { bold: true, breakLine: true } }, { text: 'Stefan Bejenescu · Francesca Micu · Sergiu Baroiamn', options: { breakLine: true } }, { text: 'Mulțumim!' }], { placeholder: 'body' });
dot(s, 6.15, 0.95, 3.4, C.text2);
cat(s, 'scam_head_sign', 6.55, 1.45, 2.6, 'Scam Shield cat holding a stop sign');

(async () => {
  await pres.writeFile({ fileName: path.join(__dirname, process.env.OUT || 'Scam_Shield_Pitch.pptx') });
  await applyTheme(path.join(__dirname, process.env.OUT || 'Scam_Shield_Pitch.pptx'), THEME);
  console.log('ok');
})();
