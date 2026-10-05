"""Builds levantine_lexicon.json from the seed (notes forms) + scripts/lexicon_data.py (generated extras).

Run: python3 scripts/build_lexicon.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from lexicon_data import ALTERNATIVES, ARABIC, DEFAULT_PREFERRED, FLAG_FOR, NOTES, NOTES_REGISTER  # noqa: E402


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


seed = json.loads((ROOT / "levantine_seed.json").read_text())
flags = {FLAG_FOR[f["item"]]: f["note"] for f in seed["review_flags"] if f["item"] in FLAG_FOR}

entries = []
for lesson in seed["vocab_by_lesson"]:
    for item in lesson["items"]:
        if item.get("translit") and item["translit"] != "None":
            entries.append((f"l{lesson['lesson']}-{slug(item['en'])}", item["en"], item["translit"], lesson["lesson"]))
for p in seed["phrases"]:
    entries.append((f"p-{slug(p['en'])}", p["en"], p["translit"], None))

concepts = []
for cid, en, translit, lesson in entries:
    preferred = DEFAULT_PREFERRED.get(cid, translit)
    variants = [{
        "id": f"{cid}:{slug(translit)}",
        "form": translit,
        "translit": translit,
        "arabic": ARABIC[cid],
        "register": NOTES_REGISTER.get(cid, "levantine"),
        "source": "notes",
        "preferred": preferred == translit,
    }]
    for alt_translit, arabic, register, tts in ALTERNATIVES.get(cid, []):
        v = {
            "id": f"{cid}:{slug(alt_translit)}",
            "form": alt_translit,
            "translit": alt_translit,
            "arabic": arabic,
            "register": register,
            "source": "generated",
            "preferred": preferred == alt_translit,
        }
        if tts:
            v["tts"] = tts
        variants.append(v)
    assert sum(v["preferred"] for v in variants) == 1, cid
    concept = {"id": cid, "en": en, "lesson": lesson, "variants": variants}
    if cid in flags:
        concept["review_flag"] = flags[cid]
    if cid in NOTES:
        concept["note"] = NOTES[cid]
    concepts.append(concept)

missing = set(ARABIC) - {c["id"] for c in concepts}
assert not missing, missing
for table in (ALTERNATIVES, DEFAULT_PREFERRED, NOTES):
    assert set(table) <= set(ARABIC), set(table) - set(ARABIC)

out = {
    "meta": {
        "about": "One concept per vocab item / phrase in levantine_seed.json. The notes form is preferred unless a review flag says it is a different word or a misspelling. Arabic spellings and alternatives are generated: confirm with the tutor.",
        "built_by": "scripts/build_lexicon.py",
    },
    "concepts": concepts,
}
(ROOT / "levantine_lexicon.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"{len(concepts)} concepts, {sum(len(c['variants']) > 1 for c in concepts)} with alternatives, {len(flags)} flagged")
