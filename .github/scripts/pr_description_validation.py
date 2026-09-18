import json
import os
import re
import sys
import urllib.request


def make_github_request(url, method="GET", data=None, token=None):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "PR-Description-Validator",
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


def validate_pr_body(body):
    body_text = (body or "").strip()

    missing = []
    found = []

    # 1. Check for Description / What changed
    if any(k in body_text.lower() for k in ["description", "changes made", "what changed", "summary", "overview"]):
        found.append("What changed?")
    else:
        missing.append("What changed?")

    # 2. Check for Testing
    if any(k in body_text.lower() for k in ["testing", "tests", "how was this tested", "verification"]):
        found.append("Testing details")
    else:
        missing.append("Testing details")

    # 3. Check for Related issue
    if re.search(r"(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved|issue|related)\s*#\d+", body_text, re.IGNORECASE) or "related issue" in body_text.lower():
        found.append("Related issue reference")
    else:
        missing.append("Related issue reference")

    is_valid = len(missing) == 0

    return {
        "is_valid": is_valid,
        "missing": missing,
        "found": found,
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
    body = pr.get("body", "")

    validation = validate_pr_body(body)

    if not validation["is_valid"]:
        missing_bullets = "\n".join([f"- ❌ **{item}**" for item in validation["missing"]])
        comment_body = (
            f"### 📋 PR Description Validation\n\n"
            f"Thank you for your pull request! Our automated check noticed that some required information is missing from the PR description:\n\n"
            f"{missing_bullets}\n\n"
            f"Please update the PR description to include these sections so reviewers can easily understand and verify your changes."
        )

        print(f"PR #{pr_number} validation failed. Missing: {validation['missing']}")

        if token and repo_full_name:
            comment_url = f"https://api.github.com/repos/{repo_full_name}/issues/{pr_number}/comments"
            make_github_request(comment_url, method="POST", data={"body": comment_body}, token=token)
    else:
        print(f"PR #{pr_number} description validation passed!")


if __name__ == "__main__":
    main()
