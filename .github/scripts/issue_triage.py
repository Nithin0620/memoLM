import json
import os
import sys
import urllib.request


def make_github_request(url, method="GET", data=None, token=None):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Issue-Triage-Bot",
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


def analyze_issue(title, body):
    text = f"{title}\n{body}".lower()

    # Determine Type
    issue_type = "feature"
    if any(k in text for k in ["security", "vulnerability", "cve", "exploit", "leak", "secret"]):
        issue_type = "security"
    elif any(k in text for k in ["doc", "docs", "readme", "documentation", "typo"]):
        issue_type = "documentation"
    elif any(k in text for k in ["question", "help", "how to", "support", "usage"]):
        issue_type = "question"
    elif any(k in text for k in ["bug", "error", "fail", "crash", "broken", "fix", "exception"]):
        issue_type = "bug"
    elif any(k in text for k in ["feat", "feature", "add", "proposal", "request"]):
        issue_type = "feature"

    # Determine Priority
    priority = "P2"
    if any(k in text for k in ["p0", "critical", "blocker", "urgent", "data loss"]):
        priority = "P0"
    elif any(k in text for k in ["p1", "high priority", "important", "severe", "regression"]):
        priority = "P1"
    elif any(k in text for k in ["p3", "low priority", "minor", "nice to have", "tweak"]):
        priority = "P3"

    # Determine Component
    component = "Backend"
    if any(k in text for k in ["frontend", "ui", "react", "dashboard", "component"]):
        component = "Frontend"
    elif any(k in text for k in ["sdk", "client", "python sdk", "typescript sdk"]):
        component = "SDK"
    elif any(k in text for k in ["doc", "docs", "readme"]):
        component = "Docs"
    elif any(k in text for k in ["ci", "workflow", "action", "github"]):
        component = "CI"

    labels = [issue_type, priority, component.lower()]

    return {
        "type": issue_type,
        "priority": priority,
        "component": component,
        "labels": labels,
    }


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    token = os.environ.get("GITHUB_TOKEN")

    if not event_path or not os.path.exists(event_path):
        print("No GITHUB_EVENT_PATH found or file does not exist.")
        sys.exit(0)

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue")
    if not issue:
        print("No issue in event payload.")
        sys.exit(0)

    issue_number = issue.get("number")
    repo_full_name = event.get("repository", {}).get("full_name")
    title = issue.get("title", "")
    body = issue.get("body", "") or ""

    result = analyze_issue(title, body)

    comment_body = (
        f"### 🤖 Automated Issue Triage\n\n"
        f"- **Type:** `{result['type']}`\n"
        f"- **Priority:** `{result['priority']}`\n"
        f"- **Component:** `{result['component']}`\n"
        f"- **Labels Applied:** {', '.join([f'`{l}`' for l in result['labels']])}\n\n"
        f"*This triage analysis was generated automatically by MemoLM Workflow.*"
    )

    print(f"Triage result for Issue #{issue_number}: {result}")

    if token and repo_full_name and issue_number:
        # Post comment
        comment_url = f"https://api.github.com/repos/{repo_full_name}/issues/{issue_number}/comments"
        make_github_request(comment_url, method="POST", data={"body": comment_body}, token=token)

        # Add labels
        labels_url = f"https://api.github.com/repos/{repo_full_name}/issues/{issue_number}/labels"
        make_github_request(labels_url, method="POST", data={"labels": result["labels"]}, token=token)


if __name__ == "__main__":
    main()
