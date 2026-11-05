import { useMemo, useState } from 'react';
import { MathUtils } from 'three';
import { capitals, capitalPositions } from './globeScene';
import { earthPosition } from './atlasLines';
import { densityColors, terrainDefaults, type TerrainData } from './terrainData';

interface Props {
  data: TerrainData | null; error: boolean; settings: typeof terrainDefaults;
  selected: number | null;
  onSettingsChange: (settings: typeof terrainDefaults) => void;
  onInspect: (index: number | null) => void;
  onReset: () => void;
}
function location(latitude: number, longitude: number) {
  return Math.abs(latitude).toFixed(2) + '° ' + (latitude < 0 ? 'S' : 'N') + ' · ' + Math.abs(longitude).toFixed(2) + '° ' + (longitude < 0 ? 'W' : 'E');
}
export function TerrainControls({ data, error, settings, selected, onSettingsChange, onInspect, onReset }: Props) {
  const [expanded, setExpanded] = useState(() => matchMedia('(min-width: 600px)').matches);
  const point = data && selected !== null ? data.points[selected] : null;
  return <aside className="globe-terrain-panel" aria-label="Terrain controls">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>Population density <span>{data?.year ?? 2020}</span></summary>
      <div className="terrain-controls-body">
        {error ? <p role="alert">Population data could not be loaded. Reload the page to retry.</p>
          : !data ? <p role="status">Loading WorldPop surface…</p> : <>
            {([
              ['intensity', 'Elevation', 'Elevation intensity', 0, 1, .05],
              ['smoothing', 'Smoothing', 'Surface smoothing', 0, 1, .05],
              ['contrast', 'Contrast', 'Contrast intensity', .5, 2, .05],
            ] as const).map(([key, label, accessibleLabel, min, max, step]) => <div className="terrain-range" key={key}>
              <label htmlFor={`terrain-${key}`}>{label}</label>
              <input id={`terrain-${key}`} aria-label={accessibleLabel} type="range" min={min} max={max} step={step} value={settings[key]}
                onChange={event => onSettingsChange({ ...settings, [key]: Number(event.currentTarget.value) })} />
              <output htmlFor={`terrain-${key}`}>{Math.round(settings[key] * 100)}%</output>
            </div>)}
            <div className="terrain-visibility-row">
              <label><input type="checkbox" checked={settings.wireframe} onChange={event => onSettingsChange({ ...settings, wireframe: event.currentTarget.checked })} /> Wireframe</label>
              <button type="button" aria-label="Reset visualization" onClick={onReset}>Reset</button>
            </div>
            <div className="terrain-color-key" aria-label="Density color scale, logarithmic, capped at the 98th percentile">
              <i style={{ background: `linear-gradient(to right, ${densityColors.join(',')})` }} />
              <span>0</span><span>{Math.round(data.heightCap).toLocaleString('en-US')}+ people/km²</span>
            </div>
            <details className="terrain-data-details">
              <summary>Data &amp; source</summary>
              <div className="terrain-data-body">
                <label htmlFor="terrain-sample">Inspect sample</label>
                <select id="terrain-sample" aria-label="Inspect a source sample" value={selected ?? ''} onChange={event => onInspect(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
                  <option value="">Select a sample</option>
                  {data.featuredIndices.map(index => <option key={index} value={index}>{location(data.points[index].latitude, data.points[index].longitude)}</option>)}
                </select>
                {point ? <div className="terrain-reading" role="status" aria-label="Terrain sample"><TerrainSampleDetails data={data} point={point} /></div>
                  : null}
                <details className="terrain-sampling">
                  <summary>Sampling &amp; scale</summary>
                  <p>WorldPop 2020 raster sampled every 0.5°. Readings are sampled cells, not regional averages or city-wide statistics.</p>
                  <p>Height and color share a logarithmic field capped at P98, eased to the neutral base within valid boundary cells. Smoothing affects only the display. Contrast changes color emphasis. Missing cells stay unmeasured; zero is a valid value.</p>
                  <p>Blank regions use a neutral base surface. No interpolation fills gaps in the source mask.</p>
                </details>
              </div>
            </details>
            <p className="terrain-source"><a href={data.sourceUrl} target="_blank" rel="noreferrer">WorldPop / CIESIN</a><a href={data.license} target="_blank" rel="noreferrer">CC BY 4.0</a></p>
          </>}
      </div>
    </details>
  </aside>;
}

function TerrainSampleDetails({ data, point }: { data: TerrainData; point: { latitude: number; longitude: number; density: number | null } }) {
  const nearby = useMemo(() => {
    if (!point) return null;
    const position = earthPosition(point.latitude, point.longitude);
    let index = 0, similarity = -Infinity;
    capitalPositions.forEach((capital, candidate) => {
      const dot = capital.dot(position);
      if (dot > similarity) { index = candidate; similarity = dot; }
    });
    const distance = Math.round(Math.acos(MathUtils.clamp(similarity, -1, 1)) * 6371);
    return `Nearest capital: ${capitals[index].city}, ${capitals[index].country} · ${distance.toLocaleString('en-US')} km`;
  }, [point]);
  return <>
    <strong>{point.density === null ? 'No data available' : <>{point.density.toLocaleString('en-US', { maximumFractionDigits: 2 })} <small>people/km²</small></>}</strong>
    <p>{location(point.latitude, point.longitude)}</p><p>{nearby}</p>
    <p>Population density · {data.year}<br />{data.source}</p>
    <p>{point.density === null ? 'No source measurement at this location.' : 'Source cell value · surface is smoothed'}</p>
  </>;
}
