"use client";

import { useState } from "react";
import { Nav } from "./Nav";

export function PasscodeScreen({ tried, onSubmit }: { tried: boolean; onSubmit: (value: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <main className="container">
      <Nav />
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
