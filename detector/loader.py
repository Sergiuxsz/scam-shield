"""Read scenarios (JSON files, folders, pasted text) into one standard format.

Standard format = the organisers' input format:
{id, channel, sender: {name, address, known_contact}, messages: [{n, from, text}]}
Must not crash on empty / huge / emoji-only / diacritic-free input.
"""
import json
from pathlib import Path

CHANNELS = ["sms", "whatsapp", "email", "chat", "call_transcript"]


def normalise(raw: dict, fallback_id: str = "X") -> dict:
    """Fill in missing fields so nothing downstream has to check for them."""
    sender = raw.get("sender") or {}
    messages = []
    for i, m in enumerate(raw.get("messages") or [], start=1):
        messages.append({
            "n": int(m.get("n") or i),
            "from": m.get("from") if m.get("from") in ("sender", "reader") else "sender",
            "text": str(m.get("text") or ""),
        })
    return {
        "id": str(raw.get("id") or fallback_id),
        "channel": raw.get("channel") if raw.get("channel") in CHANNELS else "chat",
        "sender": {
            "name": sender.get("name"),
            "address": sender.get("address"),
            "known_contact": bool(sender.get("known_contact")),
        },
        "messages": messages,
    }


def load_file(path) -> dict:
    path = Path(path)
    return normalise(json.loads(path.read_text(encoding="utf-8-sig")), fallback_id=path.stem)


def load_bytes(data: bytes, name: str = "X") -> dict:
    """For files uploaded through the GUI."""
    return normalise(json.loads(data.decode("utf-8-sig")), fallback_id=Path(name).stem)


def load_folder(folder) -> list[dict]:
    """All *.json in a folder, sorted by id (the dashboard must be sorted by ID)."""
    scenarios = [load_file(f) for f in Path(folder).glob("*.json")]
    return sorted(scenarios, key=lambda s: s["id"])


def from_text(text: str, *, split_lines: bool = False, channel: str = "chat",
              known_contact: bool = False, sender_name: str | None = None,
              sender_address: str | None = None, sid: str = "MESAJ") -> dict:
    """Pasted text -> scenario. A single message is a thread of length 1.
    With split_lines=True, every non-empty line becomes a separate sender message."""
    if split_lines:
        parts = [line.strip() for line in text.splitlines() if line.strip()]
    else:
        parts = [text.strip()]
    return normalise({
        "id": sid,
        "channel": channel,
        "sender": {"name": sender_name, "address": sender_address, "known_contact": known_contact},
        "messages": [{"n": i, "from": "sender", "text": t} for i, t in enumerate(parts or [""], start=1)],
    })
