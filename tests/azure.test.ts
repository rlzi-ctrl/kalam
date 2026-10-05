import { afterEach, describe, expect, it, vi } from "vitest";
import { azureShortAudioUrl } from "@/lib/stt/azure";
import { getProvider } from "@/lib/stt/registry";

describe("Azure short-audio request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
  });

  it("puts the locale in the language query parameter", () => {
    const url = new URL(azureShortAudioUrl("westeurope", "ar-JO"));
    expect(url.host).toBe("westeurope.stt.speech.microsoft.com");
    expect(url.pathname).toBe("/speech/recognition/conversation/cognitiveservices/v1");
    expect(url.searchParams.get("language")).toBe("ar-JO");
  });

  it("tolerates case and whitespace in the region", () => {
    expect(azureShortAudioUrl(" WestEurope \n", "ar-LB")).toBe(
      "https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-LB&format=simple&profanity=raw",
    );
  });

  it.each(["https://westeurope.api.cognitive.microsoft.com/", "westeurope.stt.speech.microsoft.com", "westeurope?language=en-US", ""])(
    "rejects a region that is not a bare name: %j",
    (region) => {
      expect(() => azureShortAudioUrl(region, "ar-JO")).toThrow(/AZURE_SPEECH_REGION must be a bare region name/);
    },
  );

  it("sends each locale's own language and reports the request URL", async () => {
    process.env.AZURE_SPEECH_KEY = "k";
    process.env.AZURE_SPEECH_REGION = "westeurope";
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => Response.json({ RecognitionStatus: "Success", DisplayText: "انا بحب هاد" }));
    vi.stubGlobal("fetch", fetchMock);

    const results = [];
    for (const locale of ["ar-JO", "ar-LB", "ar-SY"]) {
      results.push(await getProvider(`azure-${locale}`)!.transcribe({ wav: Buffer.from("RIFF"), language: "ar" }));
    }
    const sent = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => ({
      language: new URL(url).searchParams.get("language"),
      contentType: (init.headers as Record<string, string>)["Content-Type"],
    }));
    expect(sent).toEqual(
      ["ar-JO", "ar-LB", "ar-SY"].map((language) => ({ language, contentType: "audio/wav; codecs=audio/pcm; samplerate=16000" })),
    );
    expect(results[1]).toEqual({
      text: "انا بحب هاد",
      note: "request: https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-LB&format=simple&profanity=raw",
    });
  });
});
