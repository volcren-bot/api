import { describe, expect, test } from "bun:test"
import { MAX_REPORT_MINUTES, normalizeShareCode, reportedMinutes, roleAtLeast } from "./validation"

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

describe("normalizeShareCode", () => {
	const code = "0123456789abcdef".repeat(4)

	test("accepts 64 hex digits and forgives case and padding", () => {
		expect(normalizeShareCode(code)).toBe(code)
		expect(normalizeShareCode(`  ${code.toUpperCase()}\n`)).toBe(code)
	})

	test("refuses anything else before the database is asked", () => {
		expect(normalizeShareCode("")).toBeNull()
		expect(normalizeShareCode(code.slice(1))).toBeNull()
		expect(normalizeShareCode(code + "0")).toBeNull()
		expect(normalizeShareCode("g" + code.slice(1))).toBeNull()
		expect(normalizeShareCode(`${code.slice(0, 32)} ${code.slice(32)}`)).toBeNull()
		expect(normalizeShareCode("'; drop table scripts.share_codes; --")).toBeNull()
	})
})

describe("roleAtLeast", () => {
	test("compares roles in rank order", () => {
		expect(roleAtLeast("tester", "tester")).toBe(true)
		expect(roleAtLeast("administrator", "tester")).toBe(true)
		expect(roleAtLeast("contributor", "tester")).toBe(false)
		expect(roleAtLeast("user", "tester")).toBe(false)
	})

	test("an unknown role is nothing", () => {
		expect(roleAtLeast("root", "user")).toBe(false)
	})
})
