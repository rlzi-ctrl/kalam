// Per-device preferences in localStorage (wrapped: private mode can throw).
export const PASSCODE_KEY = "kalam_passcode";
export const MODEL_KEY = "kalam_grader_model";
export const VOICE_KEY = "kalam_tts_voice";

export function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the value lasts for this page load only.
  }
}
