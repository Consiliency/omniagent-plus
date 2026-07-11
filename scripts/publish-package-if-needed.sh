#!/usr/bin/env bash
set -euo pipefail

package_dir=${1:?usage: publish-package-if-needed.sh <package-directory>}
npm_cli=${NPM_CLI:-npm}

package=$(node -p "require('./${package_dir}/package.json').name")
version=$(node -p "require('./${package_dir}/package.json').version")

set +e
view_output=$($npm_cli view "$package@$version" version 2>&1)
view_status=$?
set -e

if [[ $view_status -eq 0 ]]; then
  echo "::notice::$package@$version is already published; skipping"
  exit 0
fi

if ! grep -Eq 'E404|404 Not Found' <<<"$view_output"; then
  printf '%s\n' "$view_output" >&2
  exit "$view_status"
fi

echo "::notice::$package@$version is not published; publishing"
pack_dir=$(mktemp -d)
trap 'rm -rf "$pack_dir"' EXIT
tarball=$(pnpm --dir "$package_dir" pack --pack-destination "$pack_dir" | tail -n1)
publish_args=("$tarball" --access public)
if [[ ${NPM_PUBLISH_DRY_RUN:-0} == 1 ]]; then
  publish_args+=(--dry-run)
fi
$npm_cli publish "${publish_args[@]}"
