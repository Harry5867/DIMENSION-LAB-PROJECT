# Stories, Workspace and Model toolbar — 7 November 2026

## Changes

- Stories uses 21 local, optimized real location photographs from Wikimedia Commons. Photo attribution and license links are separate from the conceptual data source. No measured findings are claimed. See `public/stories/README.md` and `photo-credits.json` for provenance and modifications.
- Stories alone replaces Atlas dots/grid/borders with a NASA Blue Marble surface and atmospheric rim. It reuses the existing renderer, camera, orientation and geographic anchors. The 2048×1024 texture loads lazily once; loaded GPU resources are disposed with the globe. A bounded 240×240 CPU texture projection supports the existing Canvas fallback. The imagery is a historical NASA composite, not live imagery.
- At most ten desktop / six compact story markers are shown. Cluster counts, geographic anchors, filtering, keyboard focus, image previews and left-hand details remain available. Individual DEMO image badges are removed; the disclosure remains in details.
- Workspace has a larger stage, 4,800 / 2,400 / 1,600 points by desktop / compact / low-power budget, and 1,000 in Canvas fallback. Cycles shorten from 7.2 to 5.2 seconds with 1.8-second interpolation. Breathing is stronger, with slow vertical bobbing and phased local drift. Reduced motion keeps gentler timing. Navigation/sign-out, visibility and disposal retain their existing stop gates.
- Model's bottom toolbar contains Auto-rotate, Highlight outliers, Show centroids, Point size and Fullscreen. The former upper-right View options popup is removed. Color legend, Insights, Run analysis and Export remain. PCA biplot stays in the existing left PCA settings.
- Drag rotates, wheel/pinch zooms, click selects. R resets, ± zoom, F fits data. Auto-rotation pauses while dragging or inspecting a selected point. Outliers only highlight marked rows; centroids require valid clustering. The anomaly overlay now honors the spotlight toggle rather than forcing it on. The point slider opens upward, shows its value and supports keyboard input.

## Files

- `src/components/storyEarth.ts` (new), `globeScene.ts`, `DataGlobe.tsx`
- `src/components/storyData.ts`, `StoryControls.tsx`, `StoryMarkers.tsx`, `data-globe.css`
- `src/data/stories-demo.json`, `public/stories/*.webp`, photo-credit JSON files and README
- `scripts/fetch-story-photos.py` (new, explicit preparation tool; Pillow required)
- `src/visuals/dataMorph.ts`, `dataMorphRuntime.ts`, `src/components/workspace-data-morph.css`
- `src/components/ThreeCanvas.tsx`, `src/App.tsx`, `src/index.css`
- `tests/stories.test.ts`, `tests/dataMorph.test.ts`, `docs/portal.md`, design preview files

No new JavaScript package or backend change is required for this revision. Existing unrelated work remains untouched.

## Validation

The project build and 67 automated tests pass. Regression coverage checks local raster signatures, attribution, unsafe image/source rejection, marker budgets, camera framing through bob/rotation and decimal timeline seams. Browser checks cover desktop and 390px mobile, both themes, Stories image loading/filtering/details, switching all globe modes, Workspace navigation/sign-out, Model controls, upward point-size panel and fullscreen fallback. No new console errors or warnings were observed. Uniform 60fps on every device is not guaranteed; responsive budgets, resolution caps, shared renderers and offscreen pause limit the cost.
