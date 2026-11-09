import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MathUtils } from 'three';
import { capitals, capitalPositions } from './globeScene';
import { earthPosition } from './atlasLines';
import { densityColors, terrainDefaults, type TerrainData } from './terrainData';
import { localizedCountry, useWelcomeLanguage } from './WelcomeLanguage';

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
  const { language, t } = useWelcomeLanguage();
  const [sourceOpen, setSourceOpen] = useState(selected !== null);
  const previousSelected = useRef(selected);
  const reading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const changed = selected !== previousSelected.current;
    previousSelected.current = selected;
    if (selected === null || !changed) return;
    setSourceOpen(true);
    const frame = requestAnimationFrame(() => reading.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  const point = data && selected !== null ? data.points[selected] : null;
  return <aside className="globe-terrain-panel" aria-label={t('Terrain controls', 'Điều khiển địa hình')}>
      <div className="terrain-controls-body">
        {error ? <p role="alert">{t('Population data could not be loaded. Reload the page to retry.', 'Không tải được dữ liệu dân số. Hãy tải lại trang để thử lại.')}</p>
          : !data ? <p role="status">{t('Loading WorldPop surface…', 'Đang tải bề mặt WorldPop…')}</p> : <>
            {([
              ['intensity', 'Elevation', 'Elevation intensity', 0, 1, .05],
              ['smoothing', 'Smoothing', 'Surface smoothing', 0, 1, .05],
              ['contrast', 'Contrast', 'Contrast intensity', .5, 2, .05],
            ] as const).map(([key, label, accessibleLabel, min, max, step]) => <div className="terrain-range" key={key}>
              <label htmlFor={`terrain-${key}`}>{t(label, { intensity: 'Độ cao', smoothing: 'Làm mịn', contrast: 'Tương phản' }[key])}</label>
              <input id={`terrain-${key}`} aria-label={t(accessibleLabel, { intensity: 'Cường độ độ cao', smoothing: 'Độ mịn bề mặt', contrast: 'Độ tương phản' }[key])} type="range" min={min} max={max} step={step} value={settings[key]}
                onChange={event => onSettingsChange({ ...settings, [key]: Number(event.currentTarget.value) })} />
              <output htmlFor={`terrain-${key}`}>{Math.round(settings[key] * 100)}%</output>
            </div>)}
            <div className="terrain-visibility-row">
              <label><input type="checkbox" checked={settings.wireframe} onChange={event => onSettingsChange({ ...settings, wireframe: event.currentTarget.checked })} /> {t('Wireframe', 'Lưới tam giác')}</label>
              <button type="button" aria-label={t('Reset visualization', 'Đặt lại trực quan hóa')} onClick={onReset}>{t('Reset', 'Đặt lại')}</button>
            </div>
            <div className="terrain-color-key" aria-label={t('Density color scale, logarithmic, capped at the 98th percentile', 'Thang màu mật độ theo logarit, giới hạn ở phân vị 98')}>
              <i style={{ background: `linear-gradient(to right, ${densityColors.join(',')})` }} />
              <span>0</span><span>{Math.round(data.heightCap).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}+ {t('people/km²', 'người/km²')}</span>
            </div>
            <details className="terrain-data-details" open={sourceOpen} onToggle={event => setSourceOpen(event.currentTarget.open)}>
              <summary>{t('Data & source', 'Dữ liệu và nguồn')} <ChevronDown size={14} aria-hidden="true" /></summary>
              <div className="terrain-data-body">
                <label htmlFor="terrain-sample">{t('Inspect sample', 'Xem mẫu dữ liệu')}</label>
                <select id="terrain-sample" aria-label={t('Inspect a source sample', 'Xem một mẫu từ nguồn dữ liệu')} value={selected ?? ''} onChange={event => onInspect(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
                  <option value="">{t('Select a sample', 'Chọn mẫu dữ liệu')}</option>
                  {data.featuredIndices.map(index => <option key={index} value={index}>{location(data.points[index].latitude, data.points[index].longitude)}</option>)}
                </select>
                {point ? <div ref={reading} className="terrain-reading" role="status" aria-label={t('Terrain sample', 'Mẫu địa hình')}><TerrainSampleDetails data={data} point={point} /></div>
                  : null}
                <details className="terrain-sampling">
                  <summary>{t('Sampling & scale', 'Lấy mẫu và thang đo')} <ChevronDown size={14} aria-hidden="true" /></summary>
                  <p>{t('WorldPop 2020 raster sampled every 0.5°. Readings are sampled cells, not regional averages or city-wide statistics.', 'Dữ liệu raster WorldPop 2020 được lấy mẫu mỗi 0,5°. Giá trị thể hiện từng ô mẫu, không phải trung bình của một vùng hay toàn thành phố.')}</p>
                  <p>{t('Height and color share a logarithmic field capped at P98, eased to the neutral base within valid boundary cells. Smoothing affects only the display. Contrast changes color emphasis. Missing cells stay unmeasured; zero is a valid value.', 'Độ cao và màu sắc dùng cùng một thang logarit giới hạn ở P98, chuyển dần về bề mặt nền tại các ô biên hợp lệ. Làm mịn chỉ tác động đến hiển thị. Tương phản thay đổi mức nhấn màu. Ô thiếu dữ liệu vẫn được giữ trống; số 0 là giá trị hợp lệ.')}</p>
                  <p>{t('Blank regions use a neutral base surface. No interpolation fills gaps in the source mask.', 'Vùng trống dùng bề mặt nền trung tính. Không nội suy để lấp các khoảng thiếu trong dữ liệu nguồn.')}</p>
                </details>
              </div>
            </details>
            <p className="terrain-source"><a href={data.sourceUrl} target="_blank" rel="noreferrer">WorldPop / CIESIN · {data.year}</a><a href={data.license} target="_blank" rel="noreferrer">CC BY 4.0</a></p>
          </>}
      </div>
  </aside>;
}

function TerrainSampleDetails({ data, point }: { data: TerrainData; point: { latitude: number; longitude: number; density: number | null } }) {
  const { language, t } = useWelcomeLanguage();
  const nearby = useMemo(() => {
    if (!point) return null;
    const position = earthPosition(point.latitude, point.longitude);
    let index = 0, similarity = -Infinity;
    capitalPositions.forEach((capital, candidate) => {
      const dot = capital.dot(position);
      if (dot > similarity) { index = candidate; similarity = dot; }
    });
    const distance = Math.round(Math.acos(MathUtils.clamp(similarity, -1, 1)) * 6371);
    return `${t('Nearest capital', 'Thủ đô gần nhất')}: ${capitals[index].city}, ${localizedCountry(capitals[index].iso || '', capitals[index].country, language)} · ${distance.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} km`;
  }, [point, language, t]);
  return <>
    <strong>{point.density === null ? t('No data available', 'Chưa có dữ liệu') : <>{point.density.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 })} <small>{t('people/km²', 'người/km²')}</small></>}</strong>
    <p>{location(point.latitude, point.longitude)}</p><p>{nearby}</p>
    <p>{t('Population density', 'Mật độ dân số')} · {data.year}<br />{data.source}</p>
    <p>{point.density === null ? t('No source measurement at this location.', 'Vị trí này không có phép đo trong nguồn dữ liệu.') : t('Source cell value · surface is smoothed', 'Giá trị ô nguồn · bề mặt đã làm mịn')}</p>
  </>;
}
