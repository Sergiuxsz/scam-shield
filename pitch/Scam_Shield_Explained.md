# Scam Shield, explained from start to finish

**Echipa Surpriza** · Stefan Bejenescu, Francesca Micu, Sergiu Baroiamn
R Systems × EESTEC LC Bucharest · Hackathon 2026

This document tells the full story behind the slides. It follows the same order as the presentation. For every
part it says what we built, how it works, and why we made each decision. It is written so that someone without a
machine learning background can follow it, while still giving the exact technical details a reviewer would ask for.

---

## 1. The problem we were asked to solve

Every day, people in Romania receive messages that pretend to come from their bank, a courier, ANAF, or a child
who "has a new number". The people who get hurt most are older and non-technical. The challenge asked us to build
an app that reads a single message or a whole conversation, decides whether someone is trying to trick the reader,
and explains it in words a grandparent would understand.

Three properties of the task shaped everything that follows.

**The scoring is fixed by the organisers.** There are 13 official red flags (for example "asks for a code", "asks
for money", "fake link", "urgency"). Each flag is worth a fixed number of points. The risk score is the sum of the
points of the flags found, capped at 100. The score then maps to a verdict: 0–24 is SAFE, 25–49 is SUSPICIOUS,
50–100 is SCAM. This means we never had to teach a model "how dangerous" a message is. The organisers already
decided that. Our real job was to detect the 13 flags correctly. Everything after that is simple, exact
arithmetic.

**Conversations matter, not just single messages.** Many scams start harmless. "Bună mami, ăsta e numărul nou" is
not a scam by itself; the money request arrives at message 5. The app must raise the alarm at the right message,
not too early and not too late. The jury scores this "first alert" separately.

**Real messages look dangerous too.** A genuine bank SMS contains a code. A genuine courier SMS contains a link. An
app that reacts to keywords will alarm on real messages, and a false alarm teaches people to ignore warnings. The
jury's test set deliberately contains such traps.

We kept one person in mind throughout: a 72-year-old who reads messages on a phone and has seconds to decide.

---

## 2. The overall approach: three layers, one official score

We split the system into three layers, each doing the job it is best at.

1. **Rules** check the facts we can verify exactly. Is this link on the official list? Does the message ask for a
   code? Does it claim to be a bank?
2. **Fine-tuned encoders** (small neural language models) read intent, even when the wording is new. They estimate,
   for each message, how likely each of the 13 flags is.
3. **The official formula** turns the flags into points, the risk score, the verdict and the first alert. A
   template then writes a calm, three-sentence warning in Romanian.

**Why this split.** Some flags are facts, and facts should be checked, not guessed. Whether `anaf-rambursari.net`
is the official ANAF website is a lookup in the catalog the organisers gave us. A model can only get that wrong.
Other flags are about intent ("is this urgency or just a date?"), and intent is where a learned model shines. The
final step is pure arithmetic defined by the organisers, so it must be deterministic code.

**Why everything runs locally.** Messages are private data. The rules of the challenge also disqualify any team
that sends test messages to a cloud AI service. Every part of Scam Shield runs on the laptop, and the same input
always gives the same answer. That last point matters for the jury's "live re-run" check: if re-analysing a
scenario in front of the jury gives a different result from the dashboard, the accuracy score is set to zero.

---

## 3. Rules: what they cover

The rules are the first layer. All their words and patterns live in one configuration file (`rules.toml`), so we can
tune them without changing code. They work on a normalised copy of the text: lowercase and without diacritics, so
"plătiți", "platiti" and "plătiţi" (old cedilla) are treated the same. The normalised copy keeps the same length as
the original, so when a rule matches, we can still show the evidence with its original diacritics.

They cover five areas.

**Links, e-mails and phone numbers.** Every link in a message is extracted and its domain compared with the
official catalog. A domain counts as official only if it is exactly the official one or a real subdomain of it.
This detail matters: `plati.anaf.ro` is official, but `fakeanaf.ro` and `anaf.ro.evil.com` are not. Phone numbers
and sender e-mail addresses are checked the same way when the message claims to be an organisation. This flag
(suspicious contact) is decided only by the rules, never by a model, because it is a lookup with a correct answer.

**Requests.** Rules catch requests for an SMS code, card data, CNP, PIN, money, or installing AnyDesk-style remote
control software. They handle negation: "Nu comunicați acest cod nimănui" (do not share this code) is a warning,
not a request, so it must not raise the flag. This is exactly the trap in validation scenario V03.

**Who the message claims to be.** Rules detect claims to be a bank, a courier, ANAF, the pension office, the
police, or tech support. Organisation names are matched as whole words. We learned this the hard way: an early
version matched names as substrings, and the sender "Ana (frate)" was read as "ANAF".

**Signs of a genuine message.** Some phrases are typical of real notices: "nu este necesară nicio acțiune" (no action
is needed), "nu vă cerem niciodată…" (we never ask you for…), or a message whose only links are official. When a
message shows such a sign and the rules see nothing else wrong, the model is not allowed to raise a flag on its own.
We added a guard here after testing: refund scams also say "aveți de primit" (you are due money), so a legitimacy
sign only counts when there is no fake link and no request in the same message.

**Sender data (metadata).** Whether the sender is a saved contact and which channel was used. A "new number" claim
only matters when the sender is not already in the reader's contacts.

---

## 4. Rules alone were not enough

We first wrote the rules while looking at the 11 validation examples the organisers gave us. On those 11 examples
the rules scored 30 out of 30. That number looked great, and it was misleading.

When we later received a dataset of 300 conversations the rules had never seen, the same rules scored only 15 out of
30 and missed 58 scams. Looking at the details showed a clear pattern: when a rule fired, it was almost always
right (precision between 0.85 and 1.00), but new wording slipped straight past it. Recall for "secrecy" was 0.10,
for "threat" 0.19, for "payment request" 0.34.

**The decision.** Rules became the first, precise layer of the detector, not the whole detector. Every rule fix we
made after that came from errors on a separate development (dev) set, never from the final test data.

**The lesson we put on the slide.** A perfect score on the examples you built your system from only proves that the
code runs. It does not prove that it generalises.

---

## 5. Our synthetic training data

To train a model we needed far more than 11 examples. We worked with a synthetic Romanian dataset of 1,700
training conversations and 300 test conversations, in the same format as the challenge.

**How it was generated.** Each conversation was built from a recipe of attributes: scam type, verdict, scenario,
channel, sender, and diacritics style. Each sentence template carries exactly the flags of its role in the story, so
the labels come from the construction itself rather than from someone's opinion. Every message carries its own
official flags, which is exactly what a per-message model needs.

**What makes it useful.**
- It is balanced: 35% SAFE, 15% SUSPICIOUS, 50% SCAM, and all 12 scam types, including romance, job and investment
  scams that the validation set does not cover.
- 26% of the training conversations are "hard negatives": real messages that contain scam words, like V03 and V05.
- The test set includes minimal contrast pairs (a scam and a real message that differ by one detail, such as a
  fake versus an official link) and conversations cut just before the first dangerous message, which must stay SAFE.
- The 11 validation scenarios were kept out of both training and test.

**Our leak audit.** We did not take the dataset's claims on trust. We masked names, organisations, amounts and links
and compared sentences between training and test. We found that 931 of the 1,700 training conversations reused
sentence templates that also appear in the test set. That means any score on the full test set is somewhat
inflated. Rather than throwing away half the training data, we did two things:

1. We report results on the **129 "clean" test conversations** that share no sentence template with training. This
   is the honest number in the presentation.
2. We split our dev set **by template group**, so no dev conversation shares a sentence with training. We also
   store a fingerprint of the dev set with each trained model, and our tuning script refuses to run if the
   fingerprints do not match. We added that check after a real bug: Python randomises set ordering between runs,
   and an early version of the split silently produced a different dev set in the training script and in the tuning
   script.

We also removed the 13 training conversations that were near-copies of the validation scenarios, so V01–V11 stays a
fair final check.

---

## 6. Hand-crafted entries

All the numbers above come from data made by one generator. The jury's test messages will be written by people, in
their own style. So our team also wrote scenarios by hand.

- They read like real messages: without diacritics, with typos, emoji, and stories the generator never used.
- Each scenario was labelled with the official points by a different teammate from the one who wrote it.
- We used them only to test, never to train or to tune settings. If we tuned on them, the score would stop being an
  honest estimate.

This is the closest thing we have to the jury's secret test set. *(The exact count and the result are filled in on
the slide.)*

