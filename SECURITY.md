# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Report it privately using GitHub's [private vulnerability reporting](https://github.com/DumDuky/opencode-swarm/security/advisories/new), or contact the maintainer through GitHub ([@DumDuky](https://github.com/DumDuky)).

Include:

- affected version
- a reproduction or proof of concept
- the impact you believe it has
- any suggested mitigation

## Scope and expectations

`opencode-swarm` is an OpenCode plugin. It runs with the permissions OpenCode gives it and is **not a sandbox**.

Security-relevant areas include:

- file leases and stale-write checks
- worker permissions and subagent limits
- shell command classification
- approval escalation
- secrets or credentials in prompts, logs, or state
- prompt injection from repository content or peer messages

The plugin already blocks common shell file-write patterns for workers and blocks destructive system commands. Interpreter escapes, external tools, and repo content can still be dangerous. Treat untrusted repositories and untrusted models accordingly.

## Disclosure

Please give the maintainer a reasonable window to fix and release before public disclosure. Credit will be given unless you prefer to remain anonymous.
