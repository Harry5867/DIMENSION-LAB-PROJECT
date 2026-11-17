import * as THREE from 'three';

export function createPlotGrid(far: number) {
  const geometry = new THREE.PlaneGeometry(far * 2, far * 2).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { gridColor: { value: new THREE.Color('#8296ad') } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `
      varying vec3 worldPosition;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 gridColor;
      varying vec3 worldPosition;

      float gridLines(float spacing) {
        vec2 cell = worldPosition.xz / spacing;
        vec2 footprint = max(fwidth(cell), vec2(0.0001));
        vec2 distanceToLine = abs(fract(cell + 0.5) - 0.5);
        vec2 line = 1.0 - smoothstep(footprint * 0.15, footprint * 0.9, distanceToLine);
        // Fade out each direction as its lines become too dense to resolve.
        line *= 1.0 - smoothstep(vec2(0.12), vec2(0.5), footprint);
        return max(line.x, line.y);
      }

      void main() {
        float fine = gridLines(4.0) * 0.24;
        float major = gridLines(20.0) * 0.42;
        float coarse = gridLines(100.0) * 0.42;
        float fade = 1.0 - smoothstep(95.0, 640.0, distance(worldPosition, cameraPosition));
        gl_FragColor = vec4(gridColor, max(max(fine, major), coarse) * fade);
        #include <colorspace_fragment>
      }
    `,
  });
  const grid = new THREE.Mesh(geometry, material);
  // The mesh follows the camera in XZ, while its lines stay fixed in world space.
  grid.frustumCulled = false;
  return grid;
}
