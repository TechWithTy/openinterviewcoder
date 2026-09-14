# Trellis Technical CTO Interview Test Prompts

Select **Trellis Full-Stack Interview Copilot v2 (Coding + System Design)** in Settings, upload the resume and job description, and use one prompt at a time.

These are technical, CTO-style prompts for a launch-stage annuity platform using React, Rust, AWS, APIs, automated delivery, and production observability.

## Customer Application System Design

```text
Design the first production version of an annuity application platform. Independent agents create applications for customers, customers can review and sign, underwriting makes a decision, and operations users resolve exceptions. Start with the clarifying questions that materially change the design.
```

## Underwriting Integration Reliability

```text
An application submission calls a third-party underwriting provider that can time out, return duplicate callbacks, or be unavailable for several minutes. Design the API and background-processing flow so we do not lose applications, double-submit work, or show customers misleading status.
```

## React Live Coding

```text
Build a TypeScript React component for an agent to search applications by customer name or application ID. It should debounce requests, cancel stale requests, show loading, error, empty, and result states, and remain accessible. Include focused tests.
```

## Rust API Design

```text
We are adding a Rust service that accepts a signed application submission and publishes it for underwriting. Walk through the handler design: request validation, idempotency keys, authorization, database transaction boundaries, error responses, and tests. Show the first useful Rust implementation slice.
```

## Event Ordering and Idempotency

```text
Underwriting status events arrive at least once and occasionally out of order. How would you model and process them so the application timeline is correct, duplicate delivery is safe, and operators can audit why a status changed?
```

## Data Model and Audit Trail

```text
Model applicants, applications, signatures, underwriting decisions, status history, agent access, and audit events. Explain the relational schema, indexes, retention considerations, and which data must be immutable.
```

## Production Debugging

```text
After a release, a small percentage of submitted applications stay in processing even though the underwriting provider reports a decision. Explain your exact investigation path, immediate mitigation, root-cause validation, durable fix, and prevention work.
```

## Observability

```text
What logs, metrics, traces, dashboards, and alerts would you add before launch for the application submission and underwriting workflow? Explain how each signal would help an on-call engineer diagnose a customer-impacting failure.
```

## CI/CD and Safe Releases

```text
Describe a pragmatic CI/CD pipeline for a React frontend and Rust backend deployed to AWS. Include unit and integration tests, migrations, infrastructure changes, secrets, security checks, progressive rollout, rollback, and post-deploy verification.
```

## Infrastructure as Code

```text
How would you structure Terraform for a small team operating multiple AWS environments? Explain state management, environment isolation, least-privilege IAM, review workflow, drift detection, and how you would make a risky infrastructure change safely.
```

## Security and Privacy Review

```text
Before launch, how would you review a customer-facing financial application for authentication, authorization, PII exposure, secrets handling, auditability, dependency risk, and secure operational access? Prioritize the highest-risk controls first.
```

## Performance Investigation

```text
The operations dashboard is slow when users filter applications by status, agent, and date range. Walk through how you would measure the problem across React, the API, and the database, identify the bottleneck, implement the smallest effective fix, and prove the improvement.
```

## Architecture Tradeoffs

```text
For the initial launch, would you choose a modular monolith, several microservices, or a hybrid? Defend the decision for a small team building a customer-facing annuity platform with external integrations, compliance-sensitive data, and a need to move quickly.
```

## AI Development Tooling

```text
How would you introduce AI-powered development tools into this engineering organization without weakening code review, security, testing, ownership, or auditability? Give concrete guardrails and a rollout plan.
```
