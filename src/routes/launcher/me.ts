import type { ElysiaApp } from "$src/index"
import { ipRateLimit, reply } from "$lib/request"
import { auth } from "$lib/auth"
import { getMe } from "$lib/launcher"
import { authResponses } from "$lib/types/collection"

export default (app: ElysiaApp) =>
	app
		.use(ipRateLimit(app, 60))
		.use(auth)
		.get("", async ({ caller }) => reply(await getMe(caller)), {
			auth: true,
			detail: {
				tags: ["Account"],
				summary: "Current account",
				description:
					"Username, avatar, role and balance in microcredits (1,000,000 = 1 CREDIT) of the signed in account, the minutes of balance a premium script needs to start, how many sessions it has open, the fee an extra session costs it (microcredits per 30 days of running, 0 for tester+) and the minutes in such a month, and the API version so old launchers can be told to update. Rate limit: 60 requests per minute per IP.",
				responses: authResponses({ 200: { description: "The account" } })
			}
		})
