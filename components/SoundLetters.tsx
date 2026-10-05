"use client";

import { soundOfLetter, type SoundId } from "@/lib/langpacks/sounds";

/** Arabic text with the practice sounds' letters highlighted; tapping one reports its sound. */
export function SoundLetters({ text, onSound }: { text: string; onSound?: (id: SoundId) => void }) {
  return (
    <>
      {[...text].map((ch, i) => {
        const sound = soundOfLetter(ch);
        if (!sound) return ch;
        return (
          <span
            key={i}
            className={`snd snd-${sound}`}
            role={onSound ? "button" : undefined}
            onClick={
              onSound
                ? (e) => {
                    e.stopPropagation();
                    onSound(sound);
                  }
                : undefined
            }
          >
            {ch}
          </span>
        );
      })}
    </>
  );
}
