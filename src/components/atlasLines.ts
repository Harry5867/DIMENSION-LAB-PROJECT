import { Vector3 } from 'three';
import borders from '../data/atlas-borders.json';

export const borderSource = borders.source;
const radians = Math.PI / 180;

export function earthPosition(latitude: number, longitude: number) {
  const lat = latitude * radians;
  const lon = longitude * radians;
  return new Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
}

function segments(lines: number[][], scale: number) {
  const vertices: number[] = [];
  for (const line of lines) {
    let previous = earthPosition(line[1] * scale, line[0] * scale);
    for (let index = 2; index < line.length; index += 2) {
      const next = earthPosition(line[index + 1] * scale, line[index] * scale);
      vertices.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
      previous = next;
    }
  }
  return new Float32Array(vertices);
}

function graticule(step: number) {
  const lines: number[][] = [];
  for (let longitude = -180; longitude < 180; longitude += step) {
    const meridian: number[] = [];
    for (let latitude = -90; latitude <= 90; latitude += 3) meridian.push(longitude, latitude);
    lines.push(meridian);
  }
  for (let latitude = -90 + step; latitude < 90; latitude += step) {
    const parallel: number[] = [];
    for (let longitude = -180; longitude <= 180; longitude += 3) parallel.push(longitude, latitude);
    lines.push(parallel);
  }
  return segments(lines, 1);
}

export const atlasLines = {
  grid: graticule(30),
  detail: graticule(15),
  // The vendored lines store longitude/latitude pairs in hundredths of a degree.
  borders: segments(borders.lines, .01),
};