---

## 7. Why an encoder fits this problem

An encoder is a language model that reads text and outputs numbers, rather than writing text like a chatbot. We
chose a multilingual encoder, XLM-RoBERTa, and fine-tuned it on our data. Here is why it fits this task so well.

**The task is 13 yes/no questions per message.** A multi-label encoder answers exactly that: one probability per
flag, in a single pass. The official formula already does all the reasoning that comes after the flags, so we did
not need a model that writes explanations; we needed one that detects flags reliably.

**It reads intent, not keywords.** "Trimite-mi codul" and "zi-mi cifrele din SMS" ask for the same thing in different
words. A rule needs both phrasings written down; the model learns the meaning.

**It already knows Romanian as people write it.** Multilingual pretraining covers Romanian with and without
diacritics, with typos and informal language.

**It is deterministic and fast.** One forward pass per message, and the same input always gives the same output.
That makes the live re-run in front of the jury match the dashboard every time.

**It is laptop-sized.** It runs on a CPU in well under a second per message, and its flags map straight onto the
official points.

**It is explainable.** Every flag comes with a confidence value and a record of where it came from (rules, the model,
or both), which the dashboard shows.

---

## 8. How we trained it

**Input.** One training example per sender message. The model sees the message together with a short context: the
channel, whether the sender is a saved contact, the sender's name, and the two messages before it. Context matters
for flags like "new number" and for threads.

