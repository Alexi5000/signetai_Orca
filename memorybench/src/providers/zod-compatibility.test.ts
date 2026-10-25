import { expect, test } from "bun:test"
import { EntityFields, EntityTypeSchema, entityFields } from "@getzep/zep-cloud"
import { MemoryConfigSchema } from "mem0ai/oss"

test("Zep ontology records preserve named fields with patched Zod 4", () => {
  const fields = { name: entityFields.text("Person name"), age: entityFields.integer("Age") }
  expect(EntityFields.parse(fields)).toEqual(fields)
  expect(EntityTypeSchema.parse({ description: "Person", fields }).fields).toEqual(fields)
  expect(EntityFields.safeParse({ invalid: { type: "Text", description: 42 } }).success).toBe(false)
})

test("Mem0 configuration validates records with patched Zod 4", () => {
  const input = {
    embedder: { provider: "openai", config: { modelProperties: { dimensions: 8 } } },
    vectorStore: { provider: "memory", config: {} },
    llm: { provider: "openai", config: { modelProperties: { temperature: 0 } } },
  }
  const result = MemoryConfigSchema.parse(input)
  expect(result.embedder.config.modelProperties).toEqual({ dimensions: 8 })
  expect(MemoryConfigSchema.safeParse({ ...input, embedder: { provider: 42 } }).success).toBe(false)
})
