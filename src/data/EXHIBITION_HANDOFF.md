# Interactive Data Exhibition — final implementation handoff

Completed source implementation: November 5, 2026. This closes the missing Visual Stories work (Phase 3) and the final polish/regression work (Phase 4), while keeping the approved Atlas and compact wireframe Terrain.

## Delivered behavior

All three modes use the existing globe renderer, geographic transform, camera and drag/zoom system. Switching modes changes layers rather than creating a separate page or globe.

| Mode | Current behavior |
| --- | --- |
| Atlas | Existing capitals, Hanoi/My Origin, search, borders and optional flags. |
| Terrain | Continuous spherical density surface, fine wireframe, compact settings and optional source-sample inspection. The pointer-following data box remains removed. |
| Stories | Local image markers, category filtering, hover/keyboard previews, selected-story information, geographic grouping and zoom-to-expand. |

Stories includes 21 clearly disclosed **DEMO** records, three in each of Healthcare, Education, Finance, Economy, Sports, Environment and Technology. Illustrations are original SVG assets made for this demonstration. They are not documentary photographs, measured statistics or research findings. Coordinates reuse the existing Natural Earth capital records.

Each record carries an ID, title, topic, city, country, place ID, latitude/longitude, image URL/alternative text, description, edition year, source, related-data reference and demo flag. Real records require a linked HTTPS source. No real healthcare, financial or other statistical results are fabricated.

## Components and reuse

| File | Responsibility |
| --- | --- |
| `src/components/DataGlobe.tsx` | Shared mode state, lazy story loading/cancellation, camera focus, marker projection, visibility, selection and keyboard camera controls. |
| `src/components/storyData.ts` | Record validation, category filtering, geographic grouping and front-face projection with marker budgets. |
| `src/components/StoryMarkers.tsx` | Image markers, count/demo badges, source anchors, leader lines and accessible previews. |
| `src/components/StoryControls.tsx` | Compact topic filter, keyboard story chooser, information panel, image fallback, retry and View place in Atlas action. |
| `src/components/data-globe.css` | Scoped marker, preview, panel, focus and responsive styles; old Stories Preview styles removed. |
| `src/data/stories-demo.json` | The replaceable 21-record collection. |
| `public/stories/` | Original illustrations and provenance note. |
| `tests/stories.test.ts` | Collection/source validation, assets, filtering, grouping, date-line handling, visibility budgets and thumbnail separation. |
| `package.json` | Standard test command now includes exploration, UX, terrain and stories suites. No dependencies were added. |

The existing `earthPosition`, shared renderer/camera, smooth focus/zoom, `fetchWithTimeout`, native form controls and Liquid Glass control treatment are reused. The renderer's only final cleanup is removal of temporary diagnostic counters. Backend, authentication, database code, API contracts and dimensionality/clustering algorithms were not edited for this work. The repository already contained unrelated changes before this phase; they were preserved.

## Interaction and performance design

- Story data loads on first entry to Stories. Requests are bounded and canceled when leaving before completion. Loading, empty and retry states are provided.
- Images acquire their source only when their marker becomes visible at the front of the globe. Loaded local images use the browser cache. Hidden/other-mode markers cannot intercept interaction.
- Far-view geographic neighbors share an image/count marker. Selecting a group zooms and separates its members, then holds the view still for inspection. Hysteresis avoids repeated regrouping near the zoom threshold.
- Nearby thumbnails can move slightly apart on screen; a fine leader line and dot retain their exact projected geographic anchors. The underlying coordinates never move.
- Projection budgets are at most 16 visible marker groups on desktop and 8 on small viewports. The initial collection is 21 records; validation caps an input collection at 60 records pending larger-collection virtualization.
- Hover/focus previews pause automatic rotation. Selecting an image or a story from the native chooser focuses the shared camera and opens its information. Escape closes details and restores focus to a usable opener.
- Topic filtering changes records without reloading or resetting the camera. A filtered-out selection is cleared.
- View place in Atlas opens the corresponding existing capital, including Hanoi/My Origin.
- The globe itself is keyboard focusable: arrow keys rotate, plus/minus zoom and Home returns to the existing default view. Instructions are available to assistive technology without adding visible help text.
- Mobile controls start collapsed; expanded information scrolls inside its panel. A sticky detail header keeps the close action available. Reduced-motion settings retain instant camera/layer transitions and disable decorative motion.
- Marker transforms update inside the existing frame loop; React does not receive per-frame projected coordinates. Story nodes unmount when leaving the mode and their ref map releases them. No story texture or additional Three.js scene is created.

