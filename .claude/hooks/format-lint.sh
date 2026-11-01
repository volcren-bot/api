#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): format the touched file, then lint it.
# Formatting is silent. Lint findings go to stderr with exit 2 so Claude sees and fixes them.
set -uo pipefail

f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[[ -n "$f" && -f "$f" ]] || exit 0
root=$(cd "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root" || exit 0
out=""
case "$f" in
"$root"/node_modules/* | "$root"/build/* | "$root"/.svelte-kit/*) exit 0 ;;
esac
rel=${f#"$root"/}
bin=./node_modules/.bin
[[ -x $bin/prettier ]] && "$bin/prettier" --write --ignore-unknown "$rel" >/dev/null 2>&1
case "$f" in
*.ts | *.js | *.mjs | *.cjs | *.svelte)
	[[ -x $bin/eslint ]] && out=$("$bin/eslint" "$rel" 2>&1) || true
	;;
esac

if [[ -n "$out" ]]; then
	printf 'Lint issues in %s:\n%s\n' "$f" "$out" >&2
	exit 2
fi
exit 0
