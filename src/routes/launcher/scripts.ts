import type { ElysiaApp } from "$src/index"
import { createLimiter, getClientIP, ipRateLimit, reply } from "$lib/request"
import { auth } from "$lib/auth"
import { getManifest, listScripts, quoteScript, redeemCode, removeGrant } from "$lib/launcher"
import { normalizeShareCode } from "$lib/validation"
import { authResponses, RedeemBody, ScriptsQuery, UuidParams } from "$lib/types/collection"

// Extra guards so the database's failure counter isn't the only defense against code guessing.
const TOO_FAST = "You're redeeming codes too fast. Try again in a minute."
const redeemUserLimiter = createLimiter(5, TOO_FAST)
const redeemIpLimiter = createLimiter(10, TOO_FAST)

export default (app: ElysiaApp) =>
	app
		.use(ipRateLimit(app, 30))
		.use(auth)
		.get(
			"",
			async ({ caller, query, set }) => {
				const listed = await listScripts(caller, query)
				if (!listed.failure) set.headers["cache-control"] = "private, max-age=30"
				return reply(listed)
			},
			{
				auth: true,
				query: ScriptsQuery,
				detail: {
					tags: ["Scripts"],
					summary: "Scripts you can see",
					description:
						"Scripts the account can see, with price in microcredits per hour (1,000,000 = 1 CREDIT), live revision, whether that revision can run in a queue (`queueable`), author, online users and whether the account can run it right now (`can_access`). `community` tells official scripts (by a scripter or above) from community ones, and `granted` marks scripts that came from a share code. The default list is the published official scripts plus the community scripts the account wrote or was granted, and granted official scripts even when unpublished. `?community=true` (tester+) lists every community script instead. Rate limit: 30 requests per minute per IP.",
					responses: authResponses({
						200: { description: "The scripts" },
						403: {
							description:
								"The account is banned or deleted, or asked for `community` without being a tester."
						}
					})
				}
			}
		)
		.get(":id/quote", async ({ caller, params: { id } }) => reply(await quoteScript(caller, id)), {
			auth: true,
			params: UuidParams,
			detail: {
				tags: ["Scripts"],
				summary: "What starting a script would cost",
				description:
					"What a session of this script would cost the account if it started now: `price` in microcredits per hour after the account's exemptions (0 for the author, a grant and tester+, where the listed price doesn't apply), the `rank` it would take among the account's open sessions, the extra-session `fee` at that rank in microcredits per 30 days, and the balance `required` to start in microcredits. Rate limit: 30 requests per minute per IP.",
				responses: authResponses({
					200: { description: "`{ price, rank, fee, required }`" },
					404: { description: "No such script, or the account can't see it." }
				})
			}
		})
		.get(
			":id/manifest",
			async ({ caller, params: { id }, set }) => {
				const found = await getManifest(caller, id)
				if (!found.failure) set.headers["cache-control"] = "private, max-age=30"
				return reply(found)
			},
			{
				auth: true,
				params: UuidParams,
				detail: {
					tags: ["Scripts"],
					summary: "The live revision's manifest",
					description:
						"The `manifest.json` of the script's live revision: its settings form (`settings`), whether the queue can run it (`queueable`), the counters a queue entry can use as a goal (`goals`) and how long to wait for it to wrap up after `FINISH` (`finish_grace_minutes`). `manifest` is null when the revision has none. `revision` tells a launcher whether its cached copy is current. Rate limit: 30 requests per minute per IP.",
					responses: authResponses({
						200: { description: "`{ revision, manifest }`" },
						404: {
							description: "No such script, the account can't see it, or it has no live revision."
						}
					})
				}
			}
		)
		.post(
			"redeem",
			async ({ caller, body, set, status, request, server }) => {
				const limited =
					redeemUserLimiter(caller.id, set) ?? redeemIpLimiter(getClientIP(request, server), set)
				if (limited) return limited

				const code = normalizeShareCode(body.code)
				if (!code) return status(422, { error: "A share code is 64 hexadecimal digits." })

				const redeemed = await redeemCode(caller, code)
				if (redeemed.failure?.code === 429) set.headers["retry-after"] = "3600"
				return reply(redeemed)
			},
			{
				auth: true,
				body: RedeemBody,
				detail: {
					tags: ["Scripts"],
					summary: "Redeem a share code",
					description:
						"Redeems a single-use share code. The script is added to the account and shows up in `GET /launcher/scripts` with `granted: true`; premium scripts run free. Failures carry a `reason`: `invalid`, `expired`, `used`, `own` (the account wrote the script or made the code), `already_access` (the account can already see it; the code stays unused) or `rate_limited`. Failed attempts are counted per account in the database. Rate limit: 5 per minute per user and 10 per minute per IP.",
					responses: authResponses({
						200: { description: "`{ script_id, url }`" },
						404: { description: "No such code (`reason: invalid`)." },
						409: { description: "The code is used, or the account already has the script." },
						410: { description: "The code has expired." },
						422: { description: "Not a share code." }
					})
				}
			}
		)
		.delete(
			":id/grant",
			async ({ caller, params: { id } }) => reply(await removeGrant(caller, id)),
			{
				auth: true,
				params: UuidParams,
				detail: {
					tags: ["Scripts"],
					summary: "Remove a granted script",
					description:
						"Removes a script that was granted by a share code from the account. The code stays used, so the script can't be added back without a new one.",
					responses: authResponses({
						200: { description: "`{ removed: true }`" },
						404: { description: "The script isn't granted to this account." }
					})
				}
			}
		)
