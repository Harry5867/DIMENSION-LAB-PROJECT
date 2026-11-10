import { useAppLanguage } from "./WelcomeLanguage";
import type { GMMResult } from '../algorithms/gmm';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DataPoint, ColorMode } from '../types';
import { getErrorMessage } from '../utils/typeGuards';
import { Orbit, ScanEye, Crosshair, CircleDot, Palette, Maximize, Minimize } from 'lucide-react';
import { createPlotGrid } from './plotGrid';
import { createPlotCloud, makePlotColors, normalizePlotPoints, type PlotTransition } from './plotCloud';
import { createPlotViewCamera } from './plotViewCamera';

interface ThreeCanvasProps {
  gmm?: GMMResult;
  active?: boolean;
  transitionRef?: React.RefObject<PlotTransition | null>;
  snapshotRef?: React.RefObject<(() => void) | null>;
  hasClustering?: boolean;
  dataPoints: DataPoint[];
  colorMode: ColorMode;
  selectedFeature?: string;
  onSelectPoint: (point: DataPoint | null) => void;
  selectedPoint: DataPoint | null;
  reductionMethod: string;
  titleBadge?: string;
  showProjectionBadge?: boolean;
  axisFeatures?: string[];
  showCentroids?: boolean;
  pcaComponents?: number[][];
  featureNames?: string[];
  showBiplot?: boolean;
  biplotTopK?: number;
  theme?: 'dark' | 'light';
  showOutliersSpotlight?: boolean;
  onToggleOutliersSpotlight?: () => void;
  isFullscreen?: boolean;
  toolbarHost?: HTMLDivElement | null;
  onToggleFullscreen?: () => void;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  gmm,
  active = true,
  dataPoints = [],
  transitionRef,
  snapshotRef,
  hasClustering = true,
  colorMode,
  selectedFeature,
  onSelectPoint,
  selectedPoint,
  reductionMethod,
  titleBadge,
  showProjectionBadge = true,
  axisFeatures,
  showCentroids = false,
  pcaComponents,
  featureNames,
  showBiplot = false,
  biplotTopK = 6,
  showOutliersSpotlight,
  onToggleOutliersSpotlight,
  isFullscreen = false,
  toolbarHost,
  onToggleFullscreen,
  theme = 'light',
}) => {
  const { language, tr } = useAppLanguage();
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const viewMenuName = useId();
  const [pointScale, setPointScale] = useState(0.4);
  const [centroidsVisible, setCentroidsVisible] = useState(showCentroids);
  const [biplotVisible, setBiplotVisible] = useState(showBiplot);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [internalSpotlight, setInternalSpotlight] = useState(true);
  const isSpotlightActive = showOutliersSpotlight !== undefined ? showOutliersSpotlight : internalSpotlight;
  const isSpotlightActiveRef = useRef(isSpotlightActive);
  isSpotlightActiveRef.current = isSpotlightActive;

  const selectedPointRef = useRef(selectedPoint);
  selectedPointRef.current = selectedPoint;
  const autoRotateRef = useRef(isAutoRotating);
  autoRotateRef.current = isAutoRotating;
  const interactingRef = useRef(false);
  const fitRef = useRef<() => void>(() => {});
  const hasOutliers = dataPoints.some(point => point.isOutlier);
  const canShowCentroids = hasClustering && dataPoints.some(point => Number.isInteger(point.cluster) && point.cluster >= 0);

  const handleToggleSpotlight = () => {
    if (onToggleOutliersSpotlight) onToggleOutliersSpotlight();
    else setInternalSpotlight((prev) => !prev);
  };

  const plotColors = useMemo(() => makePlotColors(dataPoints, colorMode, selectedFeature, theme === 'dark'),
    [dataPoints, colorMode, selectedFeature, theme]);
  const colors = useMemo(() => dataPoints.map(plotColors.forPoint), [dataPoints, plotColors]);

  const legendGroups = useMemo(() => {
    const counts = new Map<number | string, number>();
    for (const point of dataPoints) {
      const group = colorMode === 'cluster' ? point.cluster : String(point.label ?? '').trim();
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
  }, [dataPoints, colorMode]);

  useEffect(() => {
    if (showBiplot !== undefined) {
      setBiplotVisible(showBiplot);
    }
  }, [showBiplot]);

  // Refs for callbacks to prevent destroying Three.js scene on prop changes
  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;
  const [sceneReady, setSceneReady] = useState(false);

  // Persistent Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cloudRef = useRef<ReturnType<typeof createPlotCloud> | null>(null);
  const centroidGroupRef = useRef<THREE.Group | null>(null);
  const gmmGroupRef = useRef<THREE.Group | null>(null);
  const biplotGroupRef = useRef<THREE.Group | null>(null);
  const axesGroupRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<ReturnType<typeof createPlotGrid> | null>(null);
  const outlierGroupRef = useRef<THREE.Group | null>(null);

  const showAxes = true;

  const plot = useMemo(() => normalizePlotPoints(dataPoints), [dataPoints]);
  const { points: normalizedPoints, groundY } = plot;
  const pointsRef = useRef(dataPoints);
  pointsRef.current = dataPoints;

  // 1. INITIALIZE THREE.JS SCENE (Mount Once)
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    // Scientific Background: #0D1117
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(container).getPropertyValue('--plot-bg').trim() || '#ffffff');
    sceneRef.current = scene;

    // Centroid Group
    const centroidGroup = new THREE.Group();
    scene.add(centroidGroup);
    centroidGroupRef.current = centroidGroup;

    // Biplot Feature Vectors Group
    const biplotGroup = new THREE.Group();
    scene.add(biplotGroup);
    biplotGroupRef.current = biplotGroup;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(65, 45, 80);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 0.9;
    controls.maxDistance = 260;
    controls.minDistance = 15;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.2;
    const view = createPlotViewCamera(camera, controls.target);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dom = renderer.domElement;
    const beginInteraction = () => {
      interactingRef.current = true;
      controls.autoRotate = false;
      view.setPointer(0, 0);
      dom.style.cursor = 'grabbing';
    };
    const endInteraction = () => {
      interactingRef.current = false;
      dom.style.cursor = 'grab';
    };
    controls.addEventListener('start', beginInteraction);
    controls.addEventListener('end', endInteraction);

    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controlsRef.current = controls;

    const cloud = createPlotCloud(scene);
    cloudRef.current = cloud;

    const grid = createPlotGrid(camera.far);
    gridRef.current = grid;
    scene.add(grid);

    // 3D Coordinate Axes Group
    const axesGroup = new THREE.Group();
    scene.add(axesGroup);
    axesGroupRef.current = axesGroup;

    const outlierGroup = new THREE.Group();
    scene.add(outlierGroup);
    outlierGroupRef.current = outlierGroup;

    // Pointer Events for Raycasting (Hover / Select point)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const updatePointer = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    let press: { id: number; x: number; y: number } | undefined;
    let lastHoverCheck = -Infinity;
    const handlePointerDown = (e: PointerEvent) => {
      if (e.isPrimary && e.button === 0) press = { id: e.pointerId, x: e.clientX, y: e.clientY };
      else press = undefined;
    };

    const handlePointerUp = (e: PointerEvent) => {
      const start = press;
      press = undefined;
      if (!start || e.pointerId !== start.id || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 5) return;
      const mesh = cloud.pickMesh;
      if (!mesh) return;
      updatePointer(e.clientX, e.clientY);
      raycaster.setFromCamera(pointer, view.camera);
      const index = raycaster.intersectObject(mesh)[0]?.instanceId;
      const point = index === undefined ? undefined : pointsRef.current[index];
      if (point) onSelectPointRef.current?.(point);
      else if (e.pointerType === 'mouse' && Math.abs(pointer.x) <= 1 && Math.abs(pointer.y) <= 1) {
        view.setPointer(pointer.x, -pointer.y);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 5) press = undefined;
      if (e.pointerType !== 'mouse' || interactingRef.current || e.buttons) return;
      updatePointer(e.clientX, e.clientY);
      view.setPointer(pointer.x, -pointer.y);
      if (e.timeStamp - lastHoverCheck < 40) return;
      lastHoverCheck = e.timeStamp;
      const mesh = cloud.pickMesh;
      if (!mesh) return;
      raycaster.setFromCamera(pointer, view.camera);
      dom.style.cursor = raycaster.intersectObject(mesh)[0]?.instanceId !== undefined ? 'pointer' : 'grab';
    };
    const handlePointerLeave = () => {
      view.setPointer(0, 0);
      if (!interactingRef.current) dom.style.cursor = 'grab';
    };
    const handlePointerCancel = () => {
      press = undefined;
      handlePointerLeave();
    };

    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerleave', handlePointerLeave);
    dom.addEventListener('pointercancel', handlePointerCancel);

    // Keyboard Navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (modal && !modal.contains(container))
        || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (e.key === 'r' || e.key === 'R') {
        handleResetCamera();
      } else if (e.key === 'f' || e.key === 'F') {
        fitRef.current();
      } else if (e.key === '+' || e.key === '=') {
        handleZoom('in');
      } else if (e.key === '-' || e.key === '_') {
        handleZoom('out');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Animation Loop
    let animId: number;
    let previousFrame = performance.now();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now(), delta = Math.min(.05, (now - previousFrame) / 1000);
      previousFrame = now;
      if (!activeRef.current) return;
      controls.autoRotate = autoRotateRef.current && !selectedPointRef.current && !interactingRef.current && !cloud.transitioning;
      controls.update(delta);
      const wasTransitioning = cloud.transitioning;
      cloud.tick(reducedMotion.matches ? Infinity : now);
      if (wasTransitioning && !cloud.transitioning) return;
      view.update(delta, reducedMotion.matches, interactingRef.current || cloud.transitioning || Boolean(selectedPointRef.current));
      outlierGroup.visible = !cloud.transitioning && isSpotlightActiveRef.current;
      centroidGroup.visible = biplotGroup.visible = !cloud.transitioning;
      if (gmmGroupRef.current) gmmGroupRef.current.visible = !cloud.transitioning;
      if (outlierGroup.visible) {
        for (const ring of outlierGroup.children) ring.quaternion.copy(view.camera.quaternion);
      }

      grid.position.x = view.camera.position.x;
      grid.position.z = view.camera.position.z;
      renderer.render(scene, view.camera);
    };
    animate();
    setSceneReady(true);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      setSceneReady(false);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      controls.removeEventListener('start', beginInteraction);
      controls.removeEventListener('end', endInteraction);
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerleave', handlePointerLeave);
      dom.removeEventListener('pointercancel', handlePointerCancel);
      cancelAnimationFrame(animId);
      if (axesGroupRef.current) {
        disposePlotMarkers(axesGroupRef.current);
        scene.remove(axesGroupRef.current);
        axesGroupRef.current = null;
      }
      if (outlierGroupRef.current) {
        scene.remove(outlierGroupRef.current);
        outlierGroupRef.current = null;
      }
      if (container.contains(dom)) {
        container.removeChild(dom);
      }
      cloud.destroy();
      cloudRef.current = null;
      disposePlotMarkers(outlierGroup);
      disposePlotMarkers(centroidGroup);
      disposePlotMarkers(biplotGroup);
      controls.dispose();
      gridRef.current = null;
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(theme === 'light' ? '#f7f8f6' : '#101815');
    gridRef.current?.material.uniforms.gridColor.value.set(theme === 'light' ? '#8296ad' : '#678575');
    for (const group of [axesGroupRef.current, biplotGroupRef.current]) group?.traverse(object => {
      if (!(object instanceof THREE.Sprite) || typeof object.userData.label !== 'string') return;
      const texture = (object.material as THREE.SpriteMaterial).map;
      if (!texture || !(texture.image instanceof HTMLCanvasElement)) return;
      paintTextLabel(texture.image, object.userData.label, object.userData.stroke, theme);
      texture.needsUpdate = true;
    });
  }, [theme, sceneReady]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const axes = axesGroupRef.current;
    if (!grid || !axes) return;
    grid.visible = true;
    grid.position.y = groundY;
    axes.position.y = groundY;
  }, [groundY, sceneReady]);

  useLayoutEffect(() => {
    cloudRef.current?.sync(normalizedPoints, colors, pointScale, selectedPoint);
  }, [sceneReady, normalizedPoints, colors, pointScale, selectedPoint]);

  useLayoutEffect(() => {
    if (!transitionRef || !sceneReady) return;
    transitionRef.current = async (points, mode, feature, sameDataset, signal) => {
      if (!activeRef.current || signal.aborted || document.hidden
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const cloud = cloudRef.current;
      if (!cloud) return;
      const targetColors = makePlotColors(points, mode, feature, theme === 'dark');
      const nextPlot = normalizePlotPoints(points);
      const grid = gridRef.current, axes = axesGroupRef.current;
      const startY = grid?.position.y ?? nextPlot.groundY;
      await cloud.stage(nextPlot.points, points.map(targetColors.forPoint), sameDataset, signal, () => selectedPointRef.current, eased => {
        const y = THREE.MathUtils.lerp(startY, nextPlot.groundY, eased);
        if (grid) grid.position.y = y;
        if (axes) axes.position.y = y;
      });
    };
    return () => { transitionRef.current = null; };
  }, [sceneReady, theme, transitionRef]);

  useEffect(() => {
    if (!active) cloudRef.current?.cancel();
  }, [active]);

  useLayoutEffect(() => {
    const outliers = outlierGroupRef.current;
    const centroids = centroidGroupRef.current;
    if (!sceneReady || !outliers || !centroids) return;
    disposePlotMarkers(outliers);
    disposePlotMarkers(centroids);
    const clusterSums = new Map<number, { sum: THREE.Vector3; count: number }>();
    for (const point of normalizedPoints) {
      if (point.isOutlier || point.cluster === -1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.6 * pointScale, 2.3 * pointScale, 16),
          new THREE.MeshBasicMaterial({ color: '#bd6269', side: THREE.DoubleSide,
            transparent: true, opacity: .52, depthWrite: false, toneMapped: false }),
        );
        ring.position.set(point.x, point.y, point.z);
        outliers.add(ring);
      }
      if (!centroidsVisible || !hasClustering || !Number.isInteger(point.cluster) || point.cluster < 0) continue;
      let group = clusterSums.get(point.cluster);
      if (!group) { group = { sum: new THREE.Vector3(), count: 0 }; clusterSums.set(point.cluster, group); }
      group.sum.x += point.x; group.sum.y += point.y; group.sum.z += point.z;
      group.count++;
    }
    for (const [cluster, { sum, count }] of clusterSums) {
      const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8),
        new THREE.MeshBasicMaterial({ color: plotColors.clusters[cluster % plotColors.clusters.length],
          wireframe: true, transparent: true, opacity: .75, toneMapped: false }));
      core.position.copy(sum.divideScalar(count));
      centroids.add(core);
    }
  }, [sceneReady, normalizedPoints, pointScale, centroidsVisible, hasClustering, plotColors.clusters]);

  // Gaussian surfaces use the same transform as the point cloud.
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const { center, scale } = plot;
    if (!scene || !sceneReady || !gmm || !center) return;
    const group = new THREE.Group();
    gmm.means.forEach((mean, c) => {
      const geometry = new THREE.SphereGeometry(1, 24, 16);
      const material = new THREE.MeshBasicMaterial({ color: plotColors.clusters[c % plotColors.clusters.length], wireframe: true, transparent: true, opacity: 0.22, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...mean.map((v, j) => (v - center[j]) * scale) as [number, number, number]);
      mesh.scale.set(...gmm.variances[c].map(v => 2 * Math.sqrt(v) * scale) as [number, number, number]); group.add(mesh);
    });
    scene.add(group);
    gmmGroupRef.current = group;
    return () => {
      gmmGroupRef.current = null;
      scene.remove(group);
      disposePlotMarkers(group);
    };
  }, [gmm, plot, sceneReady, plotColors.clusters]);

  // 3. RENDER PCA FEATURE LOADINGS (BIPLOT)
  useLayoutEffect(() => {
    if (!biplotGroupRef.current || !sceneReady) return;

    disposePlotMarkers(biplotGroupRef.current);

    if (!biplotVisible || reductionMethod !== 'PCA' || !pcaComponents || !featureNames || pcaComponents.length < 3) {
      return;
    }

    const d = featureNames.length;
    const v1 = pcaComponents[0];
    const v2 = pcaComponents[1];
    const v3 = pcaComponents[2];
    if (!v1 || !v2 || !v3) return;

    const featureMagnitudes: { name: string; x: number; y: number; z: number; mag: number }[] = [];
    for (let j = 0; j < d; j++) {
      const x = v1[j] || 0;
      const y = v2[j] || 0;
      const z = v3[j] || 0;
      const mag = Math.hypot(x, y, z);
      featureMagnitudes.push({ name: featureNames[j], x, y, z, mag });
    }

    featureMagnitudes.sort((a, b) => b.mag - a.mag);
    const topFeatures = featureMagnitudes.slice(0, biplotTopK);
    const biplotScale = 30;

    topFeatures.forEach((feat) => {
      const dir = new THREE.Vector3(feat.x, feat.y, feat.z).normalize();
      const origin = new THREE.Vector3(0, 0, 0);

      const arrowHelper = new THREE.ArrowHelper(dir, origin, biplotScale, 0x8B9CFB, 3.0, 1.4);
      biplotGroupRef.current?.add(arrowHelper);

      const sprite = createTextLabelSprite(feat.name, '#8B9CFB', theme);
      sprite.position.copy(dir).multiplyScalar(biplotScale + 4);
      biplotGroupRef.current?.add(sprite);
    });
  }, [sceneReady, biplotVisible, reductionMethod, pcaComponents, featureNames, biplotTopK]);

  // 4. Render axis guides in local coordinates. The group follows the grid in Y.
  useLayoutEffect(() => {
    if (!axesGroupRef.current || !sceneReady) return;
    disposePlotMarkers(axesGroupRef.current);

    if (!showAxes) return;

    const origin = new THREE.Vector3(-36, 0, -36);
    const axisLength = 72;

    let labelX = tr('X axis');
    let labelY = tr('Y axis');
    let labelZ = tr('Z axis');

    if (reductionMethod === 'PCA') {
      labelX = 'PC1 (X)';
      labelY = 'PC2 (Y)';
      labelZ = 'PC3 (Z)';
    } else if (axisFeatures && axisFeatures.length >= 3) {
      labelX = 'X: ' + axisFeatures[0];
      labelY = 'Y: ' + axisFeatures[1];
      labelZ = 'Z: ' + axisFeatures[2];
    } else if (reductionMethod === 't-SNE' || reductionMethod === 'UMAP') {
      labelX = reductionMethod + ' 1';
      labelY = reductionMethod + ' 2';
      labelZ = reductionMethod + ' 3';
    }

    const createAxis = (dir: THREE.Vector3, color: number, label: string) => {
      const arrow = new THREE.ArrowHelper(dir, origin, axisLength, color, 5, 2.2);
      axesGroupRef.current?.add(arrow);

      const hexColor = '#' + color.toString(16).padStart(6, '0');
      const sprite = createTextLabelSprite(label, hexColor, theme);
      const tipPos = origin.clone().add(dir.clone().multiplyScalar(axisLength + 6));
      sprite.position.copy(tipPos);
      axesGroupRef.current?.add(sprite);
    };

    createAxis(new THREE.Vector3(1, 0, 0), 0xef4444, labelX);
    createAxis(new THREE.Vector3(0, 1, 0), 0x10b981, labelY);
    createAxis(new THREE.Vector3(0, 0, 1), 0x3b82f6, labelZ);
  }, [sceneReady, showAxes, reductionMethod, axisFeatures, theme, tr]);




  // Selection changes the highlight while preserving the current orbit and zoom.

  const handleResetCamera = () => {
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(65, 45, 80);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const handleFitToData = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || normalizedPoints.length === 0) return;
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const { x, y, z } of normalizedPoints) bounds.expandByPoint(point.set(x, y, z));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV() / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    const distance = (sphere.radius + pointScale * 2) / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.1;
    const direction = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(sphere.center);
    // A narrow viewport can require more distance than the default orbit limit.
    controls.maxDistance = Math.max(260, distance);
    camera.position.copy(sphere.center).addScaledVector(direction, Math.max(distance, controls.minDistance));
    controls.update();
  };

  const handleZoom = (inOut: 'in' | 'out') => {
    if (cameraRef.current && controlsRef.current) {
      const factor = inOut === 'in' ? 0.78 : 1.25;
      const target = controlsRef.current.target;
      cameraRef.current.position.sub(target).multiplyScalar(factor).add(target);
      controlsRef.current.update();
    }
  };

  const handleTakeSnapshot = useCallback(() => {
    if (!rendererRef.current) return;
    try {
      const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `dimension_lab_${reductionMethod.toLowerCase()}_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error: unknown) {
      setSnapshotError(`Could not capture PNG: ${getErrorMessage(error)}`);
      window.setTimeout(() => setSnapshotError(null), 5000);
    }
  }, [reductionMethod]);

  useEffect(() => {
    if (!sceneReady || !snapshotRef) return;
    snapshotRef.current = handleTakeSnapshot;
    return () => { snapshotRef.current = null; };
  }, [sceneReady, snapshotRef, handleTakeSnapshot]);

  fitRef.current = handleFitToData;

  const legendTitle = tr(selectedFeature === '__anomaly_score' ? 'Isolation Forest score' : selectedFeature === '__rule_match' ? 'Rule membership' : colorMode === 'cluster' ? 'Predicted clusters' : colorMode === 'feature' ? 'Feature scale' : 'Original labels');
  const toolbar = (
    <div className="view-toolbar view-toolbar--analysis" role="group" aria-label={tr("3D view controls")}>
      <button type="button" title={isAutoRotating && selectedPoint ? tr("Auto-rotate paused while inspecting a point") : tr("Auto-rotate")} aria-label={tr("Auto-rotate")} aria-pressed={isAutoRotating} onClick={() => setIsAutoRotating(value => !value)}><Orbit size={17} /><span>{tr("Auto-rotate")}</span></button>
      <button type="button" title={hasOutliers ? tr("Highlight marked outliers in the current view") : tr("No marked outliers in the current view")} aria-label={tr("Highlight outliers")} disabled={!hasOutliers} aria-pressed={hasOutliers && isSpotlightActive} onClick={handleToggleSpotlight}><ScanEye size={17} /><span>{tr("Highlight outliers")}</span></button>
      <button type="button" title={canShowCentroids ? tr("Show cluster centroids") : tr("Run clustering to show centroids")} aria-label={tr("Show centroids")} disabled={!canShowCentroids} aria-pressed={canShowCentroids && centroidsVisible} onClick={() => setCentroidsVisible(value => !value)}><Crosshair size={17} /><span>{tr("Show centroids")}</span></button>
      <details className="view-point-size" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation(); } }}>
        <summary aria-label={tr("Point size")} title={tr("Point size")}><CircleDot size={17} /><span>{tr("Point size")}</span></summary>
        <div className="view-point-size-panel"><label htmlFor={`${viewMenuName}-size`}>{tr("Point size")} <output>{pointScale.toFixed(1)}×</output></label><input id={`${viewMenuName}-size`} aria-label={tr("Point size scale")} type="range" min="0.3" max="2.9" step="0.1" value={pointScale} onChange={event => setPointScale(Number(event.target.value))} /></div>
      </details>
      {onToggleFullscreen && (
        <button type="button" data-fullscreen-toggle
          title={isFullscreen ? tr("Exit fullscreen (Esc)") : tr("Fullscreen")}
          aria-label={isFullscreen ? tr("Exit fullscreen") : tr("Fullscreen")} onClick={onToggleFullscreen}>
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          <span>{isFullscreen ? tr("Exit fullscreen") : tr("Fullscreen")}</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="relative w-full h-full flex flex-row overflow-hidden select-none bg-[var(--bg-main)] text-[var(--text-main)]">
      {/* 1. MAIN 3D CANVAS VIEWPORT (Takes maximal area) */}
      <div className="relative flex-1 h-full overflow-hidden">
        {/* Dedicated 3D Canvas Mount Point */}
        <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />

        {/* Error Notification */}
        {snapshotError && (
          <div role="alert" className="absolute right-4 top-4 z-30 px-3 py-1.5 rounded bg-[var(--danger-bg)] border border-[var(--danger-border)] text-xs text-[var(--danger-text)]">
            {tr(snapshotError)}
          </div>
        )}

        {/* Viewport Header Badge */}
        {showProjectionBadge && <div className="view-projection">
          <span aria-hidden="true">+</span>
          <span>
            {tr(titleBadge || `3D PROJECTION (${reductionMethod})`)}
          </span>
        </div>

        }
        {/* Axis Info overlay if Raw Data */}
        {isFullscreen && axisFeatures && axisFeatures.length > 0 && (
          <div className="view-axis-info">
            {axisFeatures.map((feat, idx) => (
              <span key={feat} className="px-2 py-0.5 rounded bg-[var(--bg-panel)]/90 border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                {tr("Axis")} {idx === 0 ? 'X' : idx === 1 ? 'Y' : 'Z'}: <strong className="text-[var(--text-main)]">{feat}</strong>
              </span>
            ))}
          </div>
        )}

        <details className="view-menu view-legend" name={viewMenuName}>
          <summary aria-label={`${tr('Color legend')}: ${legendTitle}`} title={legendTitle}><Palette size={16} /></summary>
          <div className="view-menu-panel view-legend-panel">
            <strong>{legendTitle}</strong>
            {colorMode === 'feature' ? (
              <div className="view-legend-items">
                <span>{selectedFeature === '__anomaly_score' ? tr("Higher score = easier isolation") : selectedFeature === '__rule_match' ? tr("Association rule") : selectedFeature || tr("No feature selected")}</span>
                {selectedFeature === '__rule_match' ? <div className="view-color-scale">
                  <i style={{ background: plotColors.rules[0], width: 9 }} /><span>{tr('Does not match')}</span>
                  <i style={{ background: plotColors.rules[1], width: 9 }} /><span>{tr('Matches')}</span>
                </div> : selectedFeature && <div className="view-color-scale"><span>{tr("Low")}</span>
                  <i style={{ background: `linear-gradient(90deg, ${plotColors.low}, ${plotColors.mid}, ${plotColors.high})` }} />
                  <span>{tr("High")}</span></div>}
              </div>
            ) : (
              <ul className="view-legend-items" aria-label={tr("Groups in the current view")}>
                {legendGroups.map(([group, count]) => {
                  const cluster = typeof group === 'number' ? group : null;
                  const name = cluster === null ? String(group) || tr('Unlabeled') : cluster === -1 ? tr('Noise') : tr('Cluster') + ' ' + cluster;
                  const swatch = cluster === null ? plotColors.byLabel.get(String(group)) ?? plotColors.missing : cluster === -1 ? plotColors.noise : plotColors.clusters[cluster % plotColors.clusters.length];
                  return <li key={group}><i style={{ background: swatch }} /><span>{name}</span><small>{count.toLocaleString(language)}</small></li>;
                })}
              </ul>
            )}
          </div>
        </details>

        {!isFullscreen && toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
      </div>
    </div>
  );
};

function disposePlotMarkers(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    } else if (child instanceof THREE.ArrowHelper) {
      for (const material of [child.line.material, child.cone.material].flat()) material.dispose();
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  }
}

function paintTextLabel(canvas: HTMLCanvasElement, text: string, strokeColor: string, theme: 'light' | 'dark') {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.fillStyle = theme === 'dark' ? 'rgba(24, 37, 30, 0.96)' : 'rgba(250, 250, 247, 0.94)';
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.stroke();

    ctx.fillStyle = theme === 'dark' ? '#e8ede4' : '#344438';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }
}

function createTextLabelSprite(text: string, strokeColor: string = '#8B9CFB', theme: 'light' | 'dark' = 'light'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  paintTextLabel(canvas, text, strokeColor, theme);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.userData.label = text; sprite.userData.stroke = strokeColor;
  sprite.scale.set(12, 3, 1);
  return sprite;
}
