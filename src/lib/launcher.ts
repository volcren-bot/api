import { fail, internalError, logError, ok, serverError, type Failure } from "./request"
import { feedback, payments, scripts, stats, supabaseAdmin, userScripts } from "./supabase"
import { reportedMinutes, roleAtLeast } from "./validation"
import type { ReportPayload, ScriptsFilter, StatsPayload } from "./types/collection"
import type { Caller } from "./auth"
import type { Json } from "./types/supabase"

/** Bump when a launcher endpoint changes in a way old launchers can't handle. `GET /launcher/me` reports it. */
export const API_VERSION = 3
const HEARTBEAT_SECONDS = 60
const SIGNED_URL_SECONDS = 60
const MAX_LISTED = 200
const ACCESS_CHECK_BATCH = 25

/** The unit `extra_session_fee` is quoted in: microcredits per 30 days of running (payments.minutes_per_month). */
const MINUTES_PER_MONTH = 30 * 24 * 60

const COVERS_URL = `${process.env.SUPABASE_URL}/storage/v1/object/public/imgs/scripts`

/** The folder a revision's files live in, in the `scripts` bucket. */
export const revisionFolder = (scriptId: string, revision: number) =>
	`${scriptId}/${String(revision).padStart(9, "0")}`

const canAccess = (userId: string, scriptId: string) =>
	scripts.rpc("can_access", { accesser_id: userId, script_id: scriptId })

const canView = (userId: string, scriptId: string) =>
	scripts.rpc("can_view", { viewer_id: userId, script_id: scriptId })

/** What starting the script would cost the user now: price, the rank the session would take, its fee and the balance needed. */
const quote = (userId: string, scriptId: string) =>
	payments.rpc("session_quote", { p_user: userId, p_script: scriptId })

const stopSession = (sessionId: string) =>
	payments.rpc("end_session", { p_session: sessionId, p_reason: "stopped" })

async function getMicrocredits(userId: string) {
	const { data } = await payments
		.from("accounts")
		.select("microcredits")
		.eq("user_id", userId)
		.maybeSingle()
	return data?.microcredits ?? 0
}

export async function getMe(caller: Caller) {
	const [config, microcredits, open] = await Promise.all([
		payments.from("config").select("min_balance_minutes, extra_session_fee").single(),
		getMicrocredits(caller.id),
		payments
			.from("sessions")
			.select("id", { count: "exact", head: true })
			.eq("user_id", caller.id)
			.is("ended_at", null)
	])
	if (config.error) return serverError("Failed to load the billing settings.", config.error)
	return ok({
		username: caller.username,
		avatar_url: caller.avatar || null,
		role: caller.role,
		microcredits,
		min_balance_minutes: config.data.min_balance_minutes,
		open_sessions: open.count ?? 0,
		// Tester+ pay no fee; the database decides, this is what it would charge everyone else
		extra_session_fee: roleAtLeast(caller.role, "tester") ? 0 : config.data.extra_session_fee,
		minutes_per_month: MINUTES_PER_MONTH,
		api_version: API_VERSION
	})
}

const LIST_COLUMNS =
	"id, url, title, description, published, is_community, is_granted, metadata!inner(type, categories, stage, price), protected!inner(author, revision, updated_at, queueable)"

const one = <T>(value: T | T[] | null): T | null =>
	Array.isArray(value) ? (value[0] ?? null) : value

