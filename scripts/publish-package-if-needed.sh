#!/usr/bin/env bash
set -euo pipefail

npm_cli=${NPM_CLI:-npm}
verified=0
if [[ ${1:-} == --verified-artifact ]]; then
  [[ $# == 5 && $4 == --expected-manifest-sha256 ]] || { echo 'Independent manifest digest required' >&2; exit 1; }
  manifest=$2
  expected=$5
  identity=$(node scripts/verify-publish-artifacts.mjs "$manifest" "$expected" "$3")
  {
    IFS= read -r package
    IFS= read -r version
    IFS= read -r tarball
  } <<<"$identity"
  verified=1
else
  [[ $# == 1 && $1 != --* ]] || { echo 'Expected package directory or verified artifact' >&2; exit 1; }
  package_dir=$1
  identity=$(node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(typeof p.name!=="string"||typeof p.version!=="string")process.exit(1);console.log(p.name+"\n"+p.version);' "$package_dir/package.json")
  {
    IFS= read -r package
    IFS= read -r version
  } <<<"$identity"
fi

set +e
view_output=$("$npm_cli" view "$package@$version" version --json 2>/dev/null)
view_status=$?
set -e

if [[ $view_status -eq 0 ]]; then
  echo "::notice::$package@$version is already published; skipping"
  exit 0
fi

if ! printf '%s' "$view_output" | node -e 'try { const result=JSON.parse(require("node:fs").readFileSync(0,"utf8"));process.exit(result?.error?.code==="E404"?0:1); } catch { process.exit(1); }'; then
  printf '%s\n' 'Registry lookup failed without a structured E404; refusing publication' >&2
  exit "$view_status"
fi

echo "::notice::$package@$version is not published; publishing"
if [[ $verified == 0 ]]; then
  pack_dir=$(mktemp -d)
  trap 'rm -rf "$pack_dir"' EXIT
  tarball=$(pnpm --dir "$package_dir" pack --pack-destination "$pack_dir" | tail -n1)
else
  node scripts/verify-publish-artifacts.mjs "$manifest" "$expected" >/dev/null
fi
publish_args=("$tarball" --access public)
if [[ ${NPM_PUBLISH_DRY_RUN:-0} == 1 ]]; then
  publish_args+=(--dry-run)
fi
"$npm_cli" publish "${publish_args[@]}"
