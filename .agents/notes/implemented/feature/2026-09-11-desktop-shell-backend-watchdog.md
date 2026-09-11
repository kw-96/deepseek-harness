# Agent Note: Desktop shell supervises `dsh web` and restarts it after an exit

Status: implemented

English | [中文](2026-09-11-desktop-shell-backend-watchdog.zh.md)

## Problem

The shell stopped caring about the spawned `dsh web` once the window was on its URL. A dropped backend did not break the window — the Web client's reconnect loop kept showing its reconnect notice — but nothing brought the backend back, so recovery meant starting `dsh web` by hand from the repository root. A hand-started process belongs to no one: closing the window leaves it running and holding the port, and the next double-click hits the port conflict directly.

Two neighbouring defects made that path harder to use and riskier:

- The ready wait read child output with a blocking iterator, so the timeout was only checked after the next line arrived; a `dsh web` that hung without further output never hit the 180-second timeout.
- The child tree was torn down without checking whether the child had already exited. Once it had, its pid might already be reused, and `taskkill /F /T /PID` would kill an unrelated process tree.

## Decision

Child-process life moves out of `lib.rs` into `child` and `backend`, leaving `lib.rs` with application wiring and window events only.

- `child` owns the subprocess: spawn, teardown, exit queries. `kill_tree` confirms with `try_wait` that the child is still running before ending its tree by pid.
- `backend::run_backend` owns spawn and supervision: spawn, wait for ready, first navigation, drain output until the child exits, restart three seconds later. Both the ready wait and the exit watch poll with `recv_timeout`, so neither timeout nor exit detection depends on more output arriving.
- A restart does not re-navigate. The frontend in the window holds an auth cookie signed with a durable secret and reconnects on its own; the per-process launch token changes on every spawn, and reconnecting does not need it.
- Three consecutive startup failures (another instance holding the port, for example) return an error for the caller to report as a launch misconfiguration, instead of restarting forever.

## Alternatives considered

**Re-navigate after a restart.** Rejected: a full page load drops in-page state (panels, drafts, scroll position), and the client already reconnects.

**Report the exit and leave recovery to the user.** Rejected: that is exactly the experience this change fixes — the window would sit on the reconnect notice indefinitely.

**Probe the port at startup and adopt an instance already serving there.** Rejected: there is no way to confirm that instance belongs to the same Harness home and profile, and adopting the wrong one is worse than reporting the conflict.

## Consequences

A dropped backend comes back after roughly three seconds and the window reconnects on its own, with no need to close the window or restart anything by hand. Startup failures still fail loudly: the diagnostic text (exit status plus the `Error:` line from the output tail) is unchanged. The shell still navigates only once, so if the Web client's reconnect loop ever stopped retrying, the window would not recover by itself.

The native half needs a shell rebuild to take effect (`pnpm --filter @deepseek-ai/dsh-experimental-web-desktop build`). That script now renames a root `DeepSeek Harness.exe` still locked by a running shell into `.data/` before writing the new artifact, so a release no longer requires closing the running window first.
