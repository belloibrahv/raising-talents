# ADR-056: Video kept in our own storage where there is no video provider

- Status: Accepted
- Date: 2026-10-12
- Builds on: ADR-007 and ADR-021 (video through Mux), ADR-036 (Railway), ADR-055 (audio)

## Context

Video was built on Mux: the phone uploads to Mux, Mux transcodes and streams. The live site
on Railway has no Mux account, so it ran with `VIDEO_PROVIDER=disabled` and every video was
refused. The client tried to post a clip from their gallery and could not. A social product
for talent cannot wait for a contract with a video company to show a clip.

## Decision

- **A third setting.** `VIDEO_PROVIDER=storage`: videos are uploaded to our bucket with the
  same presigned form post as photos and recordings, and played as the file that was sent.
  `mux` and `disabled` are unchanged.
- **Checked, then live.** The worker reads the first bytes to confirm an MP4 or MOV, copies
  the file inside the bucket to `media/{owner}/{id}/video` (it never passes through the
  worker's memory), and marks it ready. A file that is not a video fails and is deleted.
  Nothing scans it: members report the post and moderators remove it (ADR-048).
- **Streamed from the API.** `GET /media/{owner}/{id}/video` streams from the bucket and
  answers `Range` requests, so players can seek and a 300 MB clip is never held in memory.
  Recordings (ADR-055) now use the same streaming. MOV is served as `video/mp4`: the
  container is the same, and some browsers refuse the QuickTime type.
- **The contract.** A video's playback says its `format`: `hls` (a provider's stream, as
  before) or `file`. A file has no poster and no stored length; the player shows its first
  frame and reads the length itself. Reported posts carry a `playUrl` where there is no
  picture to show.
- **Longer clips.** Up to three minutes (was 60 seconds) and still 300 MB. The length is
  checked in the browser; with a stored file the server does not know it, so the size limit
  is the hard one.
- **In the browser.** A clip from a phone's gallery that arrives with no type is recognised
  by its name, and reading its length gives up after four seconds instead of waiting for
  ever.

## What this gives up, compared with Mux

- **No transcoding.** The file plays as recorded. MP4 and MOV from phones (H.264) play
  everywhere. A clip in a codec a browser lacks (some HEVC files on older Android or
  desktop Chrome) will not play there.
- **No adaptive quality.** On a slow connection a large clip buffers.
- **No scanning.** Frames are not looked at before it is live.

Switching to `VIDEO_PROVIDER=mux` later sends new uploads to Mux; videos already stored keep
playing from the bucket.

## Consequences

- Video counts against the bucket's storage and the API's bandwidth.
- Erasing an account, deleting a post and a moderator's removal delete the stored file, as
  for photos.
