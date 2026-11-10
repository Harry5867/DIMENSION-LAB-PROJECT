import { MathUtils, PerspectiveCamera, Spherical, Vector2, Vector3 } from 'three';
import { particleStyle } from '../visuals/particleStyle';

/** Apply pointer tilt to the rendered view, leaving the OrbitControls camera untouched. */
export function createPlotViewCamera(orbit: PerspectiveCamera, target: Vector3) {
  const view = orbit.clone();
  const pointer = new Vector2(), tilt = new Vector2();
  const offset = new Vector3(), spherical = new Spherical();
  return {
    camera: view,
    setPointer(x: number, y: number) {
      pointer.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1));
    },
    update(delta: number, reduced: boolean, suspended: boolean) {
      if (reduced) {
        tilt.set(0, 0);
      } else {
        const ease = 1 - Math.exp(-delta * particleStyle.pointerFollow);
        // Explore uses a shallower orbit than the decorative Overview.
        tilt.x = MathUtils.lerp(tilt.x, suspended ? 0 : pointer.x * particleStyle.pointerYaw * .42, ease);
        tilt.y = MathUtils.lerp(tilt.y, suspended ? 0 : pointer.y * particleStyle.pointerPitch * .42, ease);
        if (tilt.lengthSq() < 1e-8) tilt.set(0, 0);
      }
      view.copy(orbit, false);
      if (tilt.x || tilt.y) {
        spherical.setFromVector3(offset.subVectors(orbit.position, target));
        spherical.theta += tilt.x;
        spherical.phi += tilt.y;
        spherical.makeSafe();
        view.position.setFromSpherical(spherical).add(target);
        view.lookAt(target);
      }
      view.updateMatrixWorld(true);
    },
  };
}
