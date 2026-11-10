import { describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import { ScriptsQuery } from "./collection"

describe("ScriptsQuery", () => {
	const app = new Elysia()
		.onError(({ code, set }) => {
			if (code === "VALIDATION") set.status = 422
		})
		.get("/", ({ query }) => query, { query: ScriptsQuery })
	const parse = (search: string) => app.handle(new Request(`http://localhost/${search}`))

	test("leaves a missing category unset", async () => {
		expect(await (await parse("")).json()).toEqual({})
	})

	test("keeps a known category", async () => {
		expect(await (await parse("?category=boss")).json()).toEqual({ category: "boss" })
	})

	test("rejects an unknown category", async () => {
		expect((await parse("?category=nope")).status).toBe(422)
	})
})
