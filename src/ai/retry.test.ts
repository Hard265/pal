import { is429, parseRetryDelay } from "./retry";

describe("retry 429 helpers", () => {
  it("should detect 429 errors in JSON-like objects", () => {
    const err = { status: 429 };
    expect(is429(err)).toBe(true);
  });

  it("should detect 429 from standard Error objects", () => {
    const err = new Error("RESOURCE_EXHAUSTED");
    expect(is429(err)).toBe(true);

    const err2 = new Error("Quota exceeded for metric: 429");
    expect(is429(err2)).toBe(true);
  });

  it("should parse retry delay from nested Gemini-style errors", () => {
    const err = {
      status: 429,
      details: [{
        "@type": "type.googleapis.com/google.rpc.RetryInfo",
        "retryDelay": "15s"
      }]
    };
    expect(parseRetryDelay(err)).toBe(15000);
  });
});
