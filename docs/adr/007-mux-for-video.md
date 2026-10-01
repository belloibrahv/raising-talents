# ADR-007: Mux for video

Status: Accepted

## Context

Talents upload performance clips. Video needs transcoding, adaptive streaming and signed playback.

## Decision

Mux behind a VideoProvider port. Images go to S3 and CloudFront.

## Alternatives considered

Cloudflare Stream; S3 with MediaConvert and CloudFront.

## Consequences

Per-second billing suits short clips. The port keeps a provider switch contained in one adapter.
