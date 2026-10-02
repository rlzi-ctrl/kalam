import { afterEach, describe, expect, it } from "vitest";
import { availableGraderModels, defaultGraderModel, resolveGraderModel } from "@/lib/grader/models";

describe("grader models", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_MODEL;
  });

  it("defaults to Opus and allows only the toggle's models", () => {
    expect(defaultGraderModel()).toBe("claude-opus-5-5");
    expect(resolveGraderModel()).toBe("claude-opus-5-5");
    expect(resolveGraderModel("claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(resolveGraderModel("claude-fable-5-1")).toBeNull();
  });

  it("honours ANTHROPIC_MODEL as the default and adds it to the toggle", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    expect(defaultGraderModel()).toBe("claude-sonnet-5-5");
    expect(availableGraderModels()).toHaveLength(2);
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    expect(availableGraderModels().map((m) => m.id)).toEqual(["claude-haiku-4-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  });
});
