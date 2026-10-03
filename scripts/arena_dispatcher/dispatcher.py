#!/usr/bin/env python3
"""
scripts/arena_dispatcher/dispatcher.py

Automated Agent Dispatcher for Arena.ai (Agent Mode).
Connects to an existing user Google Chrome session via Chrome DevTools Protocol (CDP)
on port 9222.

Capabilities:
1. Locates active or multiple Arena.ai agent tabs.
2. Injects kickoff briefs and steering prompts into agent sessions from:
   - CLI flags / interactive mode
   - handoff/kickoff/<WS>.md
   - handoff/notes/<WS>.md instructions
3. Listens for subagent questions, approval blockers, or progress status.
4. Relays status, questions, and completions to/from the Integrator session and repo handoff notes.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from playwright.async_api import async_playwright, Page, BrowserContext


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
HANDOFF_DIR = REPO_ROOT / "handoff"
KICKOFF_DIR = HANDOFF_DIR / "kickoff"
NOTES_DIR = HANDOFF_DIR / "notes"


class ArenaDispatcher:
    def __init__(self, cdp_url: str = "http://localhost:9222"):
        self.cdp_url = cdp_url
        self.context: Optional[BrowserContext] = None
        self.arena_pages: List[Page] = []
        self.last_seen_messages: Dict[str, str] = {}

    async def connect(self) -> bool:
        """Connect to running Chrome instance via CDP."""
        try:
            p = await async_playwright().start()
            browser = await p.chromium.connect_over_cdp(self.cdp_url)
            if not browser.contexts:
                print("[-] Error: Chrome connected but has no active browser contexts.")
                return False
            self.context = browser.contexts[0]
            await self.refresh_tabs()
            return True
        except Exception as e:
            print(f"[-] Could not connect to Chrome on {self.cdp_url}: {e}")
            print("\nPlease launch Chrome with remote debugging enabled:")
            print('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome-Debug"')
            return False

    async def refresh_tabs(self) -> List[Page]:
        """Find all pages with arena.ai in URL."""
        if not self.context:
            return []
        self.arena_pages = [p for p in self.context.pages if "arena.ai" in p.url]
        return self.arena_pages

    async def get_page_for_session(self, session_filter: Optional[str] = None) -> Optional[Page]:
        """Match page by URL or title, or return the first active arena page."""
        await self.refresh_tabs()
        if not self.arena_pages:
            print("[-] No active Arena.ai tabs detected. Open https://arena.ai/agent in Chrome.")
            return None

        if not session_filter:
            return self.arena_pages[0]

        for p in self.arena_pages:
            title = await p.title()
            if session_filter.lower() in p.url.lower() or session_filter.lower() in title.lower():
                return p
        return self.arena_pages[0]

    async def send_prompt(self, page: Page, prompt_text: str) -> bool:
        """Inject prompt into Arena chat prompt box and submit."""
        try:
            # Locate active textarea or contenteditable element
            input_box = page.locator("textarea, div[contenteditable='true'], input[type='text']").first
            await input_box.wait_for(state="visible", timeout=8000)
            await input_box.click()
            await input_box.fill(prompt_text)
            await asyncio.sleep(0.5)

            # Try finding a submit button or press Enter
            submit_btn = page.locator("button[type='submit'], button[aria-label*='Send'], button:has-text('Send')").first
            if await submit_btn.is_visible():
                await submit_btn.click()
            else:
                await input_box.press("Enter")

            print(f"[+] Successfully injected prompt ({len(prompt_text)} chars) to {page.url}")
            return True
        except Exception as e:
            print(f"[-] Failed to send prompt: {e}")
            return False

    async def extract_latest_messages(self, page: Page) -> List[str]:
        """Read recent message containers from the Arena chat window."""
        try:
            # Common message and step selectors
            selectors = [
                "div[data-testid='chat-message']",
                ".agent-step",
                "div[role='article']",
                ".prose",
                "div[class*='message']",
            ]
            for sel in selectors:
                elements = await page.locator(sel).all_text_contents()
                if elements:
                    return [e.strip() for e in elements if e.strip()]
        except Exception:
            pass
        return []

    async def monitor(self, session_filter: Optional[str] = None, poll_interval: int = 3):
        """Continuously monitor subagent progress, detect blockers, and relay updates."""
        page = await self.get_page_for_session(session_filter)
        if not page:
            return

        print(f"[*] Dispatcher attached to: {page.url}")
        print(f"[*] Title: {await page.title()}")
        print(f"[*] Monitoring loop running (poll interval: {poll_interval}s)... Press Ctrl+C to stop.\n")

        last_seen = ""
        while True:
            try:
                msgs = await self.extract_latest_messages(page)
                if msgs:
                    latest = msgs[-1]
                    if latest != last_seen:
                        last_seen = latest
                        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        print(f"[{timestamp}] [Arena Update]:\n{latest[-500:]}\n{'-'*60}")

                        # Determine session name from page URL/title for notes file
                        session_name = "arena-subagent"
                        match = re.search(r"agent/([a-zA-Z0-9_-]+)", page.url)
                        if match:
                            session_name = f"arena-{match.group(1)[:8]}"
                        if session_filter:
                            session_name = re.sub(r"[^a-zA-Z0-9_-]", "", session_filter)

                        note_file = NOTES_DIR / f"{session_name}.md"
                        with open(note_file, "a", encoding="utf-8") as nf:
                            nf.write(f"\n### Update [{timestamp}]\n```text\n{latest[-1000:]}\n```\n")

                        # Check for blocker or decision request
                        if any(phrase in latest.lower() for phrase in [
                            "do you want to proceed",
                            "confirm to continue",
                            "blocked by",
                            "escalate",
                            "error:",
                            "permission denied",
                            "was this task successful"
                        ]):
                            print(f"[!] ATTENTION: Subagent may be waiting for approval, input, or completion.")
                            with open(note_file, "a", encoding="utf-8") as nf:
                                nf.write(f"\n> [!WARNING]\n> **Action/Review Needed:** Subagent signaled a prompt, error, or completion at {timestamp}.\n")

            except Exception as e:
                print(f"[!] Warning during monitor loop: {e}")

            await asyncio.sleep(poll_interval)


def load_brief(brief_name: str) -> Optional[str]:
    """Load brief from handoff/kickoff/<brief_name>.md."""
    path = KICKOFF_DIR / brief_name
    if not path.suffix:
        path = path.with_suffix(".md")
    if not path.exists():
        # Try finding in handoff/notes
        alt_path = NOTES_DIR / brief_name
        if not alt_path.suffix:
            alt_path = alt_path.with_suffix(".md")
        if alt_path.exists():
            path = alt_path
        else:
            print(f"[-] Brief file not found at {path} or {alt_path}")
            return None
    return path.read_text(encoding="utf-8")


async def main_async():
    parser = argparse.ArgumentParser(description="Arena.ai Subagent Dispatcher & Monitor")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Command: list
    subparsers.add_parser("list", help="List active Arena.ai tabs in Chrome")

    # Command: dispatch
    p_dispatch = subparsers.add_parser("dispatch", help="Inject a kickoff brief or steering prompt to an Arena agent")
    p_dispatch.add_argument("--brief", "-b", help="Brief name in handoff/kickoff/ (e.g. WS-CHRONO or W2-E)")
    p_dispatch.add_argument("--prompt", "-p", help="Direct text prompt to inject")
    p_dispatch.add_argument("--session", "-s", help="Subagent tab name / URL filter")

    # Command: monitor
    p_monitor = subparsers.add_parser("monitor", help="Monitor a running Arena agent session")
    p_monitor.add_argument("--session", "-s", help="Subagent tab name / URL filter")
    p_monitor.add_argument("--interval", "-i", type=int, default=3, help="Polling interval in seconds")

    args = parser.parse_args()
    dispatcher = ArenaDispatcher()

    connected = await dispatcher.connect()
    if not connected:
        sys.exit(1)

    if args.command == "list":
        tabs = await dispatcher.refresh_tabs()
        print(f"[+] Found {len(tabs)} Arena.ai tabs:")
        for i, t in enumerate(tabs, 1):
            print(f"  {i}. {await t.title()} -> {t.url}")

    elif args.command == "dispatch":
        prompt_content = ""
        if args.brief:
            loaded = load_brief(args.brief)
            if not loaded:
                sys.exit(1)
            prompt_content = loaded
        elif args.prompt:
            prompt_content = args.prompt
        else:
            print("[-] Error: Specify either --brief or --prompt.")
            sys.exit(1)

        page = await dispatcher.get_page_for_session(args.session)
        if page:
            await dispatcher.send_prompt(page, prompt_content)

    elif args.command == "monitor":
        await dispatcher.monitor(session_filter=args.session, poll_interval=args.interval)


def main():
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n[*] Dispatcher stopped by user.")


if __name__ == "__main__":
    main()
