# Agent Note: Workorder reviews persist model conclusions and POPO delivery results

Status: implemented

English | [中文](2026-09-09-workorder-review-control-plane.zh.md)

## Problem

EasyWork webhook processing previously stored a field snapshot and deterministic missing-field results, but the Harness Agent's text conclusion was neither associated with that workorder nor available to the operator, and the group robot workflow did not identify the submitter that needed to complete the form.

## Decision

`workorder-agent` stores a submitter name on each issue snapshot and writes every webhook or manual review to `issue_reviews`, including deterministic violations, model status and output, POPO delivery status, task id, and delivery error.

The Host configuration owns an optional provider/model pair, a maximum output-token value, a knowledge-base string, a model-review switch, and a notification switch. The background Agent receives an explicit `agentOptions` route when the pair is configured, otherwise it uses Harness's default model selection. It serializes review turns before reading the newly logged assistant response so concurrent webhook and manual work cannot exchange conclusions.

The review prompt receives an immutable issue snapshot and the configured knowledge base. It does not call tools or mutate EasyWork. Deterministic rules remain the notification authority; when they find missing fields and automatic sending is enabled, the POPO group robot sends a message addressed to `@submitter`. Webhook payload author fields take precedence, then the cached issue submitter, then the assignee.

The control plane exposes a date-range EasyWork sync, manual review trigger, review history and detail views, statistics, model and knowledge-base configuration, and POPO task receipts. Saving review configuration updates the Host settings namespace and remounts the runtime.

## Alternatives considered

**Keep model output only in the Agent session.** Rejected because operators cannot connect a transient background session result to a workorder, inspect a failed notification, or audit a later manual recheck.

**Let the model fetch EasyWork data through MCP tools.** Rejected because the webhook handler already validates and stores the source snapshot; passing that immutable record avoids a second remote read and limits the model to review text.

**Treat a POPO group robot as a direct-message client.** Rejected because the configured Webhook only targets its group. The recorded and displayed behavior is a group message addressed to the submitter text, with an assignee fallback when no submitter is available.

## Consequences

SQLite schema version 4 adds `issues.submitter_name`, and version 5 adds immutable review records. Existing issue rows receive an empty submitter until a later sync or webhook refreshes them.

The semantic conclusion can fail while deterministic review and its record still complete. A failed or blocked POPO delivery remains visible and resumable through the existing message task flow instead of being silently retried by the webhook worker.

## Testing

`pnpm --dir community/plugins --filter workorder-agent run test` covers model routing, review persistence, recipient message construction, notification states, UI script syntax, configuration validation, migrations, and existing inspection behavior.
