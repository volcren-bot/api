import { t } from "elysia"
import type { Static } from "elysia"
import type { Database } from "./supabase"

export type Limits = Pick<
	Database["stats"]["Tables"]["limits"]["Row"],
	"xp_min" | "xp_max" | "gp_min" | "gp_max"
>

export interface CachedLimits {
	limit: Limits
	timestamp: number
}

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
	custom: t.Optional(t.Array(t.Number(), { description: "Custom tracker deltas. Not stored yet." }))
})

export type StatsPayload = Static<typeof StatsSchema>

export const HeartbeatBody = t.Object({ stats: t.Optional(StatsSchema) })
export const StartBody = t.Object({
	script_id: t.String({ format: "uuid", error: "script_id must be a valid UUID." })
})
