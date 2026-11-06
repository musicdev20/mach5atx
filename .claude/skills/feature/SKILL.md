---
name: feature
description: Build a feature or change for the mach5atx site end to end — plan and get approval, implement, review, test, then commit and push to main. Use when asked to add or change something on the site.
argument-hint: <feature description>
disable-model-invocation: true
---

# mach5atx feature workflow

Request: $ARGUMENTS

Work through the five stages below in order. Do not skip or merge stages. Use the task list to track them.

## Project facts

- Astro 5 + Netlify site. Pages in `src/pages/`, shared code in `src/lib/`, serverless code in `netlify/`.
- Netlify builds from GitHub, so **pushing `main` is the deploy**.
- There is no test suite or linter. "Testing" means a clean `npm run build` plus checking the feature in a browser.
- Inline `<script is:inline>` blocks in `.astro` files are plain JS (no TypeScript, not bundled).
- Follow `.prettierrc` and match the style of the surrounding code (4-space indent, existing CSS class prefixes like `m5-`).

## 1. Plan and spec — STOP for approval

1. Read the relevant files and any related notes in the project docs/memory. Understand the current behaviour before proposing changes.
2. Write a short spec:
   - **Goal** — what the user will see or be able to do.
   - **Files to change** and what changes in each.
   - **Behaviour and edge cases** (empty states, mobile layout, bad data, live `/api/*` data vs fallback data).
   - **How it will be tested** (specific checks, not "test it").
   - **Out of scope.**
3. Present the spec and **ask the user to approve it** (use AskUserQuestion with Approve / Change the plan options, or plan mode). Do not write any code until they approve. If they request changes, revise and ask again.

## 2. Implement

- Make only the changes in the approved spec. If something unexpected requires a bigger change, stop and re-confirm with the user.
- Keep changes small and in the style of the existing code. No drive-by refactors.
- Do not touch `.env`, `dist/`, `node_modules/`, or `.netlify/`.

## 3. Code review and fix

1. Review the full diff (`git diff`) as a skeptical reviewer, ideally with a separate review agent that has not seen the implementation. Check:
   - Correctness against the spec and edge cases (null/empty data, invalid dates, long text, no results).
   - Mobile layout (`@media (max-width: 860px)` blocks) and accessibility (labels, aria, keyboard use).
   - XSS: anything inserted with `innerHTML` that comes from show/admin data must be escaped.
   - Admin pages under `src/pages/owner/` and anything in `netlify/` must stay behind their existing auth; no secrets in client code.
   - Leftover debug code, unused variables, accidental edits outside scope.
2. Fix every real problem found, then re-review the changed parts. Repeat until clean.

## 4. Test

1. Run `npm run build`. It must finish with no errors. If it fails, fix the cause and rerun; do not commit a failing build.
   - If the build cannot run in this environment (e.g. missing platform binary for rollup), say so, and instead extract the changed markup, styles and script into a standalone HTML page and exercise it in a browser (Playwright or the browser tools).
2. Run `npm run dev` (or `npm run preview` after a build) and open the affected page(s) in a browser. Exercise each check listed in the spec, at desktop and phone widths, and look at the console for errors.
3. Report results to the user as a short pass/fail list. If anything fails, go back to stage 2 (or 3), fix, and re-test.

## 5. Commit and push to main

Only reach this stage if stages 3 and 4 are clean.

1. `git status` — confirm only intended files changed; never stage `.env`, `dist/`, or editor/OS files.
2. Make sure you are on `main` and up to date: `git pull --ff-only origin main`.
3. Stage the specific files and commit with a short, imperative message describing the feature, ending with the attribution lines from the session's system reminder.
4. `git push origin main`. Do this automatically, without asking again — the approval in stage 1 covers it.
5. If the push is rejected (non-fast-forward), `git pull --rebase origin main`, re-run `npm run build`, and push again. Never force-push.
6. If a git command fails on stale lock files (`.git/*.lock`), move them out of the way rather than deleting, then retry.
7. Tell the user what shipped (one or two sentences, the commit hash) and that Netlify will deploy from the push. If pushing is impossible from this environment, say so and give the exact commands for the user to run.
