import { beforeAll, describe, expect, test } from "bun:test"

let launcher: typeof import("./launcher")
let auth: typeof import("./auth")

beforeAll(async () => {
	process.env.SUPABASE_URL = "http://localhost:54321"
	process.env.SUPABASE_ANON_KEY = "anon"
	process.env.SUPABASE_SERVICE_KEY = "service"
	launcher = await import("./launcher")
	auth = await import("./auth")
})

describe("mapStartError", () => {
	test("maps database errors to the statuses the launcher expects", () => {
		expect(launcher.mapStartError({ code: "42501" }).code).toBe(403)
		expect(launcher.mapStartError({ code: "23514" }).code).toBe(402)
		expect(launcher.mapStartError({ message: "script x has no live revision" }).code).toBe(409)
		expect(launcher.mapStartError({ code: "XX000", message: "boom" }).code).toBe(500)
	})
})

test("revisions live in a nine digit folder", () => {
	expect(launcher.revisionFolder("abc", 7)).toBe("abc/000000007")
})

describe("bearerToken", () => {
	test("reads a bearer header and nothing else", () => {
		expect(auth.bearerToken("Bearer abc.def")).toBe("abc.def")
		expect(auth.bearerToken("bearer abc")).toBe("abc")
		expect(auth.bearerToken("Basic abc")).toBeNull()
		expect(auth.bearerToken(undefined)).toBeNull()
	})
})

test("authenticate answers 401 without a token", async () => {
	const result = await auth.authenticate(undefined)
	expect(result.code).toBe(401)
})
