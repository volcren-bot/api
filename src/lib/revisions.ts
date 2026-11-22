import { createHash } from "node:crypto"
import { authenticate, bearerToken } from "./auth"
import { checkRevision } from "./checker"
import { fail, logError, ok, serverError, type Outcome } from "./request"
import { profiles, scripts } from "./supabase"

const DEPLOY_TOKEN_PREFIX = "vdt_"

async function mayCheck(header: string | undefined, scriptId: string): Promise<Outcome<true>> {
	const token = bearerToken(header)
	if (token?.startsWith(DEPLOY_TOKEN_PREFIX)) {
		const { error } = await scripts.rpc("use_deploy_token", {
			p_script: scriptId,
			p_token_hash: createHash("sha256").update(token).digest("hex")
		})
		if (error?.code === "42501")
			return fail({ code: 401, error: "Invalid deploy token for this script." })
		if (error) return serverError("Failed to check the deploy token.", error)
		return ok(true)
	}

	const caller = await authenticate(header)
	if (caller.failure) return caller
	const [author, moderator] = await Promise.all([
		scripts.rpc("is_author", { user_id: caller.data.id, script_id: scriptId }),
		profiles.rpc("min_role", { user_id: caller.data.id, target_role: "moderator" })
	])
	if (author.error || moderator.error)
		return serverError("Failed to check the script's author.", author.error ?? moderator.error)
	if (author.data !== true && moderator.data !== true)
		return fail({
			code: 403,
			error: "Only the script's author or a moderator can check its revisions."
		})
	return ok(true)
}

export async function checkUpload(header: string | undefined, scriptId: string, revision: number) {
	const allowed = await mayCheck(header, scriptId)
	if (allowed.failure) return allowed

	const { data: version, error } = await scripts
		.from("versions")
		.select("status")
		.eq("id", scriptId)
		.eq("revision", revision)
		.maybeSingle()
	if (error) return serverError("Failed to read the revision.", error)
	if (!version) return fail({ code: 404, error: "Revision not found." })
	if (version.status !== "pending")
		return fail({
			code: 409,
			error: `Revision ${revision} is ${version.status}, only a pending revision is checked on upload.`
		})

	try {
		const result = await checkRevision(scriptId, revision)
		return ok({
			passed: result.problems.length === 0,
			injector: result.injector,
			problems: result.problems
		})
	} catch (e) {
		return fail({ code: 502, error: logError("The script check couldn't run.", e) })
	}
}
