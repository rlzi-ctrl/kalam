import { requirePasscode } from "@/lib/auth";
import { slug, type Register, type Variant, type VariantSource } from "@/lib/lexicon";
import { lexiconStoreConfigured, loadLexicon, loadOverrides, saveOverrides } from "@/lib/store/lexicon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGISTERS: Register[] = ["levantine", "msa", "regional"];

export async function GET(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  return Response.json({ concepts: await loadLexicon(), storageConfigured: lexiconStoreConfigured() });
}

type Body =
  | { action: "prefer"; conceptId: string; variantId: string }
  | {
      action: "add";
      /** Existing concept, or omit to create one (e.g. for a Say it word that has no concept yet). */
      conceptId?: string;
      en?: string;
      variants: { translit: string; arabic: string; register?: string; tts?: string; source?: string }[];
      /** translit of the added variant to make preferred. */
      prefer?: string;
    };

/** prefer: one tap to make a variant the preferred one. add: reviewer-added or Say it–suggested forms. */
export async function POST(req: Request) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  if (!lexiconStoreConfigured()) {
    return Response.json({ error: "Saving preferences needs BLOB_READ_WRITE_TOKEN" }, { status: 412 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  const overrides = await loadOverrides();
  const concepts = await loadLexicon();

  if (body?.action === "prefer") {
    const concept = concepts.find((c) => c.id === body.conceptId);
    if (!concept?.variants.some((v) => v.id === body.variantId)) {
      return Response.json({ error: "unknown concept or variant" }, { status: 400 });
    }
    overrides.preferred[concept.id] = body.variantId;
    await saveOverrides(overrides);
    return Response.json({ concept: (await loadLexicon()).find((c) => c.id === concept.id) });
  }

  if (body?.action === "add") {
    const ok = (s: unknown, max = 200): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= max;
    const incoming = Array.isArray(body.variants) ? body.variants.filter((v) => ok(v?.translit) && ok(v?.arabic)) : [];
    if (incoming.length === 0 || incoming.length > 6) return Response.json({ error: "expected 1-6 variants" }, { status: 400 });

    let conceptId = body.conceptId;
    if (conceptId) {
      if (!concepts.some((c) => c.id === conceptId)) return Response.json({ error: "unknown concept" }, { status: 400 });
    } else {
      if (!ok(body.en, 100)) return Response.json({ error: "a new concept needs an English gloss" }, { status: 400 });
      conceptId = `u-${slug(body.en)}`;
      if (!concepts.some((c) => c.id === conceptId)) {
        overrides.concepts[conceptId] = { id: conceptId, en: body.en.trim(), lesson: null, variants: [] };
      }
    }

    const existing = new Set(concepts.find((c) => c.id === conceptId)?.variants.map((v) => v.id) ?? []);
    const added: Variant[] = incoming
      .map((v) => {
        const translit = v.translit.trim();
        return {
          id: `${conceptId}:${slug(translit)}`,
          form: translit,
          translit,
          arabic: v.arabic.trim(),
          register: REGISTERS.includes(v.register as Register) ? (v.register as Register) : "levantine",
          source: (v.source === "generated" ? "generated" : "reviewer") as VariantSource,
          preferred: false,
          ...(ok(v.tts) ? { tts: v.tts.trim() } : {}),
        };
      })
      .filter((v) => !existing.has(v.id));
    const target = overrides.concepts[conceptId];
    if (target) target.variants.push(...added);
    else overrides.added[conceptId] = [...(overrides.added[conceptId] ?? []), ...added];

    const all = [...existing, ...added.map((v) => v.id)];
    const preferId = body.prefer ? `${conceptId}:${slug(body.prefer)}` : undefined;
    if (preferId && all.includes(preferId)) overrides.preferred[conceptId] = preferId;
    else if (target && !overrides.preferred[conceptId] && all.length) overrides.preferred[conceptId] = all[0];

    await saveOverrides(overrides);
    return Response.json({ concept: (await loadLexicon()).find((c) => c.id === conceptId) });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
