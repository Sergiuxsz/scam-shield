# Local LLM as a third signal: what we tried, and why it was removed

**Decision (19 Nov 2026): no LLM in the detector.** Measured on held-out data, it never improved the
score in any configuration, and it adds a server, timeouts and GPU contention to the live jury run.
The system stays Tier 6 without it: two fine-tuned models + rules + link/phone checks against the
official catalog + thresholds calibrated on a held-out dev split.

All the code was deleted after this decision; this file is the record. The per-case analysis of the
LLM's disagreements on dev is in `llm_disagreements_dev.md`.

## Setup

- **Server:** llama.cpp `llama-server` (Vulkan build, winget), local only. The client refused any
  non-localhost endpoint, so no message could reach a cloud API.
- **Prompt:** 11 flag definitions + the 13 scam types, JSON-only answer with a quote per flag; flags
  whose quote was not really in the message were dropped. 9 few-shot examples written from the
  rules+encoder **dev** errors (none shared a template sentence with eval or V01-V11).
- **Fusion:** an LLM flag counted only if the encoder agreed (>= 0.5); optional per-flag "trust"
  (LLM alone / LLM + weak encoder), an optional veto on encoder-only flags, and a type vote when the
  type model was unsure. A gate asked the LLM only when the encoder was unsure (0.2-0.8) or disagreed
  with the rules.

## Speed

| Model | Placement | Time per call | 17-scenario test set |
|---|---|---|---|
| Qwen3.5-35B-A3B Q4_K_M (22 GB, MoE) | all experts on CPU, 16 threads | 7-9 s | ~20 min (too slow) |
| same | 8 of 41 layers' experts on GPU (5.6 GB), 8 P-core threads | ~5 s | ~5-6 min gated |
| Qwen2.5-7B-Instruct Q4_K_M (4.7 GB) | fully on GPU, compact answers | 0.15-1.1 s | < 1 min |

Lessons:
- Output tokens dominate (~110 ms each for the 35B on CPU): compact answers (`{"f": ..., "t": ...}`,
  3-word quotes) roughly halved the time.
- Two processes taking turns on one GPU (PyTorch/CUDA encoders + llama.cpp/Vulkan) cut the 7B from
  ~64 to ~4 tokens/s. Fix: encoders on CPU (`SCAM_ENCODER_DEVICE=cpu`) whenever an LLM shares the GPU.
- Windows silently spills VRAM to system memory when overcommitted (7B + api.py + benchmark encoders),
  so calls slow down instead of failing: watch `nvidia-smi`.

## Quality

Group-split DEV (254 conversations, dev-held-out models), 7B:

| Configuration | Dev jury score | Type | Missed | False alarms |
|---|---|---|---|---|
| **LLM off** | **26.32** | 74% | 2 | 3 |
| Gated, confirm-only | 26.20 | 72% | 2 | 3 |
| Every message | 26.20 | 72% | 2 | 3 |
| Gated + veto | 24.82 | 69% | **8** | 3 |
| Every message + veto | 24.82 | 69% | **8** | 3 |

Template-clean eval (129) and V01-V11, 7B gated: identical with and without the LLM
(28.0/30 and 30/30). The 35B matched the 7B on V01-V11 (30/30 both ways); its CLEAN run was not finished.

### Why it could not help: per-flag calibration on dev

Overall the LLM's "yes" was often right (impersonation 0.89, too-good 0.86, urgency 0.85), but almost
only where the encoder already agreed. **Where it disagreed with the encoder, it was nearly always wrong:**

| Flag | LLM yes, encoder no | Precision |
|---|---|---|
| CHANNEL_SWITCH | 37 | 0.00 |
| THREAT | 28 | 0.29 |
| SECRECY | 17 | 0.06 |
| REMOTE_ACCESS / CODE_REQUEST / DATA_REQUEST | 9 / 8 / 8 | 0.00 |
| PAYMENT_REQUEST | 8 | 0.25 |
| IMPERSONATION / URGENCY / TOO_GOOD | 7 each | 0.00-0.29 |

So no flag earned more trust than "confirm", and the veto mostly removed correct encoder flags. The 7B also
fell for the V03 trap (a bank SMS that GIVES a code read as a code request).

## What was not measured

- The **hand-written, out-of-distribution** case, where an LLM's general Romanian should matter most.
  All measured data came from the same generator the encoders were trained on.
- A strong model (35B) as an independent voter at full speed: it needs a CUDA build or more VRAM.

## If revisiting after the hackathon

1. Measure on hand-written messages first; only that can justify an LLM.
2. A CUDA build of llama.cpp and a 14B-class model fully on GPU (needs ~10-12 GB VRAM).
3. Use it where the encoder is structurally weak (organisations outside the catalog, new scam stories),
   not as a per-message second opinion.
