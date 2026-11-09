import type { ElysiaApp } from "$src/index"
import { createLimiter, ipRateLimit, reply } from "$lib/request"
import { auth } from "$lib/auth"
import {
	endSession,
	heartbeat,
	recentSessions,
	reportSession,
	scoreSession,
	startSession
} from "$lib/launcher"
import {
	authResponses,
	HeartbeatBody,
	ReportBody,
	ScoreBody,
	StartBody,
	UuidParams
} from "$lib/types/collection"

const startLimiter = createLimiter(10, "You're starting sessions too fast. Try again in a minute.")
const heartbeatLimiter = createLimiter(4, "Too many heartbeats for this session.")
const scoreLimiter = createLimiter(20, "You're scoring too fast. Try again in a minute.")
const reportLimiter = createLimiter(5, "You're sending reports too fast. Try again in a minute.")

export default (app: ElysiaApp) =>
	app
		.use(ipRateLimit(app, 60))
		.use(auth)
		.post(
			"",
			async ({ caller, body, set }) =>
				startLimiter(caller.id, set) ?? reply(await startSession(caller, body.script_id)),
			{
				auth: true,
				body: StartBody,
				detail: {
					tags: ["Sessions"],
					summary: "Start a session",
					description: `Starts a usage session for a script and returns the live revision with short-lived signed URLs for its files. The price is fixed for the whole session. \`rank\` is how many sessions the account already had open and \`fee\` the credits per 30 days this one accrues on top of the price at that rank (0 for the first session and for tester+). Send a heartbeat every \`heartbeat_seconds\`, and end the session when the script stops.

Rate limit: 10 starts per minute per user.`,
					responses: authResponses({
						200: { description: "Session started" },
						402: { description: "Not enough credits. Includes `required`, the balance needed." },
						403: { description: "No access to this script, or the account is banned." },
						409: { description: "The script has no live revision." },
						502: { description: "The script files couldn't be prepared. Nothing was billed." }
					})
				}
			}
		)
		.post(
			":id/heartbeat",
			async ({ caller, params: { id }, body, set }) =>
				heartbeatLimiter(id, set) ?? reply(await heartbeat(caller, id, body?.stats)),
			{
				auth: true,
				params: UuidParams,
				body: HeartbeatBody,
				detail: {
					tags: ["Sessions"],
					summary: "Session heartbeat",
					description: `Keeps the session alive and bills the minutes that passed. If \`alive\` is false the session is over and \`reason\` says why: \`insufficient_credits\`, \`timeout\` or \`stopped\`; stop the script. \`rank\` and \`fee\` are the session's place among the account's open sessions right now and the extra-session fee it accrues there (credits per 30 days), \`fee_charged\` the fee credits it has paid so far.

Optionally reports the stats gained since the last heartbeat. Limits are per minute of runtime, and the runtime a report can claim is capped by the time that really passed. A rejected report doesn't end the session: the answer has \`stats.accepted: false\` and a reason.

Rate limit: 4 per minute per session.`,
					responses: authResponses({
						200: {
							description: "`{ alive, credits, charged_until, rank, fee, fee_charged, stats? }`"
						},
						404: { description: "No such session for this account." }
					})
				}
			}
		)
		.post(":id/end", async ({ caller, params: { id } }) => reply(await endSession(caller, id)), {
			auth: true,
			params: UuidParams,
			detail: {
				tags: ["Sessions"],
				summary: "End a session",
				description:
					"Ends the session and bills the started minutes. Safe to call again on a session that already ended.",
				responses: authResponses({
					200: { description: "`{ charged }`, the credits charged by this call" },
					404: { description: "No such session for this account." }
				})
			}
		})
		.get("", async ({ caller }) => reply(await recentSessions(caller)), {
			auth: true,
			detail: {
				tags: ["Feedback"],
				summary: "Recent sessions",
				description: `The account's sessions that started or ended in the last 24 hours, newest first (at most 50): the ones that can be scored or reported. Each carries the script's title and url, the revision, \`started_at\`, \`ended_at\` (null while running), the account's current \`score\` of the script (null when unscored) and how many bug \`reports\` the account filed on that session.`,
				responses: authResponses({ 200: { description: "`{ sessions: [...] }`" } })
			}
		})
		.post(
			":id/score",
			async ({ caller, params: { id }, body, set }) =>
				scoreLimiter(caller.id, set) ?? reply(await scoreSession(caller, id, body.score)),
			{
				auth: true,
				params: UuidParams,
				body: ScoreBody,
				detail: {
					tags: ["Feedback"],
					summary: "Score a script",
					description: `Scores the session's script from 1 to 10. An account has one score per script: scoring again replaces it and records the session it was given on. The session must be the account's own and have started or ended within the last 24 hours. Scores are internal: the author sees aggregates, moderators the rest.

Rate limit: 20 per minute per user.`,
					responses: authResponses({
						200: { description: "`{ score }`" },
						404: { description: "No such session for this account." },
						410: { description: "The session is older than 24 hours." },
						422: { description: "The score is not 1 to 10." }
					})
				}
			}
		)
		.post(
			":id/report",
			async ({ caller, params: { id }, body, set }) =>
				reportLimiter(caller.id, set) ?? reply(await reportSession(caller, id, body)),
			{
				auth: true,
				params: UuidParams,
				body: ReportBody,
				detail: {
					tags: ["Feedback"],
					summary: "Report a bug",
					description: `Files a bug report on the session for the script's author, moderators and the tester they assign. \`description\` is optional (at most 2000 characters); \`log\` is the script's log (at most 256 KiB, send the tail), \`snapshot\` the game state as JSON (at most 48 KiB) and \`diagnostics\` the versions and optionally the system info (at most 12 KiB). Only this endpoint accepts bodies above 64 KiB, up to 512 KiB. The session must be the account's own and have started or ended within the last 24 hours. The attachments are deleted after 90 days.

Rate limit: 5 per minute per user, and the database accepts 5 reports an hour per account.`,
					responses: authResponses({
						200: { description: "`{ report_id }`" },
						404: { description: "No such session for this account." },
						410: { description: "The session is older than 24 hours." },
						413: { description: "An attachment is over its size limit." },
						422: { description: "The body is invalid or too large for the database." },
						429: { description: "You are rate limited, or sent 5 reports in the last hour." }
					})
				}
			}
		)