/** Lists official and community scripts the account sees; `community` (tester+) lists only community ones. */
export async function listScripts(
	caller: Caller,
	{ q = "", category, community = false }: ScriptsFilter
) {
	if (community && !roleAtLeast(caller.role, "tester"))
		return fail({ code: 403, error: "Only testers can browse community scripts." })

	const user = userScripts(caller.token)
	const text = q.trim().toLowerCase()
	const pattern = text ? `"%${text.replace(/[\\%_]/g, "\\$&").replace(/["\\]/g, "\\$&")}%"` : null

	const base = () => {
		let query = user.from("scripts").select(LIST_COLUMNS)
		if (pattern) query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`)
		if (category) query = query.contains("metadata.categories", [category])
		return query.limit(MAX_LISTED)
	}

	const results = await Promise.all(
		community
			? [base().eq("is_community", true)]
			: [
					base().eq("is_community", false).eq("published", true),
					base().eq("is_granted", true),
					base().eq("is_community", true).eq("protected.author", caller.id)
				]
	)
	const failed = results.find((r) => r.error)
	if (failed?.error) return serverError("Failed to load the scripts.", failed.error)

	const found = new Map(results.flatMap((r) => r.data ?? []).map((s) => [s.id, s]))
	const listed = [...found.values()]
		.flatMap((s) => {
			const metadata = one(s.metadata)
			const info = one(s.protected)
			return metadata && info ? [{ s, metadata, info }] : []
		})
		.sort((a, b) => b.info.updated_at.localeCompare(a.info.updated_at))
		.slice(0, MAX_LISTED)
	if (listed.length === 0) return ok({ scripts: [] })

	const ids = listed.map(({ s }) => s.id)
	const [authors, online, access] = await Promise.all([
		user.rpc("get_authors", { script_ids: ids }),
		stats.rpc("online_per_script"),
		checkAccess(caller.id, ids)
	])
	if (authors.error) return serverError("Failed to load the script authors.", authors.error)
	const names = new Map((authors.data ?? []).map((a) => [a.script_id, a.username]))
	const users = new Map((online.data ?? []).map((o) => [o.script_id, Number(o.users)]))

	return ok({
		scripts: listed.map(({ s, metadata, info }) => ({
			id: s.id,
			url: s.url,
			title: s.title,
			description: s.description,
			categories: metadata.categories,
			stage: metadata.stage,
			type: metadata.type,
			price: metadata.price,
			revision: info.revision > 0 ? info.revision : null,
			queueable: info.queueable,
			cover_url: `${COVERS_URL}/${s.id}/cover.webp`,
			can_access: access.get(s.id) ?? false,
			community: s.is_community === true,
			granted: s.is_granted === true,
			author: names.get(s.id) ?? "unknown",
			online: users.get(s.id) ?? 0
		}))
	})
}

/** Asks `scripts.can_access` instead of duplicating its stage, role and balance rules. */
async function checkAccess(userId: string, ids: string[]) {
	const result = new Map<string, boolean>()
	for (let i = 0; i < ids.length; i += ACCESS_CHECK_BATCH) {
		await Promise.all(
			ids.slice(i, i + ACCESS_CHECK_BATCH).map(async (id) => {
				const { data } = await canAccess(userId, id)
				result.set(id, data === true)
			})
		)
	}
	return result
}

/** Maps what `payments.start_session` raises to an HTTP answer. */
export function mapStartError(error: { code?: string; message?: string }): Failure {
	if (error.code === "42501")
		return {
			code: 403,
			error: "You don't have access to this script, it's unavailable, or your account is banned."
		}
	if (error.code === "23514")
		return { code: 402, error: "Not enough credits to start this script." }
	if (error.message?.includes("no live revision"))
		return { code: 409, error: "This script has no live revision yet." }
	return internalError("Failed to start the session.", error)
}

/** Maps the database's redemption status to an HTTP failure; `ok` is not one. */
const REDEEM_FAILURES: Record<string, Failure> = {
	invalid: { code: 404, error: "This share code is not valid.", reason: "invalid" },
	expired: { code: 410, error: "This share code has expired.", reason: "expired" },
	used: { code: 409, error: "This share code has already been used.", reason: "used" },
	own: { code: 409, error: "You can't redeem your own share code.", reason: "own" },
	already_access: {
		code: 409,
		error: "You already have access to this script.",
		reason: "already_access"
	},
	rate_limited: {
		code: 429,
		error: "Too many failed attempts. Try again later.",
		reason: "rate_limited"
	}
}

export const redeemFailure = (status: string): Failure | null =>
	status === "ok" ? null : (REDEEM_FAILURES[status] ?? REDEEM_FAILURES.invalid)

/** Redeems a share code as the caller, marking it used and adding the grant in one step. */
export async function redeemCode(caller: Caller, code: string) {
	const { data, error } = await userScripts(caller.token).rpc("redeem_share_code", { p_code: code })
	if (error)
		return error.code === "42501"
			? fail({ code: 403, error: "This account can't redeem codes." })
			: serverError("Failed to redeem the code.", error)
	const result = data[0]
	const failure = redeemFailure(result?.status ?? "invalid")
	if (failure || !result?.script_id) return fail(failure ?? REDEEM_FAILURES.invalid)
	return ok({ script_id: result.script_id, url: result.url })
}

export async function removeGrant(caller: Caller, scriptId: string) {
	const { data, error } = await userScripts(caller.token)
		.from("grants")
		.delete()
		.eq("script_id", scriptId)
		.eq("user_id", caller.id)
		.select("script_id")
	if (error) return serverError("Failed to remove the script.", error)
	if (data.length === 0)
		return fail({ code: 404, error: "This script isn't granted to your account." })
	return ok({ removed: true })
}

export async function startSession(caller: Caller, scriptId: string) {
	const { data, error } = await payments.rpc("start_session", {
		p_user: caller.id,
		p_script: scriptId
	})
	if (error) return fail(await withRequired(caller.id, scriptId, mapStartError(error)))
	const started = data[0]
	if (!started) return serverError("start_session returned nothing.")

	const folder = revisionFolder(scriptId, started.revision)
	// Older revisions are plain and have no key.
	const [{ data: signed, error: signErr }, { data: keyRow, error: keyErr }, { data: price }] =
		await Promise.all([
			supabaseAdmin.storage.from("scripts").createSignedUrls(
				started.files.map((name) => `${folder}/${name}`),
				SIGNED_URL_SECONDS
			),
			scripts
				.from("version_keys")
				.select("key")
				.eq("id", scriptId)
				.eq("revision", started.revision)
				.maybeSingle(),
			payments.from("sessions").select("price").eq("id", started.session_id).single()
		])
	if (signErr || keyErr || signed.some((entry) => entry.error || !entry.signedUrl)) {
		// Don't bill for a session the launcher can't use.
		await stopSession(started.session_id)
		return fail({
			code: 502,
			error: logError("Failed to prepare the script files.", signErr ?? keyErr ?? signed)
		})
	}

	reportedAt.set(started.session_id, Date.now())
	return ok({
		session_id: started.session_id,
		revision: started.revision,
		price: price?.price ?? 0,
		rank: started.rank,
		fee: started.fee,
		entry: started.entry,
		files: started.files.map((name, i) => ({ name, url: signed[i].signedUrl })),
		key: keyRow ? hexKey(keyRow.key) : null,
		heartbeat_seconds: HEARTBEAT_SECONDS
	})
}

/** Strips PostgREST's `\x` bytea prefix. */
export const hexKey = (bytea: string) => bytea.replace(/^\\x/, "")

/** Adds the balance needed when credits refused the start; `can_access` refuses those as a 403 too. */
async function withRequired(userId: string, scriptId: string, failure: Failure): Promise<Failure> {
	if (failure.code === 402)
		return { ...failure, required: (await quote(userId, scriptId)).data?.[0]?.required }
	if (failure.code !== 403) return failure

	const [runnable, visible, quoted, microcredits] = await Promise.all([
		canAccess(userId, scriptId),
		canView(userId, scriptId),
		quote(userId, scriptId),
		getMicrocredits(userId)
	])
	const required = quoted.data?.[0]?.required ?? 0
	// A runnable script is never refused for credits.
	if (runnable.data === true || visible.data !== true || required <= 0 || microcredits >= required)
		return failure
	return { ...mapStartError({ code: "23514" }), required }
}

/** `quote` for the launcher, which may only ask about scripts the account can see. */
export async function quoteScript(caller: Caller, scriptId: string) {
	const [visible, quoted] = await Promise.all([
		canView(caller.id, scriptId),
		quote(caller.id, scriptId)
	])
	if (visible.error) return serverError("Failed to check the script.", visible.error)
	if (visible.data !== true) return fail({ code: 404, error: "Script not found." })
	if (quoted.error) return serverError("Failed to quote the script.", quoted.error)
	const found = quoted.data[0]
	return found ? ok(found) : fail({ code: 404, error: "Script not found." })
}

export function manifestReply(rows: { revision: number; manifest: Json | null }[] | null) {
	const live = rows?.[0]
	return live
		? ok({ revision: live.revision, manifest: live.manifest })
		: fail({ code: 404, error: "Script not found." })
}

export async function getManifest(caller: Caller, scriptId: string) {
	const { data, error } = await userScripts(caller.token).rpc("live_manifest", {
		script_id: scriptId
	})
	if (error) return serverError("Failed to load the script's manifest.", error)
	return manifestReply(data)
}

/** The rank a running session holds now and the fee it accrues at it, in microcredits per 30 days. */
async function sessionFee(userId: string, sessionId: string) {
	const { data: rank } = await payments.rpc("session_rank", { p_session: sessionId })
	const { data: fee } = await payments.rpc("session_fee", { p_user: userId, p_rank: rank ?? 0 })
	return { rank: rank ?? 0, fee: fee ?? 0 }
}

/** When each open session last reported, to cap the runtime a report can claim. */
const reportedAt = new Map<string, number>()

// Server-ended sessions never come back here, so drop idle ones.
setInterval(
	() => {
		const cutoff = Date.now() - 10 * 60 * 1000
		for (const [id, at] of reportedAt) if (at < cutoff) reportedAt.delete(id)
	},
	5 * 60 * 1000
).unref()

/** The caller's session; someone else's looks like a missing one, so ids can't be probed. */
async function ownedSession(sessionId: string, userId: string) {
	const { data, error } = await payments
		.from("sessions")
		.select("end_reason")
		.eq("id", sessionId)
		.eq("user_id", userId)
		.maybeSingle()
	if (error) return serverError("Failed to load the session.", error)
	if (!data) return fail({ code: 404, error: "Session not found." })
	return ok(data)
}

export async function heartbeat(
	caller: Caller,
	sessionId: string,
	report: StatsPayload | undefined
) {
	const owned = await ownedSession(sessionId, caller.id)
	if (owned.failure) return owned

	const { data: alive, error } = await payments.rpc("heartbeat_session", { p_session: sessionId })
	if (error) return serverError("Failed to send the heartbeat.", error)
	if (!alive) reportedAt.delete(sessionId)

	const [{ data: after }, microcredits, running] = await Promise.all([
		payments
			.from("sessions")
			.select("end_reason, charged_until, fee_charged")
			.eq("id", sessionId)
			.single(),
		getMicrocredits(caller.id),
		alive
			? Promise.all([sessionFee(caller.id, sessionId), report && reportStats(sessionId, report)])
			: null
	])
	const charged_until = after?.charged_until ?? null

	if (!running)
		return ok({
			alive: false,
			reason: after?.end_reason ?? owned.data.end_reason,
			microcredits,
			charged_until
		})

	const [{ rank, fee }, reported] = running
	return ok({
		alive: true,
		microcredits,
		charged_until,
		rank,
		fee,
		fee_charged: after?.fee_charged ?? 0,
		stats: reported
	})
}

export async function endSession(caller: Caller, sessionId: string) {
	const owned = await ownedSession(sessionId, caller.id)
	if (owned.failure) return owned

	const { data, error } = await stopSession(sessionId)
	if (error) return serverError("Failed to end the session.", error)

	reportedAt.delete(sessionId)
	return ok({ charged: data ?? 0 })
}

/** A rejected report doesn't fail the heartbeat. */
async function reportStats(sessionId: string, report: StatsPayload) {
	const now = Date.now()
	const since = reportedAt.get(sessionId) ?? now - HEARTBEAT_SECONDS * 1000
	const minutes = reportedMinutes(report.minutes, now - since)
	reportedAt.set(sessionId, now)

	// The database validates against the script's limits and stores it in one transaction.
	const { error } = await stats.rpc("report_session", {
		p_session: sessionId,
		p_experience: Math.round(report.experience),
		p_gold: Math.round(report.gold),
		p_minutes: minutes,
		p_custom: (report.custom ?? []).map(Math.round)
	})
	if (!error) return { accepted: true }
	// Only the database's refusal messages are meant for the loader.
	if (error.code === "23514" || error.code === "22023")
		return { accepted: false, reason: error.message }
	return {
		accepted: false,
		reason: logError("Failed to update the stats.", error)
	}
}

/** A report's JSON attachments are measured as text; the database's jsonb caps (64 and 16 KiB) sit above these. */
const MAX_SNAPSHOT_BYTES = 48 * 1024
const MAX_DIAGNOSTICS_BYTES = 12 * 1024

/** What the feedback functions raise, as the launcher should see it. */
export function mapFeedbackError(error: { code?: string; message?: string }): Failure {
	switch (error.code) {
		case "P0002":
			return { code: 404, error: "Session not found." }
		case "22023":
			return { code: 410, error: "Only sessions of the last 24 hours can be scored or reported." }
		case "54000":
			return { code: 429, error: "You've sent 5 bug reports in the last hour. Try again later." }
		case "42501":
			return { code: 403, error: "This account is banned." }
		case "23514":
			return { code: 422, error: error.message ?? "The report is too large." }
		default:
			return internalError("The feedback couldn't be saved.", error)
	}
}

/** The caller's sessions of the last 24 hours: what the loader offers to score or report. */
export async function recentSessions(caller: Caller) {
	const { data, error } = await feedback.rpc("recent_sessions", { p_user: caller.id })
	if (error) return serverError("Failed to list your sessions.", error)
	return ok({ sessions: data })
}

export async function scoreSession(caller: Caller, sessionId: string, score: number) {
	const { error } = await feedback.rpc("score_session", {
		p_user: caller.id,
		p_session: sessionId,
		p_score: score
	})
	if (error) return fail(mapFeedbackError(error))
	return ok({ score })
}

/** The size of a JSON attachment as the text the loader sent, or 0 for none. */
export function jsonBytes(value: unknown) {
	return value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), "utf8")
}

export async function reportSession(caller: Caller, sessionId: string, report: ReportPayload) {
	if (jsonBytes(report.snapshot) > MAX_SNAPSHOT_BYTES)
		return fail({ code: 413, error: "The snapshot is too large." })
	if (jsonBytes(report.diagnostics) > MAX_DIAGNOSTICS_BYTES)
		return fail({ code: 413, error: "The diagnostics are too large." })

	const { data, error } = await feedback.rpc("report_session", {
		p_user: caller.id,
		p_session: sessionId,
		p_description: report.description,
		p_log: report.log ?? "",
		p_snapshot: (report.snapshot as Json | undefined) ?? null,
		p_diagnostics: (report.diagnostics as Json | undefined) ?? null
	})
	if (error) return fail(mapFeedbackError(error))
	return ok({ report_id: data })
}
