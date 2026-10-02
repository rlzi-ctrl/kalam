export const GRADER_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
];

export function defaultGraderModel(): string {
  return process.env.ANTHROPIC_MODEL || GRADER_MODELS[0].id;
}

/** The page's toggle options; includes ANTHROPIC_MODEL if it is something else. */
export function availableGraderModels(): { id: string; label: string }[] {
  const env = process.env.ANTHROPIC_MODEL;
  return env && !GRADER_MODELS.some((m) => m.id === env) ? [{ id: env, label: env }, ...GRADER_MODELS] : GRADER_MODELS;
}

export function resolveGraderModel(requested?: string): string | null {
  if (!requested) return defaultGraderModel();
  return availableGraderModels().some((m) => m.id === requested) ? requested : null;
}
