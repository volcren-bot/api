import type { Limits, StatsPayload } from "./types/collection"

/** Longest stretch of runtime one report can claim, in minutes. Matches the 5 minute session timeout. */
export const MAX_REPORT_MINUTES = 5

/**
 * Limits are per minute of runtime. A limit pair of 0 and 0 means none is configured for that value.
 * `minutes` is the runtime the report covers, measured by the server.
 */
export function validateStats(limits: Limits, stats: StatsPayload, minutes: number) {
	const check = (name: string, value: number, min: number, max: number) => {
		if (min === 0 && max === 0) return null
		if (value < min * minutes) return `Reported ${name} is less than the script's approved limits.`
		if (value > max * minutes) return `Reported ${name} is more than the script's approved limits.`
		return null
	}

	if (stats.experience < 0) return "Reported experience can't be negative."
	if (stats.experience === 0 && stats.gold === 0) return "No experience nor gold was reported."

	return (
		check("experience", stats.experience, limits.xp_min, limits.xp_max) ??
		check("gold", stats.gold, limits.gp_min, limits.gp_max)
	)
}

/**
 * How many minutes a report can cover: what the loader says, but never more than the time that really
 * passed since the last report (plus a little slack), and never more than MAX_REPORT_MINUTES.
 */
export function reportedMinutes(claimed: number, elapsedMs: number) {
	const elapsedMinutes = (elapsedMs + 5000) / 60000
	return Math.max(0, Math.min(claimed, elapsedMinutes, MAX_REPORT_MINUTES))
}
