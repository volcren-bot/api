import { describe, expect, test } from "bun:test"
import { createLimiter, getClientIP, logError } from "./request"

describe("createLimiter", () => {
	test("allows up to max hits per key, then refuses", () => {
		const limit = createLimiter(2, 60_000)
		expect([limit("a"), limit("a"), limit("a")]).toEqual([true, true, false])
		expect(limit("b")).toBe(true)
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
