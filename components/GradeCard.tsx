import type { GradeState } from "@/lib/results";

type Done = Extract<GradeState, { status: "done" }>;

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

export function GradeCard({ state }: { state: Done }) {
  const { grade, usage } = state;
  return (
    <div className="grade">
      <p className="overall">
        Overall <strong>{grade.overall}</strong>
      </p>
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
      <p className="small">{grade.fluency_note}</p>
      <p className="small encourage">{grade.encouragement}</p>
      <details>
        <summary className="small">
          Raw JSON · {state.ms} ms · {usage.input_tokens}/{usage.output_tokens} tok
          {state.attempts > 1 ? ` · ${state.attempts} attempts` : ""}
        </summary>
        <pre>{JSON.stringify(grade, null, 2)}</pre>
      </details>
    </div>
  );
}
