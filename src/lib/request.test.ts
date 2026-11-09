import { describe, expect, test } from "bun:test"
import { bodyTooLarge, createLimiter, getClientIP, logError } from "./request"

describe("createLimiter", () => {
	test("allows up to max hits per key, then answers 429 with Retry-After", () => {
		const limit = createLimiter(2, "Slow down.")
		const set = { headers: {} as Record<string, string> } as Parameters<typeof limit>[1]
		expect([limit("a", set), limit("a", set)]).toEqual([null, null])
		expect(limit("a", set)).toMatchObject({ code: 429, response: { error: "Slow down." } })
		expect(set.headers["retry-after"]).toBe("60")
		expect(limit("b", set)).toBeNull()
	})
})

describe("getClientIP", () => {
	test("prefers X-Real-IP, then the socket", () => {
		const server = { requestIP: () => ({ address: "10.0.0.1" }) }
		expect(
			getClientIP(new Request("http://x", { headers: { "x-real-ip": "1.2.3.4" } }), server)
		).toBe("1.2.3.4")
		expect(getClientIP(new Request("http://x"), server)).toBe("10.0.0.1")
		expect(getClientIP(new Request("http://x"), null)).toBe("unknown")
	})
})

test("logError returns the message with a ref id", () => {
	expect(logError("Nope")).toMatch(/^Nope \(ref: [0-9a-f]{8}\)$/)
})

describe("bodyTooLarge", () => {
	test("only a report may carry a big body", () => {
		expect(bodyTooLarge("/launcher/sessions/x/heartbeat", String(64 * 1024))).toBe(false)
		expect(bodyTooLarge("/launcher/sessions/x/heartbeat", String(64 * 1024 + 1))).toBe(true)
		expect(bodyTooLarge("/launcher/sessions/x/report", String(512 * 1024))).toBe(false)
		expect(bodyTooLarge("/launcher/sessions/x/report", String(512 * 1024 + 1))).toBe(true)
	})

	test("a missing or unreadable length is left to the server", () => {
		expect(bodyTooLarge("/launcher/me", null)).toBe(false)
		expect(bodyTooLarge("/launcher/me", "lots")).toBe(false)
	})
})
