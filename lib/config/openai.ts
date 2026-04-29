const DEFAULT_OPENAI_MODEL = "gpt-5.5";

/**
 * Server-side model selector for OpenAI API calls.
 *
 * Follows OpenAI docs guidance to keep the model configurable through env,
 * with a safe default for this repo.
 */
export function getOpenAIModel() {
  const configured = process.env.OPENAI_MODEL?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }

  return DEFAULT_OPENAI_MODEL;
}

export { DEFAULT_OPENAI_MODEL };
