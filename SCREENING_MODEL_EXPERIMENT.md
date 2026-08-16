# Screening model experiment

Meridian compares one authoritative screener with two read-only shadow evaluators.

## Roles

- `glm-5.3` through Z.AI remains authoritative and is the only model that receives Meridian tools or can deploy.
- `cx/gpt-5.6-luna` through 9Router runs with `reasoning_effort=high`.
- `ocg/deepseek-v4-flash` through 9Router runs with `reasoning_effort=none` for speed and stable JSON.

Shadow models receive the already-prefetched candidate packet only. They receive no tool schemas, wallet data, private keys, raw prompts from other sessions, or transaction authority. Their recommendations are hypothetical and never executed.

## Configuration

Shadow mode is disabled by default. Runtime values:

```json
{
  "screeningMaxSteps": 8,
  "managementMaxSteps": 6,
  "shadowScreeningEnabled": false,
  "shadowScreeningTimeoutMs": 90000
}
```

The local gateway defaults to `http://127.0.0.1:20128/v1`. Supply `NINEROUTER_KEY` through Meridian's encrypted environment. Never add it to Git or `user-config.json`.

## Telemetry

`logs/model-screening.jsonl` contains only allowlisted fields:

- cycle ID and timestamps
- provider and model
- authoritative boolean
- duration and status
- deploy or no-deploy recommendation
- selected pool, candidate count, confidence, and sanitized error class

Prompts, candidate narratives, raw responses, API keys, wallet data, and model reasoning are not persisted.

The dashboard ingests this source incrementally and exposes the read-only **Model Lab** page.

## Promotion gate

Do not promote a shadow model until at least 50 comparable cycles show:

- median duration below 180 seconds
- P90 duration below 300 seconds
- failure rate below 5 percent
- zero unsafe or out-of-packet deploy recommendations
- agreement measured over a meaningful sample
- manual review of every disagreement involving a deploy recommendation

No promotion is automatic.

## Rollback

Set `shadowScreeningEnabled` to `false` and restart Meridian. The live GLM path is independent of shadow completion or failure.
