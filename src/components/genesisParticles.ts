import { scanAxisX, scanAxisZ } from '../visuals/welcomeGenesis';

export const atlasScanStyle = `
  float scanCoordinate(vec3 world) {
    return dot(world.xz, vec2(${scanAxisX.toFixed(6)}, ${scanAxisZ.toFixed(6)}));
  }
  float scanReveal(float coord, float scan) {
    return 1.0 - smoothstep(scan - .11, scan, coord);
  }
`;

export const atlasParticleStyle = `
  vec3 atlasColor(float land, float front, float dark) {
    return mix(mix(vec3(0.72), vec3(.42,.53,.46), dark),
      mix(vec3(.290,.310,.298), vec3(.76,.85,.78), dark), land * front);
  }
  float atlasOpacity(float land, float front, float depth) {
    return mix(.035, mix(.24,.90,depth), front) * mix(.42,1.0,land);
  }
  float atlasSize(float land, float depth, float dotSize) {
    return max(1.0, dotSize * mix(.66,1.0,land) * mix(.72,1.12,depth));
  }
`;

export const atlasParticleFragment = `
  varying float opacity;
  varying vec3 color;
  void main() {
    float coverage = 1.0 - smoothstep(.30,.50,distance(gl_PointCoord,vec2(.5)));
    gl_FragColor = vec4(color,opacity * coverage);
  }
`;
