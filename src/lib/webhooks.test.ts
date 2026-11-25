import { beforeAll, describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import type { Delivery } from "./webhooks"

let lib: typeof import("./webhooks")

beforeAll(async () => {
	process.env.SUPABASE_URL = "https://db.example.com"
	process.env.SUPABASE_ANON_KEY = "anon"
	process.env.SUPABASE_SERVICE_KEY = "service"
	lib = await import("./webhooks")
})

const delivery = (overrides: Partial<Delivery> = {}): Delivery => ({
	id: "d1",
	event: "client_release",
	payload: { version: "2026.11.25-abcdef0", build: 1, released_at: "2026-11-25T10:00:00Z" },
	attempts: 1,
	created_at: "2026-11-25T10:00:00Z",
	url: "https://hooks.example.com/fire",
	format: "volcren",
	bearer_token: null as unknown as string,
	header_names: [],
	header_values: [],
	signing_secret: "s3cret",
	...overrides
})

describe("isPublicAddress", () => {
	test("refuses loopback, private, link-local, metadata and mapped private addresses", () => {
		for (const address of [
			"127.0.0.1",
			"10.1.2.3",
			"172.20.0.5",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"0.0.0.0",
			"::1",
			"::",
			"fd00::1",
			"fe80::1",
			"::ffff:10.0.0.1",
			"::ffff:127.0.0.1",
			"64:ff9b::a00:1",
			"2002:a00:1::1",
			"not an ip"
		])
			expect(lib.isPublicAddress(address)).toBe(false)
	})

	test("allows public addresses", () => {
		for (const address of ["8.8.8.8", "104.20.23.154", "2606:4700:10::6814:179a"])
			expect(lib.isPublicAddress(address)).toBe(true)
	})
})

describe("validHeader", () => {
	test("allows custom headers", () => {
		expect(lib.validHeader("anthropic-version", "2023-06-01")).toBe(true)
		expect(lib.validHeader("X-Api-Key", "abc def")).toBe(true)
	})

	test("refuses reserved names, our names and line breaks", () => {
		expect(lib.validHeader("Host", "x")).toBe(false)
		expect(lib.validHeader("authorization", "x")).toBe(false)
		expect(lib.validHeader("X-Volcren-Signature", "x")).toBe(false)
		expect(lib.validHeader("Proxy-Authorization", "x")).toBe(false)
		expect(lib.validHeader("X-A", "a\r\nX-B: b")).toBe(false)
		expect(lib.validHeader("X A", "x")).toBe(false)
		expect(lib.validHeader("X-A", "")).toBe(false)
	})
})

describe("renderBody", () => {
	test("volcren sends the envelope with the release's latest.json", () => {
		expect(JSON.parse(lib.renderBody(delivery(), "volcren"))).toEqual({
			id: "d1",
			event: "client_release",
			created_at: "2026-11-25T10:00:00Z",
			data: {
				version: "2026.11.25-abcdef0",
				build: 1,
				released_at: "2026-11-25T10:00:00Z",
				latest_url: "https://db.example.com/storage/v1/object/public/client/latest.json"
			}
		})
	})

	test("github_dispatch wraps it for repository_dispatch", () => {
		const body = JSON.parse(lib.renderBody(delivery(), "github_dispatch"))
		expect(body.event_type).toBe("volcren.client_release")
		expect(body.client_payload.data.version).toBe("2026.11.25-abcdef0")
	})

	test("text and discord send one sentence, and discord mentions nobody", () => {
		expect(JSON.parse(lib.renderBody(delivery(), "text"))).toEqual({
			text: "VOLCREN client 2026.11.25-abcdef0 is out."
		})
		expect(JSON.parse(lib.renderBody(delivery(), "discord"))).toEqual({
			content: "VOLCREN client 2026.11.25-abcdef0 is out.",
			allowed_mentions: { parse: [] }
		})
	})

	test("script checks say whether the revision passed and where it runs", () => {
		const check = (passed: boolean, problem_count: number) =>
			lib.summary("script_check", {
				title: "Bosses",
				revision: 4,
				checked_injector: "b",
				injector: passed ? "b" : "a",
				passed,
				problem_count
			})
		expect(check(true, 0)).toBe(
			"Bosses revision 4 passed the check against client b and runs on client b."
		)
		expect(check(false, 1)).toBe(
			"Bosses revision 4 failed the check against client b with 1 problem and keeps running on client a."
		)
		expect(check(false, 3)).toContain("with 3 problems")
	})
})

describe("buildHeaders", () => {
	test("signs the timestamp and body, adds the token and custom headers", () => {
		const headers = lib.buildHeaders(
			delivery({
				bearer_token: "tok",
				header_names: ["anthropic-version"],
				header_values: ["2023-06-01"]
			}),
			'{"a":1}',
			1700000000,
			"hooks.example.com"
		)
		const expected = createHmac("sha256", "s3cret").update('1700000000.{"a":1}').digest("hex")
		expect(headers).toMatchObject({
			Host: "hooks.example.com",
			Authorization: "Bearer tok",
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
			"X-Volcren-Event": "client_release",
			"X-Volcren-Delivery": "d1",
			"X-Volcren-Timestamp": "1700000000",
			"X-Volcren-Signature": `sha256=${expected}`
		})
	})

	test("refuses a stored header that isn't allowed", () => {
		expect(() =>
			lib.buildHeaders(
				delivery({ header_names: ["Host"], header_values: ["internal"] }),
				"{}",
				1,
				"h"
			)
		).toThrow("The header Host isn't allowed.")
	})
})

describe("send", () => {
	test("never connects to an address literal or a private host", async () => {
		await expect(lib.send(delivery({ url: "https://127.0.0.1/x" }))).rejects.toThrow(
			"The webhook must name a host, not an address."
		)
		await expect(lib.send(delivery({ url: "https://localhost/x" }))).rejects.toThrow(
			"localhost resolves to a private address."
		)
		await expect(lib.send(delivery({ url: "http://hooks.example.com/x" }))).rejects.toThrow(
			"The webhook URL must be https without credentials."
		)
	})
})

test("retryable covers timeouts, rate limits and server errors only", () => {
	expect([408, 425, 429, 500, 503].every(lib.retryable)).toBe(true)
	expect([400, 401, 403, 404, 410, 422].some(lib.retryable)).toBe(false)
})
