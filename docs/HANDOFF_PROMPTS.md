# HANDOFF PROMPTS — copy/paste these

## A. START prompt (new AI, new account, or new chat)
Attach/paste: `AGENTS.md`, `docs/DESIGN_LOCK.md`, `docs/PROGRESS.md`, and the files for the NEXT TASK. (Claude Code reads CLAUDE.md/AGENTS.md by itself — just send the last two lines.)

```
EXISTING PROJECT — All-in-One App (React + Vite + Bootstrap/SCSS + Firebase).
Continue it with NO change to the existing design or functionality.
1. Read AGENTS.md, docs/DESIGN_LOCK.md and docs/PROGRESS.md (attached).
2. Do not write code yet. In ONE message, list the exact files you need me to paste
   (start with those for the NEXT TASK in PROGRESS.md) and any questions.
3. After I paste them: do only the NEXT TASK, one PACE at a time. Deliver COMPLETE updated
   files (with paths) + a short FILES CHANGED list + the commit message.
4. Then update docs/PROGRESS.md (print the full new file) and STOP.
```

## B. CHECKPOINT prompt (after each finished pace — cheap, do it every time)
```
Pace done. Print the complete updated docs/PROGRESS.md (status, NEXT TASK, files changed)
and the git commit message. Then stop.
```

## C. LIMIT-WARNING prompt (when the AI says you're close to the limit, or any time you feel it)
```
Stop coding now. Do not start anything new.
1. List exactly what is finished, what is half-done (file + what is missing), and what is next.
2. Print the complete updated docs/PROGRESS.md with that info under NEXT TASK.
3. Print the git commands to save safely (commit finished work; `git stash` or revert half-done files).
```

## D. How the "limit" is handled
Nobody (including me) can see your exact remaining usage. On the free plan the window rolls every ~5 hours and counts both messages and how big/complex they are. So don't try to guess the limit — make the work **limit-proof**:
- Work in PACES (small). After each pace → build → `git commit` → prompt B → paste the new PROGRESS.md into the repo.
- If a session is cut off mid-pace: in the repo run `git status`, then `git restore .` (discard half-written changes) — the last commit is always a working state. The next AI redoes only that one pace (PROGRESS.md says which).
- Any AI (or the same one after the window resets) starts with prompt A. Because design rules, tokens, conventions and progress are all in the repo, nothing drifts.
- Cheapest messages: one pace, all files at once, no re-explaining.
