import { describe, expect, test } from "bun:test"
import { MAX_REPORT_MINUTES, reportedMinutes, validateStats } from "./validation"

const limits = { xp_min: 0, xp_max: 1000, gp_min: 0, gp_max: 500 }

describe("validateStats", () => {
	test("accepts values within the per-minute limits, scaled by the minutes reported", () => {
		expect(validateStats(limits, { experience: 2500, gold: 400, minutes: 3 }, 3)).toBeNull()
	})

	test("rejects more than the limit allows for that runtime", () => {
		expect(validateStats(limits, { experience: 2500, gold: 0, minutes: 1 }, 1)).toContain(
			"more than"
		)
		expect(validateStats(limits, { experience: 0, gold: 1000, minutes: 1 }, 1)).toContain("gold")
	})

	test("rejects less than the minimum for that runtime", () => {
		expect(
			validateStats({ ...limits, xp_min: 10 }, { experience: 5, gold: 0, minutes: 1 }, 1)
		).toContain("less than")
	})

	test("a limit pair of 0 and 0 means none is configured", () => {
		const none = { xp_min: 0, xp_max: 0, gp_min: 0, gp_max: 0 }
		expect(validateStats(none, { experience: 9_999_999, gold: -5, minutes: 1 }, 1)).toBeNull()
	})

	test("nothing reported is rejected", () => {
		expect(validateStats(limits, { experience: 0, gold: 0, minutes: 1 }, 1)).toContain(
			"No experience"
		)
	})
})

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
