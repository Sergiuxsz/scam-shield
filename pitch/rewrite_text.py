"""One-off: rewrite the slide text in build_deck.js as short, complete sentences."""
from pathlib import Path

p = Path(__file__).with_name("build_deck.js")
t = p.read_text(encoding="utf-8")
R = [
    # 2 problem
    ("'Harmless at message 1, a money request at message 5'", "'It looks harmless at first. The money request comes at message 5.'"),
    ("'Looks official, one fake link'", "'It looks official. Only the link gives it away.'"),
    ("'Real. Over-alarming it teaches people to ignore us'", "'This one is real. A false alarm here teaches people to ignore us.'"),
    ("'Who we protect: a 72-year-old who reads messages on a phone and has seconds to decide.'",
     "'We protect a 72-year-old who reads messages on a phone and must decide in seconds.'"),
    # 3 approach
    ("'Facts we can check exactly: links and numbers vs the official catalog, requests, who it claims to be'",
     "'Rules check the facts we can verify exactly. They compare links and numbers with the official catalog.'"),
    ("'Intent in new wording: 13 red flags per message, plus the scam type of the whole thread'",
     "'The encoders read intent, even in new wording. They flag 13 red flags per message and name the scam type.'"),
    ("'Points → risk score → verdict, first alert, and a 3-sentence Romanian warning'",
     "'The official points give the risk score and the verdict. The reader gets a 3-sentence warning in Romanian.'"),
    ("'100% on this laptop · no cloud AI · same input, same answer'",
     "'Everything runs on this laptop. No message reaches the cloud, and the same input always gets the same answer.'"),
    # 4 rules: coverage
    ("'Every link, e-mail and phone checked against the official catalog: exact, never guessed'",
     "'We check every link, e-mail and phone number against the official catalog.'"),
    ("""'Code, card data, money, AnyDesk, with negation: "Nu comunicați codul" is not a request'""",
     """'We catch requests for codes, card data, money or AnyDesk. "Nu comunicați codul" is not a request.'"""),
    ("'Bank, courier, ANAF, pension office, police: matched as whole words'",
     "'We detect when a message claims to be a bank, a courier, ANAF or the police.'"),
    ("""'"Nu este necesară nicio acțiune", only official links: the model may not raise alarms alone'""",
     """'Phrases like "nu este necesară nicio acțiune" mark real notices. There, the model cannot alarm alone.'"""),
    ("""'Saved contact? Same channel? A "new number" only matters from an unknown sender'""",
     """'We use the sender data. A "new number" only matters when the sender is not a saved contact.'"""),
    ("'All vocabulary lives in one file (rules.toml): tuning needs no code.'",
     "'All the words and patterns live in one file. We can tune the rules without touching the code.'"),
    # 5 rules: process
    ("'on V01–V11, the 11 examples we wrote them from'", "'We wrote the rules from the 11 validation examples. They scored perfectly there.'"),
    ("'on 300 conversations they had never seen: 58 scams missed'", "'On 300 conversations they had never seen, they missed 58 scams.'"),
    ("['Precise when they fire: almost no false alarms', 'Brittle on new wording', 'So they became the first layer, not the detector', 'Every later fix came from errors on a held-out dev set']",
     "['When a rule fires, it is almost always right.', 'New wording slips past them.', 'So rules became our first layer, not the whole detector.', 'Every later fix came from errors on a separate dev set.']"),
    ("'Lesson: a score on the examples you built from proves the plumbing works, not that it generalises.'",
     "'Our lesson: a perfect score on the examples you built from only proves the code runs. It does not prove it generalises.'"),
    # 6 data: synthetic
    ("['1,700', 'training conversations']", "['1,700', 'conversations to train on']"),
    ("['300', 'evaluation conversations']", "['300', 'conversations kept aside to test']"),
    ("['26%', 'hard negatives: real messages full of scam words']", "['26%', 'real messages that contain scam words']"),
    ("['129', 'template-clean eval conversations we score on']", "['129', 'test conversations with no shared templates']"),
    ("'Generated from attributes: type × verdict × channel × sender × diacritics, labelled per message with the official flags'",
     "'Each conversation was generated from a recipe: scam type, verdict, channel, sender and diacritics. Every message carries the official flags.'"),
    ("'Eval uses held-back wording; minimal contrast pairs; threads cut just before the first signal'",
     "'The test set uses wording held back from training. It also has near-identical safe and scam pairs.'"),
    ("'931 training conversations shared sentence templates with eval. We report only the clean 129, split dev by template group, and fingerprint the split.'",
     "'We found 931 training conversations that reused test sentences. So we report only the 129 clean ones, and we split dev by template.'"),
    # 7 data: hand-crafted
    ("['[Placeholder] ~20 scenarios written by the team, never generated', 'Real writing: no diacritics, typos, emoji, stories the generator never used',\n  'Labelled with the official points; the writer is not the labeller', 'Used only to test, never to train or tune']",
     "['[Placeholder] Our team wrote about 20 scenarios by hand.', 'They read like real messages: no diacritics, typos, emoji and new stories.',\n  'Each one was labelled with the official points by a different teammate.', 'We used them only to test, never to train or tune.']"),
    # 8 encoder: why
    ("'per message: exactly what a multi-label encoder answers'", "'Each message needs 13 yes/no answers. That is exactly what this model gives.'"),
    ("""'"trimite-mi codul" and "zi-mi cifrele din SMS" mean the same'""", """'It understands that "trimite-mi codul" and "zi-mi cifrele" ask for the same thing.'"""),
    ("'multilingual pretraining: no diacritics, typos, slang'", "'It already knows Romanian, with or without diacritics and typos.'"),
    ("'one pass per message; the live re-run always matches'", "'It reads each message once. The live re-run always gives the same answer.'"),
    ("'runs on the CPU; its flags plug straight into the official points'", "'It runs on a laptop CPU. Its flags map straight onto the official points.'"),
    ("'each flag has its own probability and source'", "'Every flag comes with its confidence and its source.'"),
    # 9 encoder: how
    ("'Each sender message + context: channel, saved contact, last 2 messages'", "'The model sees each message with its channel, sender and the 2 messages before it.'"),
    ("'Links, phones, amounts masked; no-diacritics, CAPS and typo variants every epoch'", "'We hide links and amounts. We add copies without diacritics or with typos.'"),
    ("'XLM-RoBERTa, 13 sigmoid outputs, binary cross-entropy, 8 epochs'", "'XLM-RoBERTa learns 13 yes/no outputs over 8 passes of the data.'"),
    ("'One threshold per flag, chosen on a dev set split by template group'", "'We pick one threshold per flag on a dev set it never trained on.'"),
    ("'Retrained on train + dev; a second model reads the whole thread for the scam type'", "'We retrain on all the data. A second model names the scam type.'"),
    ("'Caught on the way: mDeBERTa computed wrong results on our GPU → XLM-R; a random dev split leaked templates → group split.'",
     "'On the way, we caught two problems. Our first model gave wrong results on our GPU, and a random split leaked test sentences.'"),
    # 10 pill state model
    ("'models loading'", "'The models are loading.'"),
    ("'waiting for messages'", "'It waits for messages.'"),
    ("'a message arrived'", "'A message just arrived.'"),
    ("'stays small; click to see why'", "'It stays small. Click to see why.'"),
    ("'turns amber, opens the warning'", "'It turns amber and shows a warning.'"),
    ("'turns red, opens and notifies'", "'It turns red, opens and alerts.'"),
    ("'Rule: the pill only lights up when a conversation’s level rises, SAFE → SUSPICIOUS → SCAM. Calm the rest of the time.'",
     "'The pill lights up only when a conversation gets more dangerous. The rest of the time, it stays calm.'"),
    # 10b adapters
    ("'Meta Cloud API webhook'", "'Connects through Meta’s webhook.'"),
    ("'Twilio webhook'", "'Connects through Twilio.'"),
    ("'forwarder apps, no code'", "'A forwarder app sends each SMS.'"),
    ("'mail rules, Zapier, n8n'", "'A mail rule or Zapier sends it.'"),
    ("'POST /v1/messages'", "'One HTTP request is enough.'"),
    ("'One adapter layer'", "'One adapter layer for all of them'"),
    ("['Accepts each provider’s own field names', 'Groups messages into conversations', 'Same message twice? counted once', 'Strict order within a conversation']",
     "['It understands each provider’s own format.', 'It groups messages into conversations.', 'It counts a repeated message only once.', 'It keeps each conversation in order.']"),
    ("'rules + encoders → verdict, warning, official number'", "'It returns the verdict, the warning and the official number.'"),
    ("'lights up only when raised: true'", "'It lights up when the danger rises.'"),
    ("'stream for dashboards and loggers'", "'Dashboards and loggers can follow every result live.'"),
    ("'Local only · token on every call · host check · messages kept in memory, never on disk · nothing sent back to the scammer'",
     "'It listens only on this laptop and needs a token. Messages stay in memory, and nothing is ever sent back to the scammer.'"),
    # 11 demo
    ("""'The pill sits in the corner: "Listening · 0 threats"'""", "'The pill waits quietly in the corner of the screen.'"),
    ("""'Real bank code SMS → stays small and green; click it: "Pare în regulă" and why'""", "'A real bank code arrives. The pill stays green, and a click explains why.'"),
    ("'Fake courier SMS with a fee link → red, opens: what, why, call 0800 300 400'", "'A fake courier fee arrives. The pill turns red and gives the official number.'"),
    ("""'"Hi mum, new number" thread, message by message → silent until message 5, then red'""", """'A "Hi mum, new number" chat arrives. The pill stays silent until message 5.'"""),
    ("'A juror types their own message → the cat checks and answers'", "'A juror types their own message. The cat checks it and answers.'"),
    ("'Dashboard: load the test folder or add new files; click any row for the detail'", "'The jury loads the test set or adds files. Any row opens the details.'"),
    # 12 results
    ("'V01–V11 validation'", "'all 11 validation examples right'"),
    ("'missed scam (of 78)'", "'scam missed out of 78'"),
    ("'false alarms'", "'false alarms on real messages'"),
    # 13 decoder
    ("'how often the LLM was right where it disagreed with our encoder'", "'When the LLM disagreed with our model, it was right this rarely.'"),
    ("'missed scams on dev when the LLM could veto'", "'Missed scams rose this much when the LLM could veto.'"),
    ("'per call with the 7B on GPU; the 35B took 5–9 s'", "'The small model took this long per message. The big one took up to 9 s.'"),
    ("['Tried Qwen 35B and 7B locally as a third signal, with calibrated per-flag trust', 'No configuration beat rules + encoders, so we removed it',\n  'Other limits: synthetic training data, a small hand-written test, an 8 GB GPU']",
     "['We tried two local LLMs as a third signal and measured them carefully.', 'No setup beat rules plus encoders, so we removed the LLM.',\n  'Our limits: the training data is synthetic, the hand-written test is small, and the GPU has 8 GB.']"),
]
missing = [o[:70] for o, _ in R if o not in t]
if missing:
    raise SystemExit("not found:\n" + "\n".join(missing))
for o, n in R:
    t = t.replace(o, n)
p.write_text(t, encoding="utf-8")
print(len(R), "replacements")
