# Volcren API

The service the Volcren launcher talks to. It sits between the launcher and the database, because the session, billing and stats functions are `service_role` only and the launcher can't hold that key.

Bun + [Elysia](https://elysiajs.com), with routes loaded from `src/routes/` by path. Interactive docs are served at `/docs`.

## Run

```sh
cp .env.example .env     # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
bun install
bun run dev              # http://localhost:3000
```

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `bun run dev`      | Run with reload.                               |
| `bun run build`    | Bundle to `build/` (`bun run start` runs src). |
| `bun test`         | Unit tests.                                    |
| `bun run check`    | Type check.                                    |
| `bun run lint`     | Prettier and ESLint.                           |
| `bun run gentypes` | Regenerate `src/lib/types/supabase.ts`.        |

Optional: `HOST` and `PORT`.

## Contract

Every endpoint except `GET /` takes `Authorization: Bearer <supabase access token>` and returns JSON. Errors are `{ "error": "message" }`.

| Status | Meaning                                                                                 |
| ------ | --------------------------------------------------------------------------------------- |
| 401    | Token missing, invalid or expired: refresh it and retry once.                           |
| 402    | Not enough credits to start. Body has `required`.                                       |
| 403    | Banned or deleted account, or no access to the script.                                  |
| 404    | No such session for this account (other people's sessions look the same).               |
| 409    | No live revision, or a share code that can't be used.                                   |
| 410    | The share code has expired, or the session is older than 24 hours.                      |
| 413    | The body is over 64 KiB (512 KiB for a bug report), or an attachment is over its limit. |
| 422    | Missing or invalid header, param or body.                                               |
| 429    | Rate limited. `Retry-After` is in seconds.                                              |
| 502    | The script files couldn't be prepared. The session was ended, not billed.               |

| Endpoint                                        | Returns                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                         | `{ api_version }`. Public.                                                                                                                                     |
| `GET /launcher/me`                              | `{ username, avatar_url, role, credits, min_balance_minutes, open_sessions, extra_session_fee, minutes_per_month, api_version }`                               |
| `GET /launcher/scripts?q=&category=&community=` | `{ scripts: [{ id, url, title, description, categories, stage, type, price, revision, cover_url, can_access, community, granted, author, online }] }`          |
| `POST /launcher/scripts/redeem`                 | Body `{ code }`. `{ script_id, url }`, or an error with a `reason`. See Community scripts.                                                                     |
| `DELETE /launcher/scripts/:id/grant`            | `{ removed: true }`. Takes a granted script off the account.                                                                                                   |
| `POST /launcher/sessions`                       | Body `{ script_id }`. `{ session_id, revision, price, rank, fee, files: [{ name, url }], key, heartbeat_seconds }`. URLs expire in 60 s. See Sessions.         |
| `POST /launcher/sessions/:id/heartbeat`         | Body `{ stats?: { experience, gold, minutes, custom? } }`. `{ alive, reason?, credits, charged_until, rank, fee, fee_charged, stats?: { accepted, reason? } }` |
| `POST /launcher/sessions/:id/end`               | `{ charged }`. Safe to repeat.                                                                                                                                 |
| `GET /launcher/sessions`                        | `{ sessions: [{ session_id, script_id, title, url, revision, started_at, ended_at, score, reports }] }`. The last 24 hours. See Feedback.                      |
| `POST /launcher/sessions/:id/score`             | Body `{ score }` (1 to 10). `{ score }`.                                                                                                                       |
| `POST /launcher/sessions/:id/report`            | Body `{ description, log?, snapshot?, diagnostics? }`. `{ report_id }`.                                                                                        |

### Community scripts and share codes

A script is **official** when its author is a scripter or above and **community** otherwise (`community: true` in the list). The default list has the published official scripts, the community scripts the account wrote or was granted, and granted official scripts even when unpublished. `?community=true` lists every community script the account can see and needs the tester role (403 otherwise).

Community scripts are never premium and run for their author, tester+ and people holding a grant. A banned author's scripts disappear for everyone below moderator, and their running sessions end.

`POST /launcher/scripts/redeem` redeems a single-use share code (64 hex digits, whitespace and case are forgiven). The database marks the code used and adds the grant in one step, so a code can never work twice. A grant makes the script appear in the list with `granted: true`, and premium scripts run free. Failures: `invalid` (404), `expired` (410), `used`, `own` (the account wrote the script or made the code) and `already_access` (409, the code stays unused), `rate_limited` (429). The API allows 5 redemptions a minute per user and 10 per IP, and the database stops answering an account after 10 failed attempts an hour. `DELETE /launcher/scripts/:id/grant` removes the script again; the code stays used.

`api_version` is 2: launchers that predate community scripts would run them without the warning, so they are told to update.

### Sessions

Script files are stored encrypted (AES-256-GCM, see the database notes). `key` is the revision's key as 64 hex digits, or `null` for a revision published before encryption, whose files are plain. Each file is `nonce (12 bytes) || ciphertext || tag`, authenticated with `volcren:<script id>/<9-digit revision>/<file name>`. The key is only given to a started session and never logged.

`price` is credits per minute, fixed when the session starts. Send a heartbeat every `heartbeat_seconds`; the database ends a session after 5 minutes without one. When `alive` is false, `reason` is `insufficient_credits`, `timeout` or `stopped`, and the launcher must stop the script.

An account can have any number of sessions open, but every one past the oldest pays an **extra-session fee** on top of its price: `extra_session_fee` credits per 30 days of running (`minutes_per_month`, 43200), charged a whole credit at a time as it accrues. `rank` is a session's place among the account's open sessions by start time, 0 for the oldest, and is recomputed every minute: when the oldest ends, the next one stops paying. Tester+ pay no fee, and `GET /launcher/me` reports `extra_session_fee: 0` for them. The start and heartbeat answers carry the session's `rank` and `fee`; a launcher about to start a script computes the instance's monthly cost as `price * minutes_per_month + fee`. The balance needed to start or keep running is `min_balance_minutes` of the price plus the fee for that time, so an extra instance of a free script needs a credit. A `402` on start carries the `required` balance.

### Stats

Stats ride on the heartbeat and are optional. `experience` and `gold` are the gain since the previous heartbeat. The script's limits (`stats.limits`) are per minute of runtime, and a pair of 0 and 0 means no limit. The runtime a report can claim is the smaller of `minutes` and the time the server saw pass since the previous report, so a launcher can't claim more than really elapsed. A rejected report returns `stats.accepted: false` with a reason and does not end the session.

`custom` holds the deltas of the script's custom trackers (`stats.limits_custom`), in tracker order, and each has per-minute limits like the rest. The whole report is checked and stored by `stats.report_session` in one transaction, so a rejected report changes nothing.

### Feedback

Scores and bug reports are internal: the script's author sees score aggregates and the full reports, moderators see everything, and a report can be assigned to a tester. Both are filed on a session of the caller that started or ended within the last 24 hours, which `GET /launcher/sessions` lists (newest first, at most 50) with the caller's current `score` of each script and the number of `reports` they filed on each session.

`POST /launcher/sessions/:id/score` keeps one score per account per script: scoring again replaces it and records the session. `POST /launcher/sessions/:id/report` takes an optional `description` (2000 characters), the script's `log` (256 KiB, the loader sends the tail; an empty log is stored as none), a game state `snapshot` (48 KiB as JSON) and `diagnostics` (12 KiB as JSON: versions, and system info when the user allows it). The API refuses bodies over 64 KiB by `Content-Length` except on the report endpoint, which takes up to 512 KiB, Bun's limit for the whole server. The database caps every column again, keeps 5 reports an hour per account and clears the attachments after 90 days. Errors: `404` not the caller's session, `410` older than 24 hours, `413` an attachment over its limit, `429` too fast or 5 reports in the hour.

## Layout

| Path                    | Contents                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| `src/index.ts`          | Server, CORS, OpenAPI docs, error shape, route autoload.                  |
| `src/routes/`           | One file per route group. The path is the URL.                            |
| `src/lib/auth.ts`       | Token check, ban check.                                                   |
| `src/lib/launcher.ts`   | What the endpoints do: account, store listing, sessions, stats, feedback. |
| `src/lib/supabase.ts`   | Admin, anon and per-user clients.                                         |
| `src/lib/validation.ts` | Runtime a report can claim.                                               |
| `src/lib/types/`        | Generated database types and request schemas.                             |

## Known gaps

- `can_access` is asked of the database once per listed script (in batches), because the access rules live there. A single database function taking a list of ids would be cheaper.
- Revisions don't carry a file hash yet, so the launcher can't verify downloads beyond TLS.
