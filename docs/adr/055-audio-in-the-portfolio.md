# ADR-055: Audio in the portfolio

- Status: Accepted
- Date: 2026-10-12
- Builds on: ADR-020 (portfolio), ADR-036 (media through the API), ADR-048 (no check first)

## Context

A portfolio took photos and video. A singer, a voice actor or a podcaster could not show
what they sound like without filming it. The client asked for audio uploads.

## Decision

- **A third kind of file.** `audio` beside `image` and `video`, for the portfolio only. MP3,
  M4A, AAC, WAV and Ogg, up to 20 MB. No limit on length beyond the size.
- **Uploaded like a photo.** The same upload intent and presigned form post to our bucket.
  Video goes to Mux; audio does not need it.
- **Checked, then live.** The worker reads the first bytes to confirm it is a sound file
  (the declared type proves nothing), moves it to `media/{owner}/{id}/audio`, and marks it
  ready. A file that is not audio fails and is deleted. Nothing listens to a recording
  automatically, whatever `CONTENT_SCANNER` says: members report the post and moderators
  remove it, as ADR-048 already has it for photos.
- **Played from the API.** `GET /media/{owner}/{id}/audio` serves a ready recording, cached
  for a day, and answers `Range` requests: players need them to show the length and to seek,
  and Safari plays nothing without them. Behind a CDN the same key is served by the CDN.
- **Everywhere a post goes.** The feed, the profile grid, the shared page, the owner's
  portfolio and the moderator's reported posts show a player. A reported recording can be
  played in the queue and removed.
- **In the browser.** The form accepts audio types and extensions; a file the browser
  reports as `audio/mp3` or with no type is sent as its proper type. The size is checked
  before anything is uploaded.
- **Storage.** `portfolio.item_kind` gains `audio` (migration 0033). Media needs no change:
  its kind comes from the content type.

## Not done, on purpose

- **Re-encoding.** Files are stored as sent. A normalised MP3 would save space and strip
  tags; it needs ffmpeg in the worker image and can come later.
- **Waveforms and cover art.** The player is the browser's own on the stage colours.
- **Length.** It is not stored; the player reads it from the file.

## Consequences

- The API holds a whole recording in memory while serving it (20 MB at most). If audio
  becomes heavy traffic, serve it from a CDN in front of the bucket.
- Tags inside a file (title, artist) are kept, since nothing rewrites it.
