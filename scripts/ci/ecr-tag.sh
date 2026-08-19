#!/usr/bin/env bash
# Point REPO:DST_TAG at the image REPO:SRC_TAG already refers to. Server-side
# manifest copy: no docker pull or push, a second or two per tag.
#
#   ecr-tag.sh <repository name or URL> <dst-tag> --from-tag <src-tag>
#
# deploy.yml uses it to stamp this commit's sha on images that did not need a
# rebuild, so every deployed commit has web/api/brain:<sha>, and to put :latest
# back on the previous release when a rollout fails. Needs ecr:BatchGetImage and
# ecr:PutImage on the repository, both already held by the deploy role.
set -euo pipefail

usage() {
  echo "usage: $0 <repo> <dst-tag> --from-tag <src-tag>" >&2
  exit 2
}
[ $# -eq 4 ] && [ "$3" = "--from-tag" ] || usage
repo="${1##*/}" # accept the full ECR URL or the bare repository name
dst="$2"
src="$4"

# batch-get-image reports a missing tag under .failures with exit 0, so check
# that rather than the exit code. No --accepted-media-types: the default set
# returns whatever the tag points at, index or single manifest, which is also
# what AWS's own multi-arch retag procedure relies on.
resp=$(aws ecr batch-get-image --repository-name "$repo" --image-ids "imageTag=$src" --output json)
if [ "$(jq -r '.failures | length' <<<"$resp")" != "0" ]; then
  echo "::error::$repo:$src not found: $(jq -r '.failures[0].failureReason' <<<"$resp")" >&2
  exit 1
fi
manifest=$(jq -r '.images[0].imageManifest' <<<"$resp")
media_type=$(jq -r '.images[0].imageManifestMediaType // empty' <<<"$resp")
digest=$(jq -r '.images[0].imageId.imageDigest' <<<"$resp")

args=(--repository-name "$repo" --image-tag "$dst" --image-manifest "$manifest")
if [ -n "$media_type" ]; then
  args+=(--image-manifest-media-type "$media_type")
fi

# ImageAlreadyExistsException means DST already points at this exact digest.
# On a MUTABLE repository any other digest is simply moved. Either way DST
# ends up where we want it.
if out=$(aws ecr put-image "${args[@]}" 2>&1); then
  echo "$repo:$dst -> $src ($digest)"
elif grep -q ImageAlreadyExistsException <<<"$out"; then
  echo "$repo:$dst already at $src ($digest)"
else
  echo "$out" >&2
  exit 1
fi
