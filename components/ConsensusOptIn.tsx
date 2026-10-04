"use client";

import { useEffect, useState } from "react";
import { OPT_IN_KEY, readStored, writeStored } from "@/lib/client/prefs";
import type { Meta } from "@/lib/client/useAppApi";

/** Which opt-in providers vote in consensus, remembered per device. Off by default. */
export function useConsensusOptIn() {
  const [optIn, setOptIn] = useState<string[]>([]);
  useEffect(() => {
    try {
      const parsed = JSON.parse(readStored(OPT_IN_KEY) || "[]");
      if (Array.isArray(parsed)) setOptIn(parsed.filter((x) => typeof x === "string"));
    } catch {
      // Ignore a malformed stored value; the default is "none".
    }
  }, []);
  const toggle = (id: string, on: boolean) => {
    setOptIn((current) => {
      const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
      writeStored(OPT_IN_KEY, JSON.stringify(next));
      return next;
    });
  };
  return { optIn, toggle };
}

export function ConsensusOptIn({ meta, optIn, onToggle }: { meta: Meta; optIn: string[]; onToggle: (id: string, on: boolean) => void }) {
  const optional = meta.providers.filter((p) => p.optIn && p.configured);
  if (optional.length === 0) return null;
  return (
    <div className="opt-in small">
      {optional.map((p) => (
        <label key={p.id}>
          <input type="checkbox" checked={optIn.includes(p.id)} onChange={(e) => onToggle(p.id, e.target.checked)} /> Count {p.label} in consensus
        </label>
      ))}
    </div>
  );
}
