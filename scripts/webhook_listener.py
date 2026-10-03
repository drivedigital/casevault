#!/usr/bin/env python3
"""GitHub Webhook listener for CaseVault.

Listens on localhost (default :9876) for signed GitHub push webhooks.
Current local ngrok upstream uses --port 54160. Requires --secret-file.
When a push event arrives:
  1. Runs git fetch
  2. Plays an alert sound & shows a macOS desktop notification
  3. Logs to data/logs/webhook.log
  4. Exits if --once is passed or runs continuously.

Desktop alerts do not automatically wake a Codex task.
"""

import argparse
import hashlib
import hmac
import json
import subprocess
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DEFAULT_PORT = 9876
REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = REPO_ROOT / "data" / "logs" / "webhook.log"


def notify_macos(title: str, message: str) -> None:
    try:
        cmd = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run'
        subprocess.run(["osascript", "-e", cmd, title, message], capture_output=True, timeout=3, check=False)
        subprocess.run(
            ["afplay", "/System/Library/Sounds/Glass.aiff"],
            capture_output=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"Notification failed: {exc}", flush=True)


class WebhookHandler(BaseHTTPRequestHandler):
    once: bool = False
    secret: bytes = b""

    def log_message(self, format, *args):
        # Silence default stderr logging to keep task output clean
        pass

    def do_GET(self):
        if self.path in ("/", "/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"casevault-webhook-listener"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        self.connection.settimeout(10)
        event = self.headers.get("X-GitHub-Event", "unknown")
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self.send_error(400)
            return
        if not 0 < content_length <= 25 * 1024 * 1024:
            self.send_error(413)
            return
        raw_body = self.rfile.read(content_length)
        expected = "sha256=" + hmac.new(self.secret, raw_body, hashlib.sha256).hexdigest()
        if not self.secret or not hmac.compare_digest(
            expected, self.headers.get("X-Hub-Signature-256", "")
        ):
            self.send_error(403)
            return

        try:
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except (ValueError, UnicodeDecodeError):
            self.send_error(400)
            return
        if not isinstance(payload, dict) or payload.get("repository", {}).get("full_name") != "drivedigital/casevault":
            self.send_error(403)
            return

        now = datetime.now(timezone.utc).isoformat()

        if event == "ping":
            zen = payload.get("zen", "Keep it logically awesome.")
            repo = payload.get("repository", {}).get("full_name", "unknown")
            msg = f"[{now}] Ping received from GitHub repo {repo}: {zen}"
            print(msg, flush=True)
            self._log(msg)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"pong"}')
            return

        if event == "push":
            ref = payload.get("ref", "")
            commits = payload.get("commits", [])
            head_commit = payload.get("head_commit") or {}
            author = (
                head_commit.get("author", {}).get("name")
                or payload.get("pusher", {}).get("name", "Unknown")
            )
            commit_msg = (head_commit.get("message") or "").strip().split("\n")[0]
            sha = head_commit.get("id", "")[:7]
            branch = ref.replace("refs/heads/", "")

            log_line = (
                f"[{now}] Push to {branch} by {author} ({sha}): "
                f"{commit_msg} ({len(commits)} commit(s))"
            )
            print(log_line, flush=True)
            self._log(log_line)

            threading.Thread(target=notify_macos, args=("CaseVault: New Commit", f"{author}: {commit_msg} ({branch})"), daemon=True).start()

            # Fetch remote refs without changing the working tree
            try:
                subprocess.run(
                    ["git", "fetch", "origin"],
                    cwd=str(REPO_ROOT),
                    capture_output=True,
                    timeout=5,
                    check=True,
                )
            except (OSError, subprocess.SubprocessError) as e:
                print(f"Failed to fetch: {e}", flush=True)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"received"}')

            if self.once:
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ignored"}')

    def _log(self, message: str) -> None:
        try:
            LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(message + "\n")
        except OSError as exc:
            print(f"Webhook log failed: {exc}", flush=True)


def run_server(port: int = DEFAULT_PORT, once: bool = False, secret_file: str = "") -> None:
    WebhookHandler.secret = Path(secret_file).read_bytes().strip()
    if not WebhookHandler.secret:
        raise ValueError("Webhook secret must not be empty")
    WebhookHandler.once = once
    server = HTTPServer(("127.0.0.1", port), WebhookHandler)
    mode = "one-shot (will exit after next push)" if once else "daemon (continuous)"
    print(f"CaseVault Webhook Listener active on http://127.0.0.1:{port} [{mode}]", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        print("Webhook listener stopped.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GitHub webhook receiver for CaseVault")
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help="Port to listen on (default: 9876)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Exit after first push event (useful for reactive agent wakeup)",
    )
    parser.add_argument("--secret-file", required=True, help="Local file containing the GitHub webhook secret")
    args = parser.parse_args()

    run_server(port=args.port, once=args.once, secret_file=args.secret_file)
