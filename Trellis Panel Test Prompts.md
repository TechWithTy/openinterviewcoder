# Trellis Panel Interview Test Prompts

Select **Trellis Panel Interview (Python/Full Stack/AWS)** in Settings, upload the Trellis résumé and job description, and use one prompt at a time.

## COO: Ownership and Delivery

```text
We’re preparing to launch a customer-facing insurance platform. Tell me about a time you owned a feature from an ambiguous requirement through deployment and post-launch support.
```

## CEO: Startup Judgment and Motivation

```text
Why Trellis, and why does an early-stage customer-facing financial-protection platform appeal to you?
```

## Technical Lead: Python API Design

```text
We have a Django API that creates a customer application and calls a downstream underwriting service. How would you design it to handle validation, timeouts, retries, idempotency, and observability?
```

## Technical Lead: Python Live Coding

```text
Let’s write a small Python service class that processes application-status events. It should reject invalid events, ignore duplicate event IDs, keep accepted events ordered per application ID, and be safe when called concurrently. Include focused pytest tests and explain your choices as you work.
```

## Full-Stack: React Customer Experience

```text
A customer application flow in React has become slow and difficult to change as we add new questions. How would you investigate the performance issue and restructure the frontend without breaking the customer experience?
```

## Technical Lead: Rust Bridge

```text
Our backend uses Rust in a few services. You have stronger verified experience in Python, Go, TypeScript, and Java—how would you become productive in Rust while keeping quality high?
```

## Panel System Design

```text
Design the first version of a customer insurance application platform. Customers should save progress, submit an application, receive status updates, and allow internal operations users to review applications. Start by asking the questions that would materially affect the design.
```

## Production Debugging

```text
After a deployment, customers report that application submissions occasionally remain stuck in “processing.” Walk us through how you would investigate, mitigate, and prevent that issue.
```
