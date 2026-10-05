import type { Sound } from "@/lib/langpacks/sounds";
import { preferredVariant, type Concept } from "./index";

const EXAMPLES = 6;

/** Vocabulary words (preferred forms) that contain the sound; single words first. */
export function soundExamples(sound: Sound, concepts: Concept[], max = EXAMPLES) {
  return concepts
    .map((c) => ({ concept: c, v: preferredVariant(c) }))
    .filter(({ v }) => sound.letters.some((l) => v.arabic.includes(l)))
    .filter(({ v }, i, all) => all.findIndex((x) => x.v.arabic === v.arabic) === i)
    .sort((a, b) => Number(a.v.arabic.includes(" ")) - Number(b.v.arabic.includes(" ")) || a.v.arabic.length - b.v.arabic.length)
    .slice(0, max)
    .map(({ concept, v }) => ({
      en: concept.en,
      translit: v.translit,
      arabic: v.arabic,
      // Levantine says ق as a glottal stop; speak it that way unless the variant has its own TTS spelling.
      tts: v.tts ?? (sound.id === "qaf" ? v.arabic.replace(/ق/g, "أ") : v.arabic),
    }));
}

