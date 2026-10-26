import { describe, expect, test } from "bun:test"
import { MAX_REPORT_MINUTES, reportedMinutes } from "./validation"

describe("reportedMinutes", () => {
	test("never exceeds what the launcher claims", () => {
		expect(reportedMinutes(1, 10 * 60_000)).toBe(1)
	})

	test("never exceeds the time that really passed, plus slack", () => {
		expect(reportedMinutes(10, 60_000)).toBeCloseTo(65 / 60)
	})

	test("is capped by the session timeout", () => {
		expect(reportedMinutes(60, 60 * 60_000)).toBe(MAX_REPORT_MINUTES)
	})
})
