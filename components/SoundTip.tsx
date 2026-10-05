"use client";

import Link from "next/link";
import { soundById, type SoundId } from "@/lib/langpacks/sounds";

export function SoundTip({ id, onClose }: { id: SoundId; onClose: () => void }) {
  const s = soundById(id)!;
  return (
    <div className="sound-tip" role="dialog" aria-label={`${s.name} tip`}>
      <p>
        <strong dir="rtl" lang="ar" className="sound-tip-letter">{s.letters[0]}</strong> <strong>{s.symbol}</strong> · {s.name}
      </p>
      <p className="small">{s.tip}</p>
      <p className="small">
        <Link href={`/sounds#${s.id}`}>Sound guide →</Link>{" "}
        <button className="link small" onClick={onClose}>Close</button>
      </p>
    </div>
  );
}
