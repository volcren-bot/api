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

describe("manifestReply", () => {
	test("returns the live revision and its manifest", () => {
		const manifest = { queueable: true }
		expect(launcher.manifestReply([{ revision: 4, manifest }])).toMatchObject({
			data: { revision: 4, manifest }
		})
	})

	test("a revision without a manifest answers null", () => {
		expect(launcher.manifestReply([{ revision: 2, manifest: null }])).toMatchObject({
			data: { revision: 2, manifest: null }
		})
	})

	test("no row means the script is hidden or has no live revision", () => {
		expect(launcher.manifestReply([]).failure?.code).toBe(404)
		expect(launcher.manifestReply(null).failure?.code).toBe(404)
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

describe("claimedId", () => {
	const token = (payload: unknown) =>
		`h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`
	const id = "7d081fdd-59de-4a4e-9c29-b2f92d9bc697"

	test("reads the subject a token claims", () => {
		expect(auth.claimedId(token({ sub: id }))).toBe(id)
	})

	test("anything but a uuid subject is no claim", () => {
		expect(auth.claimedId(token({ sub: "1 or 1=1" }))).toBeNull()
		expect(auth.claimedId(token({}))).toBeNull()
		expect(auth.claimedId("not-a-jwt")).toBeNull()
		expect(auth.claimedId("a.%%%.b")).toBeNull()
	})
})

test("authenticate answers 401 for a token without a subject", async () => {
	const result = await auth.authenticate("Bearer a.b.c")
	expect(result.failure?.code).toBe(401)
})

test("authenticate answers 401 without a token", async () => {
	const result = await auth.authenticate(undefined)
	expect(result.failure?.code).toBe(401)
})

describe("mapFeedbackError", () => {
	test("maps the feedback functions' errors to the statuses the launcher expects", () => {
		expect(launcher.mapFeedbackError({ code: "P0002" }).code).toBe(404)
		expect(launcher.mapFeedbackError({ code: "22023" }).code).toBe(410)
		expect(launcher.mapFeedbackError({ code: "54000" }).code).toBe(429)
		expect(launcher.mapFeedbackError({ code: "42501" }).code).toBe(403)
		expect(launcher.mapFeedbackError({ code: "23514", message: "too big" })).toMatchObject({
			code: 422,
			error: "too big"
		})
		expect(launcher.mapFeedbackError({ code: "XX000", message: "boom" }).code).toBe(500)
	})
})

test("jsonBytes measures an attachment as the text it was sent as", () => {
	expect(launcher.jsonBytes(undefined)).toBe(0)
	expect(launcher.jsonBytes({ a: 1 })).toBe(7)
	expect(launcher.jsonBytes({ a: "é" })).toBe(10)
})

describe("mapAgentError", () => {
	test("maps the agent session functions' errors to the statuses the launcher expects", () => {
		expect(launcher.mapAgentError({ code: "P0002" }, "x").code).toBe(404)
		expect(launcher.mapAgentError({ code: "42501" }, "x").code).toBe(403)
		expect(launcher.mapAgentError({ code: "54000" }, "x").code).toBe(429)
		expect(launcher.mapAgentError({ code: "XX000", message: "boom" }, "x").code).toBe(500)
	})
})
