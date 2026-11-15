import { t } from "elysia"
import type { ElysiaApp } from "$src/index"
import { ipRateLimit, reply } from "$lib/request"
import { checkUpload } from "$lib/revisions"

const RevisionParams = t.Object({
	id: t.String({ format: "uuid", error: "ID must be a valid UUID." }),
	revision: t.Numeric({ minimum: 1, multipleOf: 1, error: "The revision must be a whole number." })
})

export default (app: ElysiaApp) =>
	app
		.use(ipRateLimit(app, 10))
		.post(
			":id/revisions/:revision/check",
			async ({ headers, params: { id, revision } }) =>
				reply(await checkUpload(headers.authorization, id, revision)),
			{
				params: RevisionParams,
				detail: {
					tags: ["Revisions"],
					summary: "Type-check a pending revision",
					description:
						"Type-checks a pending revision against the newest lib and records the result, which `publish_version` requires before the revision can go live. Takes the access token of the script's author or a moderator, or the script's deploy token. `passed` is whether it can be published; `problems` lists what failed as `{ file, line, column, message }`. Live revisions are checked again by the API whenever a newer lib is published. Rate limit: 10 requests per minute per IP.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: { description: "`{ passed, lib, problems }`" },
						401: { description: "Missing, invalid or expired token." },
						403: { description: "Not the script's author or a moderator, or a banned account." },
						404: { description: "No such revision." },
						409: { description: "The revision isn't pending." },
						502: { description: "The check couldn't run. Nothing was recorded." }
					}
				}
			}
		)
