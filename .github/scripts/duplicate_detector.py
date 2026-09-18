import json
import math
import os
import re
import sys
import urllib.request


def tokenize(text):
    words = re.findall(r"\w+", text.lower())
    stopwords = {
        "the", "a", "an", "is", "are", "was", "were", "to", "in", "on", "at", "by", "for", "with",
        "about", "against", "between", "into", "through", "during", "before", "after", "above",
        "below", "from", "up", "down", "of", "off", "over", "under", "again", "further", "then",
        "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each",
        "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
        "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
        "this", "that", "it", "i", "my", "we", "our", "you", "your", "he", "she", "they"
    }
    return [w for w in words if w not in stopwords and len(w) > 1]


def compute_tf(tokens):
    tf = {}
    for w in tokens:
        tf[w] = tf.get(w, 0) + 1
    total = len(tokens) or 1
    return {k: v / total for k, v in tf.items()}


def cosine_similarity(tokens1, tokens2):
    tf1 = compute_tf(tokens1)
    tf2 = compute_tf(tokens2)

    all_words = set(tf1.keys()).union(set(tf2.keys()))
    if not all_words:
        return 0.0

    dot = sum(tf1.get(w, 0) * tf2.get(w, 0) for w in all_words)
    mag1 = math.sqrt(sum(v * v for v in tf1.values()))
    mag2 = math.sqrt(sum(v * v for v in tf2.values()))

    if mag1 * mag2 == 0:
        return 0.0

    return dot / (mag1 * mag2)


def make_github_request(url, method="GET", data=None, token=None):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Duplicate-Issue-Detector",
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


def find_duplicates(current_issue, existing_issues, threshold=0.4):
    curr_tokens = tokenize(f"{current_issue.get('title', '')} {current_issue.get('body', '')}")
    duplicates = []

    for issue in existing_issues:
        if issue.get("number") == current_issue.get("number"):
            continue
        if "pull_request" in issue:
            continue

        other_tokens = tokenize(f"{issue.get('title', '')} {issue.get('body', '')}")
        sim = cosine_similarity(curr_tokens, other_tokens)

        if sim >= threshold:
            duplicates.append({
                "number": issue.get("number"),
                "title": issue.get("title"),
                "similarity": round(sim * 100, 1),
                "html_url": issue.get("html_url", f"# {issue.get('number')}")
            })

    duplicates.sort(key=lambda x: x["similarity"], reverse=True)
    return duplicates


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    token = os.environ.get("GITHUB_TOKEN")

    if not event_path or not os.path.exists(event_path):
        print("No GITHUB_EVENT_PATH found.")
        sys.exit(0)

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue")
    if not issue:
        print("No issue found in payload.")
        sys.exit(0)

    issue_number = issue.get("number")
    repo_full_name = event.get("repository", {}).get("full_name")

    if not token or not repo_full_name:
        print("Missing GITHUB_TOKEN or repository info.")
        sys.exit(0)

    # Fetch recent issues (state=all)
    list_url = f"https://api.github.com/repos/{repo_full_name}/issues?state=all&per_page=100"
    existing_issues = make_github_request(list_url, token=token) or []

    duplicates = find_duplicates(issue, existing_issues, threshold=0.4)

    if duplicates:
        dup_lines = [f"- #{d['number']} **{d['title']}** (Similarity: `{d['similarity']}%`)" for d in duplicates[:5]]
        comment_body = (
            f"### 🔍 Potential Duplicate Issue Detected\n\n"
            f"The following existing issue(s) might be related or duplicates:\n\n" +
            "\n".join(dup_lines) +
            "\n\n*Please check if your issue is already tracked above.*"
        )

        comment_url = f"https://api.github.com/repos/{repo_full_name}/issues/{issue_number}/comments"
        make_github_request(comment_url, method="POST", data={"body": comment_body}, token=token)
        print(f"Found {len(duplicates)} duplicate candidate(s). Commented on #{issue_number}.")
    else:
        print("No duplicate issues detected above threshold.")


if __name__ == "__main__":
    main()
