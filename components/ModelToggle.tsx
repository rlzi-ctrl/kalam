"use client";

import { useEffect, useState } from "react";
import { MODEL_KEY, readStored, writeStored } from "@/lib/client/prefs";
import type { Meta } from "@/lib/client/useAppApi";

/** Grader / generator model, remembered per device. */
export function useModelChoice(meta: Meta | null) {
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!meta) return;
    const stored = readStored(MODEL_KEY);
    setModel(meta.grader.models.some((m) => m.id === stored) ? stored : meta.grader.defaultModel);
  }, [meta]);
  const choose = (id: string) => {
    setModel(id);
    writeStored(MODEL_KEY, id);
  };
  const label = (id: string) => meta?.grader.models.find((m) => m.id === id)?.label ?? id;
  return { model, choose, label };
}

export function ModelToggle({
  meta,
  model,
  onChange,
  title = "Grader",
}: {
  meta: Meta;
  model: string;
  onChange: (id: string) => void;
  title?: string;
}) {
  return (
    <div className="model-toggle" role="radiogroup" aria-label={`${title} model`}>
      <span className="muted small">{title}</span>
      {meta.grader.models.map((m) => (
        <button key={m.id} role="radio" aria-checked={model === m.id} className={`seg ${model === m.id ? "on" : ""}`} onClick={() => onChange(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
