import { rateLimit, type ElysiaApp } from "$src/index"
import { createLimiter, getClientIP } from "$lib/request"
import { authenticate } from "$lib/auth"
import { endSession, heartbeat, startSession } from "$lib/launcher"
import { AuthHeaders, HeartbeatBody, StartBody, UuidParams } from "$lib/types/collection"

const startLimiter = createLimiter(10, 60 * 1000)
const heartbeatLimiter = createLimiter(4, 60 * 1000)

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
					description: `Starts a usage session for a script and returns the live revision with short-lived signed URLs for its files. The price is fixed for the whole session. Send a heartbeat every \`heartbeat_seconds\`, and end the session when the script stops.

Rate limit: 10 starts per minute per user.`,
					responses: {
						200: { description: "Session started" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						402: { description: "Not enough credits. Includes `required`, the balance needed." },
						403: { description: "No access to this script, or the account is banned." },
						409: { description: "The script has no live revision, or too many sessions are open." },
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
					description: `Keeps the session alive and bills the minutes that passed. If \`alive\` is false the session is over and \`reason\` says why: \`insufficient_credits\`, \`timeout\` or \`stopped\`; stop the script.

Optionally reports the stats gained since the last heartbeat. Limits are per minute of runtime, and the runtime a report can claim is capped by the time that really passed. A rejected report doesn't end the session: the answer has \`stats.accepted: false\` and a reason.

Rate limit: 4 per minute per session.`,
					responses: {
						200: { description: "`{ alive, credits, charged_until, stats? }`" },
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
