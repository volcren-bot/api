import { checkRevision, newestLib } from "./checker"
import { logError } from "./request"
import { scripts } from "./supabase"

const SWEEP_EVERY_MS = 5 * 60_000
const PAGE = 200

let running = false

export async function sweep() {
	if (running) return
	running = true
	try {
		const release = await newestLib()
		const { data: stale, error } = await scripts
			.from("versions")
			.select("id, revision")
			.eq("status", "live")
			.or(`checked_lib.is.null,checked_lib.neq.${release.version}`)
			.order("checked_at", { ascending: true, nullsFirst: true })
			.limit(PAGE)
		if (error) throw error
		let broken = 0
		for (const { id, revision } of stale) {
			try {
				const result = await checkRevision(id, revision, release)
				if (result.problems.length) broken++
			} catch (e) {
				logError(`Couldn't check revision ${revision} of ${id}.`, e)
			}
		}
		if (stale.length)
			console.log(
				`checked ${stale.length} live revisions against lib ${release.version}, ${broken} broken`
			)
	} catch (e) {
		logError("The script check sweep failed.", e)
	} finally {
		running = false
	}
}

export function startSweeps() {
	void sweep()
	setInterval(() => void sweep(), SWEEP_EVERY_MS)
}