## Verification performed

### Automated

`npm test` includes 30 tests: 15 existing exploration/export/session/network tests, 7 terrain tests and 8 stories tests. They verify, among other things:

- 21 unique demo records and exactly three per topic; geographic correspondence with existing records.
- Local illustrations exist, disclose DEMO and contain no remote image references or executable SVG content.
- Invalid coordinates, missing disclosure, duplicate IDs, unsafe image paths and unsupported categories are rejected.
- Groups preserve every story exactly once, separate at close zoom, handle the date line and keep selected records accessible.
- Back-facing markers remain hidden even when selected/hovered; mobile marker budgets and geographic anchors are retained when thumbnails separate.
- Existing terrain source fidelity, missing values, seam/poles, displaced picking and disposal checks remain in the standard suite.

The production TypeScript/Vite build also passed during implementation. Final command results are reported in the chat after diagnostic cleanup.

### UI checks completed before the browser tool limit

- Desktop at 1440 × 900: Stories loading; All topics (21) to Healthcare (3); preview through keyboard focus; image load, selection, source/demo information; Escape and focus restoration.
- A Paris/London/Berlin group expanded from the far grouped view to individual markers. The view stayed still after expansion; those cities were then visible individually.
- At one observation, only 6 of 16 grouped thumbnail elements had requested/loaded their image, consistent with visibility-based loading.
- Mobile at 390 × 844: no horizontal overflow, five front-facing markers in the observed view, collapsed/expanded controls and selecting Hanoi through the story chooser.
- View place in Atlas opened Hanoi with 21.0285° N / 105.8542° E and its My Origin content; story marker count became zero after leaving Stories.
- Demo sign-in opened Explore. The 32-row, four-feature `round2-demo.csv` fixture imported into session-only storage while the local API was unavailable.
- UMAP + K-Means completed in the existing browser fallback. Changing normalization from Z-score to Min-Max retained the previous-result labels and metrics. Rerunning updated the chart label and metrics to Min-Max together.
- The actual previous-result JSON download contained 32 source/result rows and the executed Z-score configuration, while the pending setup was Min-Max.
- Methods and Experiments navigation headings were reachable. No claim is made that backend experiment persistence was verified. Sign-out returned to Welcome and ended the session-only CSV test.

### Measured performance

Temporary counters sampled 180 rendered-frame windows at 1440 × 900. Observed Stories windows ranged approximately **54–59 FPS**. At that observation the renderer reported 3 geometries, 0 WebGL textures and 2 draw calls. These figures exclude DOM image/cache memory and are not a guarantee for other devices or a proof against all leaks. Temporary measurement code has been removed.

## Explicit verification limits

The final attempted four-cycle Stories/Terrain canvas/node/resource check **did not execute**: automatic browser approval review stopped it because the browser tool usage limit was exhausted. No alternate browser, raw browser protocol or indirect UI workaround was used. Final screenshots, that last repeated-cycle check and a post-cleanup visual pass remain unverified.

Earlier individual mode transitions and the unit/resource-disposal tests are evidence only for the operations actually described above. Physical touch hardware, forced WebGL-failure visuals and a manually enabled reduced-motion environment were not tested. API/database integration and persistent uploads/history were not tested because the local API was unavailable; browser fallback behavior was tested instead. Expected API connection failures during those fallback checks are distinct from the Welcome/Stories UI checks.

## Next content step

Replace the demo collection with sourced editorial records and licensed local imagery when that content is available. Set `demo: false` only for an actual sourced story, supply a linked source, real edition/year, accurate description and related-data reference, and retain image provenance/alternative text. The renderer and controls do not require a backend rewrite for that content substitution.

For population-grid provenance and the approved Terrain controls, see `TERRAIN_SOURCE.md`.
