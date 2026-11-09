import { writeFile } from "fs/promises"
import { join } from "path"

const url =
	process.env.SUPABASE_URL +
	"/api/v1/projects/default/types/typescript?included_schemas=public%2C%20storage"
const outputPath = join(__dirname, "supabase.ts")
const credentials = `${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASS}`

// Fetched before anything is written, so a failed request leaves the old types in place.
const response = await fetch(url, {
	headers: {
		accept: "application/json",
		authorization: "Basic " + Buffer.from(credentials).toString("base64")
	}
})
if (!response.ok) throw new Error(`Request failed with status ${response.status}`)

const { types } = await response.json()
await writeFile(outputPath, types)
console.log(`Types file updated: ${outputPath}`)
