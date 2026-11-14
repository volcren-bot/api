import type { ElysiaApp } from "$src/index"
import { createLimiter, ipRateLimit, reply } from "$lib/request"
import { auth } from "$lib/auth"
import { agentHeartbeat, endAgentSession, startAgentSession } from "$lib/launcher"
import { authResponses, UuidParams } from "$lib/types/collection"

const startLimiter = createLimiter(
	30,
	"You're starting agent sessions too fast. Try again in a minute."
)
const heartbeatLimiter = createLimiter(4, "Too many heartbeats for this agent session.")

export default (app: ElysiaApp) =>
	app
		.use(ipRateLimit(app, 60))
		.use(auth)
		.post(
			"",
			async ({ caller, set }) =>
				startLimiter(caller.id, set) ?? reply(await startAgentSession(caller)),
			{
				auth: true,
				detail: {
					tags: ["Agent sessions"],
					summary: "Start an agent session",
					description: `Starts metering free agent runs from the loader's MCP server. Nothing is billed and no balance is needed. Send a heartbeat every \`heartbeat_seconds\` while runs are active, and end the session when they stop. An account can have 8 open at once.

Rate limit: 30 starts per minute per user, since the loader starts one per run.`,
					responses: authResponses({
						200: { description: "`{ id, heartbeat_seconds }`" },
						429: { description: "You are rate limited, or the account has 8 agent sessions open." }
					})
				}
			}
		)
		.post(
			":id/heartbeat",
			async ({ caller, params: { id }, set }) =>
				heartbeatLimiter(id, set) ?? reply(await agentHeartbeat(caller, id)),
			{
				auth: true,
				params: UuidParams,
				detail: {
					tags: ["Agent sessions"],
					summary: "Agent session heartbeat",
					description: `Records the time since the previous heartbeat as active, up to twice \`heartbeat_seconds\`. \`ended\` is true when the session was already ended or timed out; start a new one.

Rate limit: 4 per minute per session.`,
					responses: authResponses({
						200: { description: "`{ ended }`" },
						404: { description: "No such agent session for this account." }
					})
				}
			}
		)
		.post(
			":id/end",
			async ({ caller, params: { id } }) => reply(await endAgentSession(caller, id)),
			{
				auth: true,
				params: UuidParams,
				detail: {
					tags: ["Agent sessions"],
					summary: "End an agent session",
					description:
						"Ends the session, counting the time since the last heartbeat up to the same cap. Safe to call again on a session that already ended.",
					responses: authResponses({
						200: { description: "`{ ended: true }`" },
						404: { description: "No such agent session for this account." }
					})
				}
			}
		)
