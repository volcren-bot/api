import { rateLimit, type ElysiaApp } from "$src/index"
import { createLimiter, getClientIP } from "$lib/request"
import { authenticate } from "$lib/auth"
import {
	endSession,
	heartbeat,
	recentSessions,
	reportSession,
	scoreSession,
	startSession
} from "$lib/launcher"
import {
	AuthHeaders,
	HeartbeatBody,
	ReportBody,
	ScoreBody,
	StartBody,
	UuidParams
} from "$lib/types/collection"

const startLimiter = createLimiter(10, 60 * 1000)
const heartbeatLimiter = createLimiter(4, 60 * 1000)
const scoreLimiter = createLimiter(20, 60 * 1000)
const reportLimiter = createLimiter(5, 60 * 1000)

export default (app: ElysiaApp) =>
	app
		.use(
			rateLimit({
				scoping: "scoped",
				duration: 60 * 1000,
				max: 60,
				errorResponse: "You've reached the 60 requests/min limit for your IP.",
				generator: (req, server) => getClientIP(req, server),
				injectServer: () => app.server
			})
		)
		.post(
			"",
			async ({ headers, body, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				if (!startLimiter(auth.caller.id)) {
					return status(429, { error: "You're starting sessions too fast. Try again in a minute." })
				}

				const { session, failure } = await startSession(auth.caller, body.script_id)
				if (failure) {
					return status(failure.code, { error: failure.error, required: failure.required })
				}
				return session
			},
			{
				headers: AuthHeaders,
				body: StartBody,
				detail: {
					tags: ["Sessions"],
					summary: "Start a session",
					security: [{ bearerAuth: [] }],
					description: `Starts a usage session for a script and returns the live revision with short-lived signed URLs for its files. The price is fixed for the whole session. \`rank\` is how many sessions the account already had open and \`fee\` the credits per 30 days this one accrues on top of the price at that rank (0 for the first session and for tester+). Send a heartbeat every \`heartbeat_seconds\`, and end the session when the script stops.

Rate limit: 10 starts per minute per user.`,
					responses: {
						200: { description: "Session started" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						402: { description: "Not enough credits. Includes `required`, the balance needed." },
						403: { description: "No access to this script, or the account is banned." },
						409: { description: "The script has no live revision." },
						429: { description: "You are rate limited." },
						502: { description: "The script files couldn't be prepared. Nothing was billed." }
					}
				}
			}
		)
		.post(
			":id/heartbeat",
			async ({ headers, params: { id }, body, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				if (!heartbeatLimiter(id)) {
					return status(429, { error: "Too many heartbeats for this session." })
				}

				const { result, failure } = await heartbeat(auth.caller, id, body?.stats)
				if (failure) return status(failure.code, { error: failure.error })
				return result
			},
			{
				headers: AuthHeaders,
				params: UuidParams,
				body: HeartbeatBody,
				detail: {
					tags: ["Sessions"],
					summary: "Session heartbeat",
					security: [{ bearerAuth: [] }],
					description: `Keeps the session alive and bills the minutes that passed. If \`alive\` is false the session is over and \`reason\` says why: \`insufficient_credits\`, \`timeout\` or \`stopped\`; stop the script. \`rank\` and \`fee\` are the session's place among the account's open sessions right now and the extra-session fee it accrues there (credits per 30 days), \`fee_charged\` the fee credits it has paid so far.

Optionally reports the stats gained since the last heartbeat. Limits are per minute of runtime, and the runtime a report can claim is capped by the time that really passed. A rejected report doesn't end the session: the answer has \`stats.accepted: false\` and a reason.

Rate limit: 4 per minute per session.`,
					responses: {
						200: {
							description: "`{ alive, credits, charged_until, rank, fee, fee_charged, stats? }`"
						},
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						404: { description: "No such session for this account." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
		.post(
			":id/end",
			async ({ headers, params: { id }, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const { result, failure } = await endSession(auth.caller, id)
				if (failure) return status(failure.code, { error: failure.error })
				return result
			},
			{
				headers: AuthHeaders,
				params: UuidParams,
				detail: {
					tags: ["Sessions"],
					summary: "End a session",
					security: [{ bearerAuth: [] }],
					description:
						"Ends the session and bills the started minutes. Safe to call again on a session that already ended.",
					responses: {
						200: { description: "`{ charged }`, the credits charged by this call" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						404: { description: "No such session for this account." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
		.get(
			"",
			async ({ headers, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const { sessions, failure } = await recentSessions(auth.caller)
				if (failure) return status(failure.code, { error: failure.error })
				return { sessions }
			},
			{
				headers: AuthHeaders,
				detail: {
					tags: ["Feedback"],
					summary: "Recent sessions",
					security: [{ bearerAuth: [] }],
					description: `The account's sessions that started or ended in the last 24 hours, newest first (at most 50): the ones that can be scored or reported. Each carries the script's title and url, the revision, \`started_at\`, \`ended_at\` (null while running), the account's current \`score\` of the script (null when unscored) and how many bug \`reports\` the account filed on that session.`,
					responses: {
						200: { description: "`{ sessions: [...] }`" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
		.post(
			":id/score",
			async ({ headers, params: { id }, body, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				if (!scoreLimiter(auth.caller.id)) {
					return status(429, { error: "You're scoring too fast. Try again in a minute." })
				}

				const { result, failure } = await scoreSession(auth.caller, id, body.score)
				if (failure) return status(failure.code, { error: failure.error })
				return result
			},
			{
				headers: AuthHeaders,
				params: UuidParams,
				body: ScoreBody,
				detail: {
					tags: ["Feedback"],
					summary: "Score a script",
					security: [{ bearerAuth: [] }],
					description: `Scores the session's script from 1 to 10. An account has one score per script: scoring again replaces it and records the session it was given on. The session must be the account's own and have started or ended within the last 24 hours. Scores are internal: the author sees aggregates, moderators the rest.

Rate limit: 20 per minute per user.`,
					responses: {
						200: { description: "`{ score }`" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						404: { description: "No such session for this account." },
						410: { description: "The session is older than 24 hours." },
						422: { description: "The score is not 1 to 10." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
		.post(
			":id/report",
			async ({ headers, params: { id }, body, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				if (!reportLimiter(auth.caller.id)) {
					return status(429, { error: "You're sending reports too fast. Try again in a minute." })
				}

				const { result, failure } = await reportSession(auth.caller, id, body)
				if (failure) return status(failure.code, { error: failure.error })
				return result
			},
			{
				headers: AuthHeaders,
				params: UuidParams,
				body: ReportBody,
				detail: {
					tags: ["Feedback"],
					summary: "Report a bug",
					security: [{ bearerAuth: [] }],
					description: `Files a bug report on the session for the script's author, moderators and the tester they assign. \`description\` is optional (at most 2000 characters); \`log\` is the script's log (at most 256 KiB, send the tail), \`snapshot\` the game state as JSON (at most 48 KiB) and \`diagnostics\` the versions and optionally the system info (at most 12 KiB). Only this endpoint accepts bodies above 64 KiB, up to 512 KiB. The session must be the account's own and have started or ended within the last 24 hours. The attachments are deleted after 90 days.

Rate limit: 5 per minute per user, and the database accepts 5 reports an hour per account.`,
					responses: {
						200: { description: "`{ report_id }`" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						404: { description: "No such session for this account." },
						410: { description: "The session is older than 24 hours." },
						413: { description: "An attachment is over its size limit." },
						422: { description: "The body is invalid or too large for the database." },
						429: { description: "You are rate limited, or sent 5 reports in the last hour." }
					}
				}
			}
		)
