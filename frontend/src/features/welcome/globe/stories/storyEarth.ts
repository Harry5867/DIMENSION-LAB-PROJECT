import * as THREE from 'three';

const earthUrl = () => `${import.meta.env.BASE_URL}stories/earth-blue-marble.webp`;

/** One lazy texture in the existing globe renderer; never another WebGL context. */
export function createStoryEarth(globe: THREE.Group) {
  const geometry = new THREE.SphereGeometry(1, 64, 40);
  // Match earthPosition(latitude, longitude) and the equirectangular NASA map.
  geometry.rotateY(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: '#164b55' });
  const earth = new THREE.Mesh(geometry, material);
  const rimMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    uniforms: { color: { value: new THREE.Color('#89c6bc') } },
    vertexShader: 'varying vec3 n; void main(){ n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 color;
      varying vec3 n;
      void main() {
        float a = pow(1.0 - abs(n.z), 4.0) * .28;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }
    `,
  });
  const rim = new THREE.Mesh(geometry, rimMaterial); rim.scale.setScalar(1.025);
  globe.add(earth, rim); earth.visible = rim.visible = false;
  let started = false, disposed = false, dirty = false;
  let texture: THREE.Texture | null = null;
  return {
    needsRedraw: () => dirty,
    draw(visible: boolean) {
      earth.visible = rim.visible = visible; dirty = false;
      if (!visible || started) return;
      started = true;
      new THREE.TextureLoader().load(earthUrl(), loaded => {
        if (disposed) { loaded.dispose(); return; }
        texture = loaded; texture.colorSpace = THREE.SRGBColorSpace;
        material.color.set('#ffffff'); material.map = texture; material.needsUpdate = true; dirty = true;
      }, undefined, () => { /* Keep the quiet solid sphere when imagery cannot load. */ });
    },
    dispose() { disposed = true; texture?.dispose(); geometry.dispose(); material.dispose(); rimMaterial.dispose(); globe.remove(earth, rim); },
  };
}

/** CPU texture projection for machines without WebGL. Bounded at 240² pixels. */
export function createCanvasStoryEarth() {
  const textureCanvas = document.createElement('canvas'), surface = document.createElement('canvas');
  textureCanvas.width = 512; textureCanvas.height = 256;
  surface.width = surface.height = 240;
  const textureContext = textureCanvas.getContext('2d', { willReadFrequently: true });
  const surfaceContext = surface.getContext('2d');
  const output = surfaceContext?.createImageData(240, 240);
  const point = new THREE.Vector3(), inverse = new THREE.Quaternion();
  let pixels: Uint8ClampedArray | null = null, image: HTMLImageElement | null = null;
  let started = false, disposed = false, dirty = false;
  return {
    needsRedraw: () => dirty,
    draw(ctx: CanvasRenderingContext2D, orientation: THREE.Quaternion, radius: number, x: number, y: number) {
      dirty = false;
      if (!started) {
        started = true; image = new Image();
        image.onload = () => {
          if (disposed || !textureContext || !image) return;
          textureContext.drawImage(image, 0, 0, 512, 256);
          pixels = textureContext.getImageData(0, 0, 512, 256).data; dirty = true;
        };
        image.src = earthUrl();
      }
      ctx.globalAlpha = 1;
      if (pixels && output && surfaceContext) {
        inverse.copy(orientation).invert();
        for (let j = 0; j < 240; j++) for (let i = 0; i < 240; i++) {
          const sx = (i + .5) / 120 - 1, sy = 1 - (j + .5) / 120, depth = 1 - sx*sx - sy*sy, k = (j * 240 + i) * 4;
          if (depth <= 0) { output.data[k+3] = 0; continue; }
          point.set(sx, sy, Math.sqrt(depth)).applyQuaternion(inverse);
          const u = Math.min(511, Math.floor((Math.atan2(point.x, point.z) / (2*Math.PI) + .5) * 512));
          const v = Math.min(255, Math.floor((.5 - Math.asin(Math.max(-1, Math.min(1, point.y))) / Math.PI) * 256));
          const source = (v * 512 + u) * 4;
          for (let c = 0; c < 3; c++) output.data[k+c] = pixels[source+c];
          output.data[k+3] = Math.min(255, depth * 10000);
        }
        surfaceContext.putImageData(output, 0, 0);
        ctx.drawImage(surface, x-radius, y-radius, radius*2, radius*2);
      } else {
        ctx.fillStyle = '#164b55'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.fill();
      }
    },
    dispose() { disposed = true; if (image) image.onload = null; image = null; pixels = null; surface.width = textureCanvas.width = 1; },
  };
}
