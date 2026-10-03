# Arena.ai Agent Dispatcher (CDP Playwright Automation)

The **Arena Dispatcher** connects directly to an existing Google Chrome browser session via the **Chrome DevTools Protocol (CDP)** on port `9222`.

This enables you to:
1. **Preserve Authentication:** Stay logged into your Arena account without risking Cloudflare, Captcha, or bot-detection barriers.
2. **Automate Subagent Kickoff:** Dispatch briefs directly from `handoff/kickoff/*.md` or inject steering prompts into active Arena subagent chat windows.
3. **Monitor Live Execution:** Stream subagent updates, detect when an agent is blocked, and relay answers or contract rulings.

---

## Step 1: Launch Google Chrome with Remote Debugging

Quit existing Chrome instances or open a dedicated debug profile:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome-Debug"
```

In this Chrome window, navigate to [arena.ai/agent](https://arena.ai/agent) and open your desired session(s).

---

## Step 2: Use the Dispatcher CLI

The dispatcher tool is located in [`scripts/arena_dispatcher/dispatcher.py`](file:///Users/dangeorge/Documents/GitHub/casevault/scripts/arena_dispatcher/dispatcher.py).

### 1. List Active Arena Tabs
```bash
.venv/bin/python scripts/arena_dispatcher/dispatcher.py list
```
*Outputs all detected Arena.ai agent tabs with their titles and URLs.*

---

### 2. Dispatch a Kickoff Brief to a Subagent
Inject any markdown brief directly from `handoff/kickoff/`:
```bash
.venv/bin/python scripts/arena_dispatcher/dispatcher.py dispatch --brief W2-E
```
Or target a specific session tab by title/URL substring:
```bash
.venv/bin/python scripts/arena_dispatcher/dispatcher.py dispatch --session "Arena Agent 2" --brief W2-E
```

---

### 3. Send a Steering or Unblocking Prompt
```bash
.venv/bin/python scripts/arena_dispatcher/dispatcher.py dispatch \
  --session "Arena Agent 1" \
  --prompt "Contract §4.2 has been updated. Rebase onto arena/01a0899f-casevault and continue."
```

---

### 4. Monitor an Agent Session in Real Time
```bash
.venv/bin/python scripts/arena_dispatcher/dispatcher.py monitor --interval 3
```
*Monitors the active Arena session, prints live subagent steps and tool outputs, and alerts you when a prompt is waiting for confirmation, approval, or blocked on permissions.*
