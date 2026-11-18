# Screenshot review contract
Fixed viewport: 900 × 1100. Additional mobile check: 390 × 844.
Deterministic URLs: ?capture=1&t=0,3,7.5,18,26,27,28,30,31,34,55,57,58,60,68,77.
Each revision uses the same story times and viewport; shot compositions may be corrected as part of the implementation.
Independent reviewer receives PNG paths only, with no code or implementation context. Severity: P1 severe, P2 medium, P3 minor. Iterate until reviewer reports no P1/P2.
Static review cannot verify motion/audio; separately validate flow, transitions and build.

## v6 review — 2026-11-17 22:40

- Review captures: `../outputs/christmas-review/v6/01-arrival.png` through `07-letter.png` when the repository sits in `2026-11-17/i`. The in-app browser capture viewport was 534×717; v1–v3 remain available at the original 900×1100 contract.
- Resolved in this pass: fox delivery pose and snow-burst gag are readable without copy; player and fox share the pickup frame; the unlit lamp no longer bisects the gag action; the courtyard wall is continuous; footprints and path shoulders read at the final pullback; the awakening star stays amber instead of clipping to white.
- Remaining P3 polish: the stylized pine cones and snow boulders are still visually repetitive; the final wide shot favours silhouette over detail; facial acting remains intentionally simple for the low-poly target.
- No known P1/P2 visual blockers remain in the deterministic review set. Motion cadence, footstep/audio transitions, touch input, mobile performance and the A/B config flow still require a live pass after any further visual edits.
- Production build `npm run build` passes. Vite reports only the existing single-bundle size warning.

## v7 narrative staging — 2026-11-17 22:54

- First-frame capture: `00-first.png`. The initial character/fox transforms are now applied during reset, so t=0 no longer shows a camera buried in a tree or a scene containing only the star. The opening hint explicitly points players toward the warm light.
- Fox beat: `03-fox-run.png` (26s), `04-fox-peek.png` (28s), `05-fox-shake.png` (30s), `06-fox-hop.png` (31s). The fox runs to a dedicated snowbank at the bend, peeks out, receives snow on its nose, shakes it off, and jumps above the bank before the “make you smile” line appears.
- Placement beat: `07-place-ready.png` (55s), `08-place-approach.png` (57s), `09-place-contact.png` (58s), `10-star-awake.png` (60s). The placement prompt is distance-gated; triggering it makes the player walk to the pedestal, carry the star forward, and place it at a rest height above the top ring instead of pulling it in from far away.
- Tone pass: one muted evergreen wreath on the cottage door and a berry collar/bell on the fox add Christmas specificity without turning the clean, lonely snowscape into a generic holiday scene.
- v7 captures are stored in `/Users/sisichen/Documents/Codex/2026-11-17/i/outputs/christmas-review/v7/` at the current in-app 534×717 viewport.

## v9 causal fox pass — 2026-11-17 23:05

- Fox movement is now motivated in three stages: `waitAhead` when the player pauses (the fox stays in front and looks back), `invite` (a short face-the-player nod, tail wag and bounce), then a fast run to the snowbank. This removes the old unannounced sprint-back that read as a stalled game.
- The snow now has a visible source: a low, snow-covered branch over the bank emits a local falling-particle shower before the larger clump reaches the fox’s nose. The resulting shake, snow burst and playful hop form one causal performance, and the walk-line toast waits until the fox has returned.
- Placement is gated by real proximity rather than route progress. The player walks to the plinth, raises the star, and places it over 2.15 seconds. The final star scale/rest offset puts its lower point against the top ring instead of intersecting or floating above the pedestal.
- Final review captures: `v9/00-first.png` through `15-letter.png` in the review output directory, covering first frame, wait/invite/cover/snow/shake/hop/return, placement, lighting, pullback and letter.
- Remaining P3: stylized pine cones and snowbank facets repeat; the snow clump is intentionally graphic and slightly theatrical; live motion/audio and a trustworthy independent blind review are still required.


## v10 Qwen preview and follow-up — 2026-11-18

- The star has a berry ribbon, a sealed note, and a swinging name tag. The inspection panel prioritizes flipping until the first flip. A smaller star stays visible as a lantern during the walk.
- Bloom is softer during pickup and builds as the courtyard lights up. The opening gate has no overhead beam. The crane view crosses extended snow terrain while the distant ridges fade.
- The fox pauses after pouncing and returns to the trail while the camera gradually reframes. Its four paws lift in staggered phases, with less body bounce and slower movement through turns.
- The wider look range while walking remains available. Tap targets include the star and fox. The letter can lead to a reply panel and downloadable poster.
- The production build passed. Browser checks covered the pickup, pounce recovery, and crane frames. Full content-script verification requires the local `3dpy` runner. Real-device motion and audio still need a pass.
