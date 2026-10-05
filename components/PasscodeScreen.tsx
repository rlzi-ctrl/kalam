"use client";

import { useState } from "react";
import { Nav } from "./Nav";

export function PasscodeScreen({
  tried,
  onSubmit,
  title,
  hint,
  nav = true,
}: {
  tried: boolean;
  onSubmit: (value: string) => void;
  title?: string;
  hint?: string;
  /** The reviewer page hides the learner's navigation. */
  nav?: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <main className="container">
      {nav && <Nav />}
      {title && <h1>{title}</h1>}
      {hint && <p className="muted">{hint}</p>}
      <form
        className="card passcode"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(draft);
        }}
      >
        <label htmlFor="pc">Passcode</label>
        <input id="pc" type="password" autoComplete="current-password" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn primary">Unlock</button>
        {tried && <p className="muted">That passcode didn&apos;t work.</p>}
      </form>
    </main>
  );
}
