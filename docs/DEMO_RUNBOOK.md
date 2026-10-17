# Demo and acceptance runbook

## Start the app

Run `npm run build`, then `npm run start`. Use current Chrome on the demo Mac.
The default build/dev bundler is Webpack, using the installed Tailwind loader in
Next's existing CSS pipeline. `npm run dev:turbo` retains the Turbopack alternative;
its CSS worker cannot bind a port in the current agent host, even with escalation.
Both build paths use the same source styles and dependencies.

## Judge path (about three minutes)

1. Open `/library` without `debug=1`. Point out the two available skills and the
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
7. State that this is an educational simulation, with synthetic reference guides.

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
- Backboard unavailable or malformed: keep deterministic Coach Review and scores.
- ElevenLabs unavailable: common coaching uses committed clips, then browser
  speech. Replay uses browser speech if live synthesis fails. Text stays visible
  when all audio is unavailable. Fixture replay never requests live synthesis.
- WebGL loss: pause and recover or use the visible retry/reload controls.
- Storage unavailable: identify results as available only in this tab.

Service keys belong only in the tracked git-crypt encrypted environment file.
Never expose its contents. Browser acceptance tests override server credentials
and speech enablement so they cannot write cloud history or consume paid APIs.

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
