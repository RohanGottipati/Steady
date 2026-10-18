# Demo and acceptance runbook

## Start the app

Run `npm run build`, then `npm run start`. Use current Chrome on the demo Mac.
The default build/dev bundler is Webpack, using the installed Tailwind loader in
Next's existing CSS pipeline. `npm run dev:turbo` retains the Turbopack alternative;
Webpack remains the verified default for this checkout.
Both build paths use the same source styles and dependencies.

## Judge path (about three minutes)

For physical calibration, keep elbows low and hands naturally above the desk,
palms mostly downward/slightly inward, wrists relaxed and fingers curved. Capture
neutral, pinch, then follow workspace arrows without presenting palms to the
screen. Keep the hands inside the webcam's field of view. Development
`/train/needle-passing?fixture=off&debug=1` exposes wrist/target diagnostics.
Physical posture acceptance is pending a guided session; synthetic browser checks
do not certify back-of-hand tracking. The temporary fallback is
`NEXT_PUBLIC_SURGICAL_POSTURE_MAPPING=false` followed by restart/rebuild and fresh
calibration.

1. Open the new landing page, then `/library` without `debug=1`. Point out the two available skills and the
   two clearly marked upcoming skills. Credits are below the page content.
2. Choose Needle Passing. Explain that camera video stays on this device.
3. For a physical demo, start the camera, calibrate, watch the Learn guide, and
   perform the pass. For a dependable backup, open
   `/train/needle-passing?fixture=needle-pass-late-rotation`. The banner identifies
   synthetic motion; these results are not presented as the judge's performance.
4. Show the overall result, category scores, strongest/weakest evidence, and Coach
   Review. The evaluator determines every score. An available model explains the
   supplied evidence; unavailable review keeps the deterministic summary.
5. Open **Replay latest attempt**. It approaches and pauses at the largest
   recorded difference. The displayed explanation and narration describe that
   same issue. Use **Skip narration**, the timeline, or an issue button to take
   control. The replay works with the camera stopped.
6. Return to the library and open
   `/train/peg-transfer?fixture=peg-transfer-good`. Show reach, grasp, lift,
   midline meeting, placement, release, results, and replay on the shared engine.
7. Open `/progress` to show real synced summaries and the latest 20 score points per skill. Sample attempts do not populate this history.
8. State that this is an educational simulation, with synthetic reference guides.

## Backup recording

After a production build, run `npm run demo:record`. The command starts and stops
its own local production server if needed. Artifacts go under `artifacts/demo/`:
`steady-backup.webm`, an MP4 copy when ffmpeg is available, and screenshots.
The recording is silent, with the replay explanation visible on screen. It uses
fixtures only, requests no camera, and aborts if a live service is requested.
Generated recordings and screenshots are ignored by Git. Regenerate before the presentation if the
UI changes.

## Fallbacks to demonstrate

- Network lost after initial load: keep training, dismiss the offline notice,
  finish locally, and open the preloaded replay.
- Tiger unavailable: preserve the device copy and use **Retry sync** later.
  Retrying uses the same attempt ID and does not insert a second score row.
- Backboard unconfigured or disabled: quietly keep deterministic Coach Review.
  A configured provider that fails or returns malformed output keeps those notes
  and shows a dismissible notice. Public review requests are limited to 20/minute
  per IP per warm instance, with a 64 KiB body limit and bounded evidence text.
- ElevenLabs unavailable: common coaching uses committed clips, then browser
  speech. Replay uses browser speech if live synthesis fails. Text stays visible
  when all audio is unavailable. Fixture replay never requests live synthesis.
- WebGL loss: pause and recover or use the visible retry/reload controls.
- Storage unavailable: identify results as available only in this tab.

Service keys belong only in the tracked git-crypt encrypted environment file.
Never expose its contents. Browser acceptance tests override server credentials
and speech enablement so they cannot write cloud history or consume paid APIs.
Attempt uploads are limited to 30/minute per IP per warm instance and 1 MiB per
body, with at most 3,600 entries in each sample array, 256 entries in each event
array, and 20 worst-moment markers. Limits apply before database access. Proxy
forwarding headers must be set by the trusted deployment proxy, as for speech.

## Physical sign-off — pending

Automated fixture checks do not replace these checks on the actual demo machine.

- [ ] Current Chrome on the target Mac, in good lighting.
- [ ] Calibration and pickup in average lighting.
- [ ] Repeated hand crossing, loss, and recovery without unintended release.
- [ ] Ten consecutive physical attempts, including restart and camera stop.
- [ ] Measure rendering (target 55–60 FPS), tracking (20–30 FPS), and median
      visible control latency (target below 120 ms).
- [ ] Rehearse the complete judge path live with the intended audio output.
- [ ] Check backup playback on the presentation machine.
- [ ] Validate real PostgreSQL ingestion/retry in an isolated test database.

No isolated PostgreSQL instance is available on the current host. Route,
transaction-gating, and retry tests use dependency-injected failures and writes;
they do not certify deployment database permissions or actual concurrent SQL.
`npm test` is offline by default. `npm run test:db` explicitly opts into the live
bootstrap/health tests, including migration and seed writes to the configured
database; use an isolated test service for that command.

## Scoped live smoke acceptance

Start the app with its configured server credentials and `SPEECH_ENABLED=true`, then run:

```bash
STEADY_LIVE_TEST=1 STEADY_LIVE_BASE_URL=http://localhost:3000 npm run test:live
```

The command creates four synthetic score records for a fresh anonymous test user, verifies upload/retry/progress/ownership, requests a real model review and speech clip, and deletes only that user's records in cleanup. It does not apply migrations or shared seeds. `artifacts/acceptance/live-smoke.json` records each outcome; `live-speech.mp3` permits listening separately. Provider calls may consume the configured account's quota. Normal fixture sessions still do not call live services.

Use the current UI for physical sign-off: check camera permission/retry, actual stage-based calibration, the persistent preview, both playable scenes, Voice off, Reduced graphics, full results, issue focus and manual replay orbit. Verify responsive controls and that stopping the camera preserves completed results. Generated screenshots live under `artifacts/acceptance/`; refresh the backup recording after final UI changes.

## UI acceptance recorded 2026-10-18

Production build/typecheck/lint passed. The offline suite passed 464 tests (13 live-database tests skipped), and final targeted runtime/review/scene tests passed 22 checks. All 27 development browser scenarios passed across the full run and focused reruns; the final four affected UI/switching/recovery scenarios passed together. A single complete final 27-test rerun was not performed. Two production route/replay smoke checks passed.

The fresh-user live smoke verified real Tiger ingestion, idempotent retry, exact progress summaries/trends and ownership isolation, actual Backboard generation, actual ElevenLabs audio, and scoped deletion/empty-history verification. See artifacts/acceptance/live-smoke.json. No migrations or shared seeds were executed. Physical hand tracking, listening through the target audio device and measured ten-attempt performance remain pending.

The results panel is positioned below session controls so camera and mode changes remain usable. Software rendering automatically reduces graphics, and calibration demand-renders the room to preserve camera sampling. Review timeouts are 20 seconds server-side / 25 seconds client-side; deterministic results remain available immediately.
