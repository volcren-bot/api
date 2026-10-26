/** Longest stretch of runtime one report can claim, in minutes. Matches the 5 minute session timeout. */
export const MAX_REPORT_MINUTES = 5

/**
 * How many minutes a report can cover: what the loader says, but never more than the time that really
 * passed since the last report (plus a little slack), and never more than MAX_REPORT_MINUTES.
 */
export function reportedMinutes(claimed: number, elapsedMs: number) {
	const elapsedMinutes = (elapsedMs + 5000) / 60000
	return Math.max(0, Math.min(claimed, elapsedMinutes, MAX_REPORT_MINUTES))
}
