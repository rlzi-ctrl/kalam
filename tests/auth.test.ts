import { afterEach, describe, expect, it } from "vitest";
import { requirePasscode } from "@/lib/auth";

const req = (pc?: string) => new Request("http://x/api", { headers: pc ? { "x-app-passcode": pc } : {} });

describe("requirePasscode", () => {
  afterEach(() => {
    delete process.env.APP_PASSCODE;
  });

  it("is open when APP_PASSCODE is unset", () => {
    expect(requirePasscode(req())).toBeNull();
  });

  it("rejects missing or wrong passcodes and accepts the right one", () => {
    process.env.APP_PASSCODE = "sesame";
    expect(requirePasscode(req())?.status).toBe(401);
    expect(requirePasscode(req("nope"))?.status).toBe(401);
    expect(requirePasscode(req("sesame"))).toBeNull();
  });
});
