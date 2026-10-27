import { rateLimit, t, type ElysiaApp } from "$src/index"
import { createLimiter, getClientIP } from "$lib/request"
import { authenticate } from "$lib/auth"
import { listScripts, redeemCode, removeGrant } from "$lib/launcher"
import { normalizeShareCode } from "$lib/validation"
import { AuthHeaders, RedeemBody, UuidParams } from "$lib/types/collection"

// Share codes are 256 random bits, so guessing one is hopeless; these limits keep the database's own
// per-account failure counter from being the only thing between a bot and the redeem function.
const redeemUserLimiter = createLimiter(5, 60 * 1000)
const redeemIpLimiter = createLimiter(10, 60 * 1000)

export default (app: ElysiaApp) =>
	app
		.use(
			rateLimit({
				scoping: "scoped",
				duration: 60 * 1000,
				max: 30,
				errorResponse: "You've reached the 30 requests/min limit.",
				generator: (req, server) => getClientIP(req, server),
				injectServer: () => app.server
			})
		)
		.get(
			"",
			async ({ headers, query, set, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const { scripts, failure } = await listScripts(
					auth.caller,
					query.q ?? "",
					query.category ?? "",
					query.community ?? false
				)
				if (failure) return status(failure.code, { error: failure.error })

				set.headers["cache-control"] = "private, max-age=30"
				return { scripts }
			},
			{
				headers: AuthHeaders,
				query: t.Object({
					q: t.Optional(
						t.String({ maxLength: 100, description: "Search the title and description" })
					),
					category: t.Optional(
						t.String({ maxLength: 30, description: "Only scripts in this category" })
					),
					community: t.Optional(
						t.BooleanString({
							description: "Tester+ only: list every community script the account can see"
						})
					)
				}),
				detail: {
					tags: ["Scripts"],
					summary: "Scripts you can see",
					security: [{ bearerAuth: [] }],
					description:
						"Scripts the account can see, with price in credits per minute, live revision, author, online users and whether the account can run it right now (`can_access`). `community` tells official scripts (by a scripter or above) from community ones, and `granted` marks scripts that came from a share code. The default list is the published official scripts plus the community scripts the account wrote or was granted, and granted official scripts even when unpublished. `?community=true` (tester+) lists every community script instead. Rate limit: 30 requests per minute per IP.",
					responses: {
						200: { description: "The scripts" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: {
							description:
								"The account is banned or deleted, or asked for `community` without being a tester."
						},
						429: { description: "You are rate limited." }
					}
				}
			}
		)
		.post(
			"redeem",
			async ({ headers, body, set, status, request, server }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const ip = getClientIP(request, server)
				if (!redeemUserLimiter(auth.caller.id) || !redeemIpLimiter(ip)) {
					set.headers["retry-after"] = "60"
					return status(429, { error: "You're redeeming codes too fast. Try again in a minute." })
				}

				const code = normalizeShareCode(body.code)
				if (!code) return status(422, { error: "A share code is 64 hexadecimal digits." })

				const { redeemed, failure } = await redeemCode(auth.caller, code)
				if (failure) {
					if (failure.code === 429) set.headers["retry-after"] = "3600"
					return status(failure.code, { error: failure.error, reason: failure.reason })
				}
				return redeemed
			},
			{
				headers: AuthHeaders,
				body: RedeemBody,
				detail: {
					tags: ["Scripts"],
					summary: "Redeem a share code",
					security: [{ bearerAuth: [] }],
					description:
						"Redeems a single-use share code. The script is added to the account and shows up in `GET /launcher/scripts` with `granted: true`; premium scripts run free. Failures carry a `reason`: `invalid`, `expired`, `used`, `own` (the account wrote the script or made the code), `already_access` (the account can already see it; the code stays unused) or `rate_limited`. Failed attempts are counted per account in the database. Rate limit: 5 per minute per user and 10 per minute per IP.",
					responses: {
						200: { description: "`{ script_id, url }`" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						404: { description: "No such code (`reason: invalid`)." },
						409: { description: "The code is used, or the account already has the script." },
						410: { description: "The code has expired." },
						422: { description: "Not a share code." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
		.delete(
			":id/grant",
			async ({ headers, params: { id }, status }) => {
				const auth = await authenticate(headers.authorization)
				if (auth.error != null) return status(auth.code, { error: auth.error })

				const { failure } = await removeGrant(auth.caller, id)
				if (failure) return status(failure.code, { error: failure.error })
				return { removed: true }
			},
			{
				headers: AuthHeaders,
				params: UuidParams,
				detail: {
					tags: ["Scripts"],
					summary: "Remove a granted script",
					security: [{ bearerAuth: [] }],
					description:
						"Removes a script that was granted by a share code from the account. The code stays used, so the script can't be added back without a new one.",
					responses: {
						200: { description: "`{ removed: true }`" },
						401: { description: "The token is missing, invalid or expired. Refresh it and retry." },
						403: { description: "The account is banned or deleted." },
						404: { description: "The script isn't granted to this account." },
						429: { description: "You are rate limited." }
					}
				}
			}
		)
