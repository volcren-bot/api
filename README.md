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

Optional: `HOST`, `PORT`, and `MAX_OPEN_SESSIONS` (sessions one user can have open at once, default 5).

## Contract

Every endpoint except `GET /` takes `Authorization: Bearer <supabase access token>` and returns JSON. Errors are `{ "error": "message" }`.

| Status | Meaning                                                                   |
| ------ | ------------------------------------------------------------------------- |
| 401    | Token missing, invalid or expired: refresh it and retry once.             |
| 402    | Not enough credits to start. Body has `required`.                         |
| 403    | Banned or deleted account, or no access to the script.                    |
| 404    | No such session for this account (other people's sessions look the same). |
| 409    | No live revision, or too many open sessions.                              |
| 422    | Missing or invalid header, param or body.                                 |
| 429    | Rate limited. `Retry-After` is in seconds.                                |
| 502    | The script files couldn't be prepared. The session was ended, not billed. |

| Endpoint                                | Returns                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                 | `{ api_version }`. Public.                                                                                                             |
| `GET /launcher/me`                      | `{ username, avatar_url, role, credits, min_balance_minutes, api_version }`                                                            |
| `GET /launcher/scripts?q=&category=`    | `{ scripts: [{ id, url, title, description, categories, stage, type, price, revision, cover_url, can_access, author, online }] }`      |
| `POST /launcher/sessions`               | Body `{ script_id }`. `{ session_id, revision, price, files: [{ name, url }], heartbeat_seconds }`. URLs expire in 60 s.               |
| `POST /launcher/sessions/:id/heartbeat` | Body `{ stats?: { experience, gold, minutes, custom? } }`. `{ alive, reason?, credits, charged_until, stats?: { accepted, reason? } }` |
| `POST /launcher/sessions/:id/end`       | `{ charged }`. Safe to repeat.                                                                                                         |

### Sessions

`price` is credits per minute, fixed when the session starts. Send a heartbeat every `heartbeat_seconds`; the database ends a session after 5 minutes without one. When `alive` is false, `reason` is `insufficient_credits`, `timeout` or `stopped`, and the launcher must stop the script.

### Stats

Stats ride on the heartbeat and are optional. `experience` and `gold` are the gain since the previous heartbeat. The script's limits (`stats.limits`) are per minute of runtime, and a pair of 0 and 0 means no limit. The runtime a report can claim is the smaller of `minutes` and the time the server saw pass since the previous report, so a launcher can't claim more than really elapsed. A rejected report returns `stats.accepted: false` with a reason and does not end the session.

`custom` holds the deltas of the script's custom trackers (`stats.limits_custom`), in tracker order, and each has per-minute limits like the rest. The whole report is checked and stored by `stats.report_session` in one transaction, so a rejected report changes nothing.

## Layout

| Path                    | Contents                                                        |
| ----------------------- | --------------------------------------------------------------- |
| `src/index.ts`          | Server, CORS, OpenAPI docs, error shape, route autoload.        |
| `src/routes/`           | One file per route group. The path is the URL.                  |
| `src/lib/auth.ts`       | Token check, ban check.                                         |
| `src/lib/launcher.ts`   | What the endpoints do: account, store listing, sessions, stats. |
| `src/lib/supabase.ts`   | Admin, anon and per-user clients.                               |
| `src/lib/validation.ts` | Runtime a report can claim.                                    |
| `src/lib/types/`        | Generated database types and request schemas.                   |

## Known gaps

- `can_access` is asked of the database once per listed script (in batches), because the access rules live there. A single database function taking a list of ids would be cheaper.
- Revisions don't carry a file hash yet, so the launcher can't verify downloads beyond TLS.
