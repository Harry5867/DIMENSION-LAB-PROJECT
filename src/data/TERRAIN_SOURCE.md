# Spherical wireframe density terrain

The Terrain mode uses WorldPop / CIESIN estimated population density for **2020**, measured in **people/km²**. [Source DOI](https://doi.org/10.5258/SOTON/WP00674), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Source and reproducibility

`worldpop-grid-2020.bin` restores the complete **720 × 360** exported grid used to prepare the previous particle exhibit. It is row-major, little-endian Float32; `NaN` explicitly means NoData. It contains **61,345 valid cells**, **10,342 valid zeros**, and **197,855 missing cells**. Metadata, encoding and the original TIFF SHA-256 are recorded in `worldpop-grid-2020.json`.

The native WorldPop raster is 30 arc seconds (approximately 1 km at the equator). This exhibit takes nearest-neighbor samples every **0.5°**; it is not the full native raster, not area averages, and not a complete search for local maxima. Small settlements and islands can be missed. Readings must not be treated as city-wide statistics or used to sum regional population.

Retrieved November 5, 2026 from the [WorldPop ImageServer](https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_1km/ImageServer) with `/exportImage`:

```
bbox=-180,-90,180,90
bboxSR=4326
imageSR=4326
size=720,360
format=tiff
pixelType=F32
interpolation=RSP_NearestNeighbor
time=1577836800000
f=json
```

Rebuild the binary from that exact uncompressed Float32 GeoTIFF:

```
node scripts/prepare-terrain-grid.mjs <export.tif>
```

The extractor verifies dimensions, extent, band type and spacing. It excludes the positive Float32 NoData sentinel (`Math.fround(3.4e38)`), negatives and non-finite source values. It retains valid zeros and original Float32 values. Pixel centers are `latitude = 90 - (row + .5) * .5`, `longitude = -180 + (column + .5) * .5`.

`worldpop-density-2020.json` remains only to identify the earlier exhibit's selected example coordinates. The displayed values for those coordinates are now read from the restored binary, avoiding the legacy JSON's decimal rounding. It no longer supplies mesh heights.

## Display field

- Normalize valid samples with `log1p(min(value, P98)) / log1p(P98)`; P98 is calculated over positive samples in the restored grid.
- Precompute 12 rounds of masked four-neighbor diffusion. Only adjacent valid cells communicate; no smoothing step writes a density into missing cells. Source values never change.
- Surface smoothing blends the original normalized field with that smoothed field. Bilinear display sampling uses immediate valid neighbors and is gated by the original nearest-cell validity mask.
- Within valid cells adjacent to missing data, a fixed boundary taper (0.3 at one cell, 0.8 at two, 1 beyond) and bilinear coverage ease the display back to its neutral base. This avoids coastal walls without assigning population values to oceans or gaps. Color and height read this same display field. Thus displayed height/color are illustrative, not exact source-cell measurements.
- Contrast is a monotonic color-only gamma adjustment. Height is independent of contrast. Six sequential colors run from `#EDF1ED` to `#1F4334`.
- Original source-cell density, coordinates, year and attribution appear in the optional Data & source section of the control panel. Geographic context is distance to a nearby capital, not an inferred administrative region. Missing source cells explicitly read **No data available**; a zero is shown numerically.

## Geometry and interaction

The existing Three.js renderer, camera, orientation, zoom and drag controls are retained. Only Terrain's data layer changes. The mesh uses a closed spherical grid: **360 × 180 segments / 65,341 vertices** on desktop, **180 × 90 / 16,471 vertices** below 520 px. Mesh resolution controls geometric smoothness; it does not add geographic measurements. The longitude seam has identical values and normals; pole normals are shared. A separate quadrilateral line grid avoids diagonal triangle clutter and reduces line density near the poles.

Raw/smoothed heights and smooth normals are uploaded once per LOD. Elevation, smoothing, contrast, highlight and transition blend are uniforms, so moving sliders does not rebuild geometry. Normals interpolate between precomputed endpoint normals as a visual lighting approximation; ray intersections use actual displaced vertex positions.

Picking traverses grid cells crossed by the ray through the elevation shell, then intersects their exact displaced triangles. It uses the same smoothing, elevation and transition blend as rendering, including near the limb. CPU tests compare this method against complete Three.js mesh raycasts. Picking is throttled to about 11 Hz; readings update only when the source cell changes. A source-sample select provides a keyboard/touch alternative.

Atlas particles/grid are not drawn once Terrain is fully visible. The shared transition lasts 550 ms, with reduced-motion handling. Atlas markers fade with pointer/keyboard interaction disabled while hidden. Rapid mode changes reuse the same renderer and buffers. Reset changes visualization settings and reading selection, retaining camera position.

Canvas fallback draws connected low-resolution faces and grid lines from the same field (90 × 45 segments); its lighting and occlusion are simpler than WebGL. Its picker uses that actual fallback mesh. It never falls back to the removed particle elevation.

## Changed files

- `src/components/terrainData.ts`: restored grid, missing mask, source readings, display field and defaults.
- `src/components/terrainSurface.ts`: spherical topology, normals, displacement and triangle picking.
- `src/components/terrainGeometry.ts`: WebGL surface, fine wireframe, uniforms and resource lifecycle.
- `src/components/terrainCanvas.ts`: connected-surface Canvas fallback.
- `src/components/globeScene.ts`: shared renderer integration, layer visibility and picking interface.
- `src/components/DataGlobe.tsx`: settings, mesh hover, source selection and mode transition.
- `src/components/TerrainControls.tsx`, `data-globe.css`: controls and responsive styling.
- `src/data/worldpop-grid-2020.bin`, `worldpop-grid-2020.json`: restored sampled source grid.
- `scripts/prepare-terrain-grid.mjs`: reproducible extraction.
- `tests/terrain.test.ts`: source fidelity, missing values, smoothing, seam/poles, raycast correspondence, LOD/disposal and Canvas fallback.

No backend, authentication, Explore algorithms, API contracts or dependencies were changed. Stories now uses its own independent illustrated demo collection; see EXHIBITION_HANDOFF.md.

Validation commands:

```
npm run build
npm test
node --import tsx --test tests/terrain.test.ts
```

## Verification — November 5, 2026

- Production TypeScript/Vite build passed; 15 existing application tests and 7 terrain tests passed.
- Desktop WebGL at 1440 × 900: elevation 0–100%, smoothing endpoints, contrast endpoints, wireframe toggle and Reset; drag/zoom; selected source sample; pointer reading and neutral NoData region; repeated Atlas/Terrain switches and unchanged Stories preview.
- Tokyo source sample remains 13,331.61 people/km² at 35.75° N / 139.75° E. A source-missing ocean location at 51.25° N / 173.75° W displayed No data available, with a separate floating tooltip that needs no panel scrolling.
- At 390 × 844, the page has no horizontal overflow. Controls start collapsed; the expanded panel stays below the mode switcher. Sample selection works via native select. Returning to desktop restores the detailed mesh.
- Atlas capital search, Hanoi's My Origin panel and Enter the Lab opening Sign in were checked. Backend analysis/upload integrations were not rerun; their code was not edited.
- Temporary renderer counters measured typically about 60 FPS, with some 180-frame windows around 55–58 FPS during the development checks. Terrain used 2 draw calls and 128,880 triangles on desktop. After loading terrain, renderer geometry count stayed at 5 and texture count at 0 through the checked mode and LOD switches. This checks for obvious resource growth, not a proof against every memory leak. Probe code was removed.
- No browser error/warning logs during the final interaction checks. The unit test compares displaced picking with full mesh raycasting and verifies geometry replacement/disposal and connected Canvas fallback faces.

Limits: responsive testing uses a desktop browser viewport, not physical touch hardware. Canvas fallback is covered structurally by tests but was not visually exercised through a forced WebGL failure. Reduced-motion handling was retained but not visually tested in this run. The sampled source resolution, smoothing, boundary taper and P98 clipping constrain interpretation; exact source values remain in readings.

## Compact controls refinement

The pointer-following reading tooltip has been removed at the user's request. Hover keeps the subtle surface highlight only. The default control panel is now 232 px wide with three inline slider rows, Wireframe and Reset, the density key and source attribution. Sample selection and scale explanations are under the initially closed Data & source section. Source readings remain available there. Earlier floating-tooltip checks above describe the previous UI.
