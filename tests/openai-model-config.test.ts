import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_OPENAI_MODEL, getOpenAIModel } from "@/lib/config/openai";

describe("OpenAI model configuration", () => {
  afterEach(() => {
    delete process.env.OPENAI_MODEL;
  });

  it("defaults to GPT-5.5 when OPENAI_MODEL is not provided", () => {
    delete process.env.OPENAI_MODEL;

    expect(DEFAULT_OPENAI_MODEL).toBe("gpt-5.5");
    expect(getOpenAIModel()).toBe("gpt-5.5");
  });

  it("uses OPENAI_MODEL when explicitly configured", () => {
    process.env.OPENAI_MODEL = "gpt-5.2";

    expect(getOpenAIModel()).toBe("gpt-5.2");
  });

  it("ignores blank OPENAI_MODEL values", () => {
    process.env.OPENAI_MODEL = "   ";

    expect(getOpenAIModel()).toBe("gpt-5.5");
  });
});
