import json
import os
import sys
import urllib.request


def make_github_request(url, method="GET", data=None, token=None):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "PR-Risk-Analyzer",
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


def analyze_pr_files(files, pr_data):
    additions = pr_data.get("additions", 0)
    deletions = pr_data.get("deletions", 0)
    changed_files_count = pr_data.get("changed_files", len(files))

    total_line_changes = additions + deletions

    dep_files = [f["filename"] for f in files if any(dep in f["filename"].lower() for dep in ["package.json", "requirements.txt", "lock", "pipfile", "pyproject.toml"])]
    sensitive_keywords = ["auth", "security", "gate", "crypto", "secret", "token", "password", "proxy", "core"]
    sensitive_files = [f["filename"] for f in files if any(k in f["filename"].lower() for k in sensitive_keywords)]
    test_files = [f["filename"] for f in files if "test" in f["filename"].lower() or "spec" in f["filename"].lower()]

    risk_score = 0
    risk_factors = []

    # 1. Size / Complexity
    if total_line_changes > 500 or changed_files_count > 20:
        risk_score += 3
        risk_factors.append("Large PR size (>500 lines or >20 files)")
    elif total_line_changes > 200 or changed_files_count > 10:
        risk_score += 2
        risk_factors.append("Medium PR size (200-500 lines or 10-20 files)")

    # 2. Dependencies
    if dep_files:
        risk_score += 2
        risk_factors.append(f"Dependency changes detected in: {', '.join(dep_files)}")

    # 3. Sensitive Code
    if sensitive_files:
        risk_score += 2
        risk_factors.append(f"Sensitive core/security files modified: {', '.join(sensitive_files[:5])}")

    # 4. Tests
    if not test_files and total_line_changes > 50:
        risk_score += 2
        risk_factors.append("No tests included for significant code changes (>50 lines)")
    elif test_files:
        risk_factors.append(f"Tests included ({len(test_files)} test file(s))")

    # Determine Risk Level
    if risk_score >= 5:
        risk_level = "HIGH 🔴"
    elif risk_score >= 2:
        risk_level = "MEDIUM 🟡"
    else:
        risk_level = "LOW 🟢"

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "risk_factors": risk_factors,
        "additions": additions,
        "deletions": deletions,
        "changed_files_count": changed_files_count,
        "dep_files": dep_files,
        "sensitive_files": sensitive_files,
        "test_files": test_files,
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

    analysis = analyze_pr_files(files, pr)

    factors_str = "\n".join([f"- {f}" for f in analysis["risk_factors"]]) if analysis["risk_factors"] else "- No major risk factors detected."

    comment_body = (
        f"### 🛡️ PR Risk Analysis Assessment\n\n"
        f"**Overall Risk Level:** `{analysis['risk_level']}`\n\n"
        f"**Summary:**\n"
        f"- **Files Changed:** {analysis['changed_files_count']}\n"
        f"- **Lines Added:** +{analysis['additions']} | **Deleted:** -{analysis['deletions']}\n"
        f"- **Test Coverage Introduced:** {'Yes (' + str(len(analysis['test_files'])) + ' file(s))' if analysis['test_files'] else 'None'}\n\n"
        f"**Risk Factors & Observations:**\n{factors_str}\n\n"
        f"*Generated automatically by MemoLM Workflow Risk Analysis.*"
    )

    comment_url = f"https://api.github.com/repos/{repo_full_name}/issues/{pr_number}/comments"
    make_github_request(comment_url, method="POST", data={"body": comment_body}, token=token)
    print(f"Risk analysis complete for PR #{pr_number}: {analysis['risk_level']}")


if __name__ == "__main__":
    main()
