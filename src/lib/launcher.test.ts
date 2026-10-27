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

describe("hexKey", () => {
	test("strips the bytea prefix PostgREST adds", () => {
		expect(launcher.hexKey("\\x" + "ab".repeat(32))).toBe("ab".repeat(32))
		expect(launcher.hexKey("ab".repeat(32))).toBe("ab".repeat(32))
	})
})

describe("redeemFailure", () => {
	test("ok is not a failure", () => {
		expect(launcher.redeemFailure("ok")).toBeNull()
	})

	test("each refusal has its own status and reason", () => {
		expect(launcher.redeemFailure("invalid")).toMatchObject({ code: 404, reason: "invalid" })
		expect(launcher.redeemFailure("expired")).toMatchObject({ code: 410, reason: "expired" })
		expect(launcher.redeemFailure("used")).toMatchObject({ code: 409, reason: "used" })
		expect(launcher.redeemFailure("own")).toMatchObject({ code: 409, reason: "own" })
		expect(launcher.redeemFailure("already_access")).toMatchObject({ code: 409 })
		expect(launcher.redeemFailure("rate_limited")).toMatchObject({ code: 429 })
	})

	test("a status from a newer database is treated as invalid, never as success", () => {
		expect(launcher.redeemFailure("something_new")).toMatchObject({ code: 404, reason: "invalid" })
	})
})

test("the API version moved on for launchers that don't know community scripts", () => {
	expect(launcher.API_VERSION).toBeGreaterThanOrEqual(2)
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