**Cleaning and augmentation.** Links, e-mails, phone numbers and amounts are replaced with placeholders (`<URL>`,
`<TEL>`, `<NUM>`) both in training and at runtime. This stops the model from memorising one particular fake domain
or amount; links are judged by the rules anyway. Every training pass also adds variants of the messages without
diacritics, in capital letters, or with swapped letters, so the model learns intent rather than spelling.

**Learning.** XLM-RoBERTa base with a new output layer of 13 independent yes/no outputs (sigmoid), trained with binary
cross-entropy for 8 passes over the data.

**Tuning.** For each flag we chose one decision threshold on the dev set, never on the test set. When several
thresholds scored equally well, we chose the one closest to 0.5. Breaking ties toward the lowest value had made one
flag (remote access) fire on V01's "accesați <link>". Flags with too few dev examples to tune keep the default
of 0.5.

**Shipping.** Once all settings were chosen on dev, we retrained the final models on training plus dev data, so no
templates are missing from the delivered model.

**A second model for the scam type.** Our first type decision used keyword rules, and it gave up on stories it had
no words for (romance and prize scams became "OTHER"). We trained a second XLM-RoBERTa that reads the whole thread
and picks one of the 12 types. Scam type accuracy on the test set rose from 71% to 94% on the first version. When a
claimed organisation makes the type certain (a fake bank is a bank scam even if it asks you to install AnyDesk), the
rules decide; otherwise the model does. A teammate later added "clear story" rules on top, which raised dev type
accuracy further.

**Problems we caught on the way.**
- Our first choice of model, mDeBERTa, produced wrong numbers on our laptop GPU: its results differed from the CPU
  result by about 0.015, while a healthy model differs by about 0.0000004. Training on those wrong numbers made the
  loss explode. We confirmed it was a GPU kernel problem (not precision, labels or learning rate) and switched to
  XLM-RoBERTa, which computes correctly on the same GPU.
- The default optimiser implementation also misbehaved on this GPU and PyTorch combination; we use the fused AdamW
  implementation.
- The random dev split leaked templates, as described in section 5; we replaced it with the group split.

---

## 9. The pill: one cat, six moods

The pill is a small floating window in the corner of the screen. Its mascot, a white cat, shows its state, which
gives us a simple state model that anyone can read at a glance.

| Mood | What it means | What the pill does |
|---|---|---|
| Sleeping | Scam Shield is starting and the models are loading | Stays small |
| Listening | It is waiting for messages | Stays small and quiet |
| Checking | A message has just arrived | Briefly shows the cat looking |
| Safe | The conversation looks fine | Stays small; click it to see why |
| Suspicious | Something is off | Turns amber and shows the warning |
| Scam | It is very likely a scam | Turns red, opens, and alerts |

**The key rule:** the pill lights up only when a conversation becomes more dangerous (SAFE → SUSPICIOUS → SCAM). The
rest of the time it stays calm. This is what makes the "Hi mum, new number" thread work: messages 1 to 4 keep it
quiet, and the alert appears exactly at the money request.

**Why a calm design.** The brief asks for a calm friend, not an alarm system. Constant alerts would teach people to
click them away; an alert that only appears when something actually changes gets read.

---

## 10. One local port, ready-made adapters

Scam Shield should not be tied to one messaging app. The pill listens on a single local port, and anything that can
make an HTTP request can send it messages.

**The adapter layer** sits behind that port. It:
- understands each provider's own format and field names (for example Twilio's `Body` and `From`, or a phone
  forwarder's `text` and `sender`);
- groups messages into conversations, so each new message is scored together with the earlier ones;
- counts a repeated message only once (providers often retry deliveries);
- keeps the messages of each conversation in strict order, even when they arrive at the same moment.

