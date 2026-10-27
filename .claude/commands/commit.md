---
description: Commit and push changes to GitHub
argument-hint: "Commit message, e.g. Fix login API error"
allowed-tools: Bash(git status:*), Bash(git pull:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

## Instructions

Use `$MESSAGE` as the commit message provided by the user.

1. Check the current Git status:
   ```bash
   git status
   ```

2. Pull the latest changes from the main branch:
   ```bash
   git pull --rebase origin main
   ```
   If the pull fails or conflicts occur, stop and report the problem. Do not overwrite local changes or resolve conflicts automatically.

3. Stage all changes:
   ```bash
   git add .
   ```

4. Commit using the provided message:
   ```bash
   git commit -m "$MESSAGE"
   ```
   If there are no changes to commit, report that and stop.

5. Push the commit to GitHub:
   ```bash
   git push origin main
   ```

6. Report the result, including the commit message and whether the push succeeded. Never claim success unless the command completes successfully.

## Safety rules
- Run commands from the repository root.
- Never use `git reset --hard`, force push, or discard user changes.
- Stop if a merge conflict occurs or the repository is not on the expected `main` branch.
- If authentication or network errors occur, report them without changing Git configuration.
- Do not stage or commit unrelated sensitive files such as `.env`, API keys, or credentials.