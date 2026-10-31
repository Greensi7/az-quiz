#!/usr/bin/env bash
# Publish only this project's public files. Authentication stays with GitHub CLI.
set +x
set -euo pipefail
# Do not inherit verbose transport diagnostics into an authenticated publish.
unset GH_DEBUG GIT_TRACE GIT_TRACE_CURL GIT_CURL_VERBOSE

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || fail 'Install GitHub CLI from https://cli.github.com, then run: gh auth login'
command -v git >/dev/null 2>&1 || fail 'Git is required to publish. Install Git, then rerun this command.'
export GH_HOST=github.com
gh auth status --hostname github.com >/dev/null 2>&1 || fail 'Sign in once with: gh auth login --hostname github.com'

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$project_dir"
repo_name="${1:-az-quiz}"
[[ "$repo_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || fail 'Use a repository name such as az-quiz, without an owner or URL.'
[[ "$#" -le 1 ]] || fail 'Usage: ./publish.sh [repository-name]'

# Deliberately never use `git add .`, a wildcard upload, or the source .git folder.
public_files=(index.html style.css script.js README.md sample-quiz.txt sample-drill2.txt publish.sh .gitignore .nojekyll)
credential_pattern='-----BEGIN ([A-Z]+ )*PRIVATE KEY-----|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-proj-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}'
for public_file in "${public_files[@]}"; do
  [[ -f "$public_file" && ! -L "$public_file" ]] || fail "Missing file or unsupported symbolic link: $public_file"
  if LC_ALL=C grep -Eq -- "$credential_pattern" "$public_file"; then
    fail "Possible credential in $public_file. Nothing has been uploaded. Remove it before publishing."
  fi
done

owner="$(gh api user --jq .login)"
user_id="$(gh api user --jq .id)"
remote="$owner/$repo_name"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/az-play-publish.XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT

if gh repo view "$remote" --json name >/dev/null 2>&1; then
  visibility="$(gh repo view "$remote" --json visibility --jq .visibility)"
  [[ "$visibility" == PUBLIC ]] || fail 'The existing repository is private. Choose a new repository name; this script will not change its visibility.'
  gh repo clone "https://github.com/$remote.git" "$temp_dir/site" -- --quiet --depth=1
  [[ -f "$temp_dir/site/.az-play-site" && ! -L "$temp_dir/site/.az-play-site" ]] || fail "The repository $remote already exists and was not created by this publisher. Try: ./publish.sh another-name"
  [[ "$(cat "$temp_dir/site/.az-play-site")" == 'az-play-static-v1' ]] || fail 'Unrecognized repository marker. Choose a different repository name.'
  [[ "$(git -C "$temp_dir/site" branch --show-current)" == main ]] || fail 'The publishing repository must use main as its default branch.'
  while IFS= read -r tracked_file; do
    allowed=false
    for public_file in "${public_files[@]}" .az-play-site; do
      [[ "$tracked_file" != "$public_file" ]] || allowed=true
    done
    [[ "$allowed" == true ]] || fail "The remote contains an extra file ($tracked_file). Refusing to publish unrelated files."
  done < <(git -C "$temp_dir/site" ls-files)
else
  printf 'Creating public GitHub repository %s…\n' "$remote"
  gh repo create "$remote" --public --description 'AZ / play — a two-player quiz game on one screen' >/dev/null
  git init --quiet "$temp_dir/site"
  git -C "$temp_dir/site" checkout --quiet -b main
  git -C "$temp_dir/site" remote add origin "https://github.com/$remote.git"
fi

for public_file in "${public_files[@]}"; do
  # Replace any remote symlink before copying a known public file.
  rm -f -- "$temp_dir/site/$public_file"
  cp -- "$project_dir/$public_file" "$temp_dir/site/$public_file"
done
printf '%s\n' 'az-play-static-v1' > "$temp_dir/site/.az-play-site"
git -C "$temp_dir/site" add -- "${public_files[@]}" .az-play-site
if ! git -C "$temp_dir/site" diff --cached --quiet; then
  git -C "$temp_dir/site" -c user.name="$owner" -c user.email="$user_id+$owner@users.noreply.github.com" -c commit.gpgsign=false commit --quiet -m 'Publish AZ / play'
  git -C "$temp_dir/site" -c credential.helper= -c 'credential.helper=!gh auth git-credential' push --quiet origin main
fi
commit_sha="$(git -C "$temp_dir/site" rev-parse HEAD)"

pages_method=POST
if gh api "repos/$remote/pages" >/dev/null 2>&1; then pages_method=PUT; fi
gh api --method "$pages_method" "repos/$remote/pages" --input - >/dev/null <<'PAGES'
{"build_type":"legacy","source":{"branch":"main","path":"/"}}
PAGES
site_url="$(gh api "repos/$remote/pages" --jq .html_url)"
printf 'Publishing %s\nWaiting for GitHub Pages' "$site_url"
for ((attempt=0; attempt<60; attempt++)); do
  build_info="$(gh api "repos/$remote/pages/builds/latest" --jq '[.commit, .status] | @tsv' 2>/dev/null || true)"
  if [[ "$build_info" == "$commit_sha"$'\t''built' ]]; then
    printf '\nYour game is online: %s\n' "$site_url"
    exit 0
  fi
  if [[ "$build_info" == "$commit_sha"$'\t''errored' ]]; then
    printf '\n' >&2
    fail "GitHub Pages reported a build error. Check https://github.com/$remote/actions"
  fi
  printf '.'
  sleep 5
done
printf '\nFiles are published; GitHub Pages is still deploying.\nSite: %s\nProgress: https://github.com/%s/actions\n' "$site_url" "$remote"
