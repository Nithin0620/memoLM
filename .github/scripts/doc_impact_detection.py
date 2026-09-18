import json
import os
import sys
import urllib.request


def make_github_request(url, method="GET", data=None, token=None):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Doc-Impact-Detector",
    }
    if token:
        headers["Authorization"] = f"token {token}"

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 204:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"HTTP Request failed: {e}", file=sys.stderr)
        return None


def analyze_doc_impact(files):
    filenames = [f.get("filename", "") for f in files]

    # Core / public API areas
    core_code_patterns = ["backend/", "sdk/", "frontend/"]
    doc_patterns = ["docs/", "readme.md", ".md"]

    core_changes = [
        fn for fn in filenames
        if any(p in fn.lower() for p in core_code_patterns) and not any(dp in fn.lower() for dp in ["test", "spec", "docs/"])
    ]

    doc_changes = [
        fn for fn in filenames
        if any(fn.lower().startswith(p) or fn.lower().endswith(p) for p in doc_patterns)
    ]

    has_core_changes = len(core_changes) > 0
    has_doc_changes = len(doc_changes) > 0

    warn = has_core_changes and not has_doc_changes

    return {
        "warn": warn,
        "has_core_changes": has_core_changes,
        "has_doc_changes": has_doc_changes,
        "core_changes": core_changes,
        "doc_changes": doc_changes,
    }


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    token = os.environ.get("GITHUB_TOKEN")

    if not event_path or not os.path.exists(event_path):
        print("No GITHUB_EVENT_PATH found.")
        sys.exit(0)

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    pr = event.get("pull_request")
    if not pr:
        print("No pull request found in payload.")
        sys.exit(0)

    pr_number = pr.get("number")
    repo_full_name = event.get("repository", {}).get("full_name")

    if not token or not repo_full_name:
        print("Missing GITHUB_TOKEN or repository info.")
        sys.exit(0)

    files_url = f"https://api.github.com/repos/{repo_full_name}/pulls/{pr_number}/files?per_page=100"
    files = make_github_request(files_url, token=token) or []

    result = analyze_doc_impact(files)

    if result["warn"]:
        changed_core = "\n".join([f"- `{f}`" for f in result["core_changes"][:5]])
        comment_body = (
            f"### 📚 Documentation Impact Warning\n\n"
            f"This PR modifies public API or core codebase files:\n"
            f"{changed_core}\n\n"
            f"⚠️ **No documentation files or README changes were detected in this PR.**\n"
            f"Please ensure corresponding documentation in `docs/` or `README.md` is updated if functionality or APIs changed."
        )

        comment_url = f"https://api.github.com/repos/{repo_full_name}/issues/{pr_number}/comments"
        make_github_request(comment_url, method="POST", data={"body": comment_body}, token=token)
        print(f"Doc impact warning posted on PR #{pr_number}.")
    else:
        print(f"Doc impact check passed for PR #{pr_number}.")


if __name__ == "__main__":
    main()
