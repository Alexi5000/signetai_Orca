import { describe, expect, it } from "bun:test"
import { getModelConfig } from "./models"

describe("getModelConfig", () => {
  it("omits temperature for local GGUF OpenAI-compatible models", () => {
    const cfg = getModelConfig("google_gemma-4-26B-A4B-it-Q5_K_M.gguf")

    expect(cfg.provider).toBe("openai")
    expect(cfg.supportsTemperature).toBe(false)
    expect(cfg.id).toBe("google_gemma-4-26B-A4B-it-Q5_K_M.gguf")
  })

  it("omits temperature for Mercury OpenRouter models", () => {
    expect(getModelConfig("inception/mercury-2").supportsTemperature).toBe(false)
  })

  it("keeps ordinary OpenAI-compatible chat models temperature-capable", () => {
    expect(getModelConfig("gpt-4.1-mini").supportsTemperature).toBe(true)
    expect(getModelConfig("custom-openai-model").supportsTemperature).toBe(true)
  })

  it("routes local: aliases to the local chat-completions provider with server sampling", () => {
    const cfg = getModelConfig("local:qwen3.8-27b", {})

    expect(cfg.provider).toBe("local")
    expect(cfg.id).toBe("qwen3.8-27b")
    expect(cfg.supportsTemperature).toBe(false)
    expect(cfg.defaultMaxTokens).toBe(16_000)
    expect(cfg.reasoningEffort).toBeUndefined()
  })

  it("reads local reasoning effort and output budget from the environment", () => {
    const cfg = getModelConfig("local:qwen3.8-27b", {
      MEMORYBENCH_LOCAL_REASONING_EFFORT: "low",
      MEMORYBENCH_LOCAL_MAX_TOKENS: "4096",
    })

    expect(cfg.reasoningEffort).toBe("low")
    expect(cfg.defaultMaxTokens).toBe(4096)
  })

  it("rejects a local alias without a model id", () => {
    expect(() => getModelConfig("local:", {})).toThrow("missing a model id")
  })
})