**Ready-made adapters** exist for the Meta WhatsApp Cloud API webhook, Twilio (SMS and WhatsApp), Android SMS
forwarder apps (no code needed), e-mail through mail rules, Zapier or n8n, and any custom code through one simple
request.

**What comes out:** the verdict, the warning and the official phone number; the pill lights up when the danger rises;
and a live event stream lets dashboards or loggers follow every result.

**Security.** It listens only on the laptop and checks the host name, every call needs a token, messages stay in
memory and are never written to disk, and nothing is ever sent back to the scammer (the Twilio adapter, for example,
answers with an empty reply).

**Why adapters.** A detector is only useful where the messages actually are. Separating "how a message arrives" from
"how it is judged" means a new channel only needs a small translation, never a change to the detector.

---

## 11. The live demo

The demo shows the pill in several situations, one after another.

0. **The pill waits** quietly in the corner of the screen.
1. **A real bank code arrives.** The pill stays small and green. Clicking it shows "Pare în regulă" and explains that
   the message gives a code and asks for nothing.
2. **A fake courier fee arrives.** The pill turns red, opens, and gives the official CurierExpres number instead of the
   link from the message.
3. **A "Hi mum, new number" chat arrives**, message by message. The pill stays silent until message 5, the money
   request, and only then turns red.
4. **A juror types their own message.** The cat checks it and answers.
5. **The dashboard.** The jury loads the test folder or adds new files. Each scenario becomes a row with verdict, scam
   type, risk score, first alert and red flags; clicking a row opens the full detail with the conversation and the
   flags highlighted.

**What we improved in the dashboard for the jury.** Adding new test files now merges them into the table instead of
replacing it. A file with an existing scenario ID is re-checked and replaces its row; new IDs are added. New and
re-checked rows are marked "NEW", results appear one by one as they arrive, and adding a single file opens its
detail straight away. We tested this end to end in the browser against the running backend.

---

## 12. Results, measured on data the system never saw

On the 129 clean test conversations (no shared templates with training), scored the way the jury scores:

| Configuration | Score out of 30 |
|---|---|
| Rules only | 19.9 |
| Encoder only | 23.0 |
| Rules + encoders (Scam Shield) | **28.4** |

- All 11 validation examples are correct (30/30).
- 1 scam missed out of 78 risky conversations.
- 0 false alarms on real messages.

**Why the combination wins.** The rules are precise but miss new wording. The encoder catches new wording but cannot
check links against the catalog (we deliberately left that to the rules). Together they cover each other's gaps.
This is also why the system qualifies for the top architecture tier: it is a genuine multi-signal ensemble of
trained models, rules, link and number checks, and calibrated thresholds.

---

## 13. What we learned: the decoder we removed

We also tried a third signal: a local large language model (a "decoder", the kind of model behind chatbots). The idea
was that it might catch what the encoder misses.

**What we tried.** Two local models: Qwen 35B (a large mixture-of-experts model) and Qwen 7B. Both ran entirely on the
laptop through llama.cpp. We gave the LLM the flag definitions, examples written from our dev errors, and asked for
a strict JSON answer with a quote for each flag. Any flag whose quote was not actually in the message was dropped.

**Speed.** The 35B took 5 to 9 seconds per message, too slow for the 10 minutes we get with the test set. The 7B, fully
on the GPU, took about 0.7 seconds.

**Quality.** We measured on the dev set, never on the test set:
- In every configuration, the LLM gave no improvement over rules plus encoders.
- Where the LLM disagreed with our encoder, it was right only 0–29% of the time, depending on the flag. Where they
  agreed, it added nothing new.
- Letting the LLM veto flags that the encoder raised alone increased missed scams from 2 to 8.
- The 7B also fell for the V03 trap, reading a bank SMS that gives a code as a request for one.

**The decision.** We removed the LLM completely. It added no measured gain, and it added a server, timeouts and GPU
contention to the live run. The full record of the experiment is kept in `docs/LLM_EXPERIMENTS.md`.

**Our honest limits.**
- The training data is synthetic. The jury's hand-written messages will likely be harder than our test set.
- Our hand-written test set is small.
- The laptop GPU has 8 GB of memory, which limits which models we can run locally.
- The LLM experiment did not cover hand-written messages, where a large model's general understanding of Romanian
  might matter most. That is the first thing we would test after the hackathon.

---

## 14. Closing message

Stop, check, and call the official number. Scam Shield exists to give that advice at the right moment, in calm and
simple words, without ever sending a private message off the laptop.

**Echipa Surpriza** · Stefan Bejenescu, Francesca Micu, Sergiu Baroiamn · Mulțumim!
