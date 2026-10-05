import Link from "next/link";
import { soundById } from "@/lib/langpacks/sounds";
import type { GradeDone } from "@/lib/results";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="bar-value">{value}</span>
    </div>
  );
}

export function GradeCard({ state, modelLabel }: { state: GradeDone; modelLabel: (id: string) => string }) {
  const { grade, usage } = state;
  return (
    <div className="grade">
      <p className="overall">
        Overall <strong>{grade.overall}</strong>
        <span className="latency">
          {modelLabel(state.requestedModel)} · {(state.ms / 1000).toFixed(1)} s
        </span>
      </p>
      {state.model !== state.requestedModel && <p className="small warn">Answered by fallback model {state.model}</p>}
      <Bar label="Meaning" value={grade.meaning} />
      <Bar label="Grammar" value={grade.grammar} />
      <Bar label="Vocab" value={grade.vocabulary} />
      <p className="corrected">{grade.corrected_translit}</p>
      <p className="corrected arabic" dir="rtl" lang="ar">
        {grade.corrected_arabic}
      </p>
      {grade.errors.length > 0 && (
        <ul className="errors">
          {grade.errors.map((e, i) => (
            <li key={i}>
              <span className="tag">{e.type}</span> <s>{e.learner}</s> → <strong>{e.fix}</strong>
              <br />
              <span className="muted small">{e.tip}</span>
            </li>
          ))}
        </ul>
      )}
      {(grade.sound_errors ?? []).length > 0 && (
        <ul className="sound-errors">
          {grade.sound_errors.map((e, i) => {
            const s = soundById(e.sound);
            return (
              <li key={i} className="small">
                <span className="tag">sound</span>{" "}
                <span dir="rtl" lang="ar">{e.word}</span> heard as <span dir="rtl" lang="ar">{e.heard}</span>
                {s && (
                  <>
                    {" "}· <Link href={`/sounds#${s.id}`}>{s.letters[0]} {s.symbol} →</Link>
                  </>
                )}
                <br />
                <span className="muted">{e.tip}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="small consensus-note">{grade.consensus_note}</p>
      <p className="small">{grade.fluency_note}</p>
      <p className="small encourage">{grade.encouragement}</p>
      <details>
        <summary className="small">
          Raw JSON · {usage.input_tokens}/{usage.output_tokens} tok
          {state.attempts > 1 ? ` · ${state.attempts} attempts` : ""}
        </summary>
        <pre>{JSON.stringify(grade, null, 2)}</pre>
      </details>
    </div>
  );
}
