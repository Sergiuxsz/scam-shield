/*
 * Where the app gets its verdicts.
 *
 * apiUrl: null  → the built-in rules detector (works offline, always the same answer).
 * apiUrl: "http://localhost:8000/analyze" → POSTs each scenario to your backend.
 *   The backend answers { "scamType": "...", "messages": [{ "n": 1, "flags": ["RF_..."], "spans": [{ "code", "start", "end" }] }] }.
 *   The app computes the score, verdict and first alert itself, with the official formula.
 *   If the backend fails or times out, the app falls back to the rules detector for that scenario.
 *
 * Never put an API key here: this file is served to the browser. Keep keys in the backend.
 */
window.SS_CONFIG = {
  // Scam Shield backend (detector/api.py: rules + fine-tuned XLM-R models).
  // Start it first; if it is down, the app quietly uses its own rules detector.
  apiUrl: "http://127.0.0.1:8000/analyze",
  // The backend handles one scenario at a time and the dashboard sends 4 at once, so allow for the queue.
  apiTimeoutMs: 120000
};
