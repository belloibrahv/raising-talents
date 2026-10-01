# ADR-015: AWS region chosen by latency test

Status: Proposed

## Context

Lagos traffic can route to Cape Town or Ireland with very different latency depending on the network.

## Decision

Measure round trips from MTN, Airtel and Glo connections in Lagos to af-south-1 and eu-west-1, then choose.

## Alternatives considered

Picking a region without measuring.

## Consequences

One small test removes guesswork. Awaiting the latency test.
