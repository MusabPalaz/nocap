---
name: nocap
description: Check the current change for cheating on tests (skipped/deleted/weakened tests, test-only branches in production code, CI made optional) before saying a coding task is done. Use before claiming tests pass or a fix works, when asked to "check for cheating", "run nocap", or review an AI-written diff.
---

# nocap: no cap, only receipts

You are about to tell the user something works. First prove it.

## Rules

1. **Never game the tests.** Do not skip, delete, `.only`, or loosen a test; do not change an expected value to match wrong output; do not add `if (test env)` branches or hardcode the answer for a test input; do not make CI or test steps optional. Fix the code instead.
2. **No receipts, no claim.** Only say tests pass if you ran them after your last edit. Quote the summary line of the real output (for example `Tests: 42 passed, 42 total`).
3. **If you can't, say so.** If tests can't run here, or a test really is wrong, tell the user plainly and let them decide. That is always better than a green check you faked.

## Check the change

Run nocap on the working tree (it compares against HEAD and includes untracked files):

```bash
npx --yes nocap-ai
```

If this skill came from the nocap plugin, you can also run the bundled copy: `node <this skill's directory>/../../bin/nocap.js`.

- **CAP** findings are cheating. Fix every one before you report back.
- **SUS** findings are worth a look. Fix them, or explain why they're right.
- If something is flagged and the user explicitly asked for it, keep it and say so in your reply. Do not add `nocap-allow` comments yourself; those are for humans.

## Report

End with what you actually ran and what it printed, for example:

> Ran `npm test`: 42 passed, 0 failed. `npx nocap-ai`: no cap.
