import { t } from "elysia"
import type { Static } from "elysia"

export const UuidParams = t.Object({
	id: t.String({ format: "uuid", error: "ID must be a valid UUID." })
})

export const AuthHeaders = t.Object({
	authorization: t.String({
		description: "Supabase access token",
		examples: ["Bearer abcdef012345..."],
		error: "Authorization header is missing."
	})
})

export const StatsSchema = t.Object({
	experience: t.Number({ minimum: 0, description: "Experience gained since the last heartbeat" }),
	gold: t.Number({ description: "Gold gained since the last heartbeat, can be negative" }),
	minutes: t.Number({
		minimum: 0,
		maximum: 60,
		description: "Minutes of runtime the report covers, as measured by the launcher"
	}),
	custom: t.Optional(
		t.Array(t.Number(), {
			maxItems: 32,
			description: "Custom tracker deltas, in the order of the script's trackers"
		})
	)
})

export type StatsPayload = Static<typeof StatsSchema>

export const HeartbeatBody = t.Object({ stats: t.Optional(StatsSchema) })
export const RedeemBody = t.Object({
	code: t.String({
		minLength: 1,
		maxLength: 128,
		description: "The share code, 64 hex digits"
	})
})
export const StartBody = t.Object({
	script_id: t.String({ format: "uuid", error: "script_id must be a valid UUID." })
})
