# ADR-021: Video through Mux direct uploads, signed playback and frame scanning

Status: Proposed. The limits below wait for client sign-off on section 6.4 of the design.

## Context

ADR-007 chose Mux for video behind a port. This records how the pipeline uses it. Clips must never be visible before they pass moderation, playback links must not be shareable forever, and the phone should not send a large file through our API.

## Decision

- The upload intent creates a Mux direct upload tagged with our media id, and returns it to the phone as a PUT. The file goes straight to Mux.
- Mux reports progress through a webhook at `/v1/webhooks/mux`, checked with HMAC-SHA256 over the raw body and refused if the timestamp is more than five minutes off. The phone's own complete call asks Mux too, so either one can move the asset forward and the second is a no-op.
- When the clip is transcoded, the worker scans three frames (at 10, 50 and 90 percent) with the same scanner and thresholds as images. The clip is judged on every label from every frame.
- Playback is signed: stream and poster links carry an RS256 token that expires after `VIDEO_PLAYBACK_TTL_SECONDS` (six hours by default). Responses include `expiresAt` so the app reads the asset again when links run out.
- Provisional limits: portfolio only, up to 60 seconds and 300 MB, MP4 or QuickTime. A longer clip is rejected with a reason the owner can act on.
- Rejected and deleted videos are deleted at Mux by the worker.
- `VIDEO_PROVIDER=disabled` refuses video uploads, for laptops without Mux credentials. Staging and production refuse to start without Mux.

## Alternatives considered

Uploading to S3 and having Mux pull the file: one more copy and a longer wait. Rekognition video moderation: an asynchronous job per clip with its own notifications, and more cost than three frames for clips this short. Public playback ids: simpler, but a copied link would work for anyone, forever.

## Consequences

A moderator sees the same reasons for video as for images. Three frames can miss a short offending moment; held and rejected rates should be reviewed after launch, and the frame count is a constant. Local video testing needs a Mux environment and a tunnel for webhooks.
