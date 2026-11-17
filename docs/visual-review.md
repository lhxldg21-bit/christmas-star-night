# Screenshot review contract
Fixed viewport: 900 × 1100. Additional mobile check: 390 × 844.
Deterministic URLs: ?capture=1&t=0,3,7.5,26,28,30,31,55,57,58,60,68,77.
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
