/** Longest stretch of runtime one report can claim, in minutes. Matches the 5 minute session timeout. */
export const MAX_REPORT_MINUTES = 5

/** Minutes a report can cover, capped by the real elapsed time and MAX_REPORT_MINUTES. */
export function reportedMinutes(claimed: number, elapsedMs: number) {
	const elapsedMinutes = (elapsedMs + 5000) / 60000
	return Math.max(0, Math.min(claimed, elapsedMinutes, MAX_REPORT_MINUTES))
}

const SHARE_CODE = /^[0-9a-f]{64}$/

/** Normalizes a share code to 64 lowercase hex digits, or null if invalid. */
export function normalizeShareCode(input: string) {
	const code = input.trim().toLowerCase()
	return SHARE_CODE.test(code) ? code : null
}

/** `profiles.roles`, lowest to highest. */
const ROLES = ["user", "contributor", "tester", "scripter", "moderator", "administrator"]

export function roleAtLeast(role: string, minimum: string) {
	const rank = ROLES.indexOf(role)
	return rank >= 0 && rank >= ROLES.indexOf(minimum)
}
