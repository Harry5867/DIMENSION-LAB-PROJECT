import { useAppLanguage } from "./WelcomeLanguage";
import type { GMMResult } from '../algorithms/gmm';
import React, { useCallback, useEffect, useId, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DataPoint, ColorMode } from '../types';
import { getErrorMessage } from '../utils/typeGuards';
import { Orbit, ScanEye, Crosshair, CircleDot, Palette, Maximize, Minimize } from 'lucide-react';
import { createPlotGrid } from './plotGrid';

interface ThreeCanvasProps {
  gmm?: GMMResult;
  active?: boolean;
  viewKey?: string;
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

// Categorical palette for cluster coloring (independent from UI theme)
const CLUSTER_COLORS = [
  '#4E79A7', // Steel Blue
  '#F28E2B', // Orange
  '#E15759', // Coral Red
  '#76B7B2', // Teal
  '#59A14F', // Green
  '#EDC948', // Yellow
  '#B07AA1', // Purple
  '#FF9DA7', // Pink
  '#9C755F', // Brown
  '#BAB0AC', // Gray
];

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  gmm,
  active = true,
  dataPoints = [],
  viewKey = 'all',
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
  const [pointScale, setPointScale] = useState(0.7);
  const [centroidsVisible, setCentroidsVisible] = useState(showCentroids);
  const [biplotVisible, setBiplotVisible] = useState(showBiplot);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [internalSpotlight, setInternalSpotlight] = useState(true);
  const isSpotlightActive = showOutliersSpotlight !== undefined ? showOutliersSpotlight : internalSpotlight;
  const isSpotlightActiveRef = useRef(isSpotlightActive);
  isSpotlightActiveRef.current = isSpotlightActive;

  const pointScaleRef = useRef(pointScale);
  pointScaleRef.current = pointScale;

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

  // Track positions of points currently on screen
  const currentPositionsRef = useRef<{ x: number; y: number; z: number }[]>([]);

  // Morph animation state
  interface MorphAnim {
    active: boolean;
    startTime: number;
    duration: number;
    fromCoords: { x: number; y: number; z: number }[];
    toCoords: { x: number; y: number; z: number }[];
    outlierIndices: number[];
  }
  const morphAnimRef = useRef<MorphAnim | null>(null);


  // Dynamic ground-truth classification labels extracted from dataPoints
  const uniqueLabels = useMemo(() => {
    const set = new Set<string>();
    for (const p of dataPoints) {
      if (p.label !== undefined && p.label !== null && String(p.label).trim() !== '') {
        set.add(String(p.label).trim());
      }
    }
    return Array.from(set).sort();
  }, [dataPoints]);

  const labelColorMap = useMemo(() => {
    const map: Record<string, string> = Object.create(null);
    uniqueLabels.forEach((label, idx) => {
      if (label === 'M' || label === '1') map[label] = '#E15759';
      else if (label === 'B' || label === '0') map[label] = '#59A14F';
      else map[label] = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
    });
    return map;
  }, [uniqueLabels]);

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
  const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const centroidGroupRef = useRef<THREE.Group | null>(null);
  const biplotGroupRef = useRef<THREE.Group | null>(null);
  const axesGroupRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<ReturnType<typeof createPlotGrid> | null>(null);
  const outlierGroupRef = useRef<THREE.Group | null>(null);

  const showAxes = true;

  // Normalized points to fit cleanly in [-36, 36] coordinate box
  const { points: normalizedPoints, groundY } = useMemo(() => {
    if (dataPoints.length === 0) {
      return { points: [], groundY: -36 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const p of dataPoints) {
      const px = Number.isFinite(p.x) ? p.x : 0;
      const py = Number.isFinite(p.y) ? p.y : 0;
      const pz = Number.isFinite(p.z) ? p.z : 0;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    const maxRange = Math.max(rangeX, rangeY, rangeZ) || 1;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const midZ = (minZ + maxZ) / 2;

    const scale = 72 / maxRange;

    const points = dataPoints.map((p) => {
      const px = Number.isFinite(p.x) ? p.x : 0;
      const py = Number.isFinite(p.y) ? p.y : 0;
      const pz = Number.isFinite(p.z) ? p.z : 0;
      return {
        ...p,
        x: (px - midX) * scale,
        y: (py - midY) * scale,
        z: (pz - midZ) * scale,
      };
    });
    return {
      points,
      groundY: (minY - midY) * scale - 3,
    };
  }, [dataPoints]);

  const pointsRef = useRef(dataPoints);
  pointsRef.current = dataPoints;
  const normalizedPointsRef = useRef(normalizedPoints);
  normalizedPointsRef.current = normalizedPoints;

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
    const beginInteraction = () => { interactingRef.current = true; controls.autoRotate = false; };
    const endInteraction = () => { interactingRef.current = false; };
    controls.addEventListener('start', beginInteraction);
    controls.addEventListener('end', endInteraction);

    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controlsRef.current = controls;

    controls.addEventListener('start', () => {
      renderer.domElement.style.cursor = 'grabbing';
    });
    controls.addEventListener('end', () => {
      renderer.domElement.style.cursor = 'grab';
    });

    // Clean, Neutral Lighting (avoids tinting scientific clusters)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(60, 80, 60);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd1d5db, 0.7);
    fillLight.position.set(-60, -40, -60);
    scene.add(fillLight);

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
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist < 5) {
        updatePointer(e.clientX, e.clientY);
        const mesh = instancedMeshRef.current;
        if (!mesh) return;

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(mesh);

        if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
          const idx = intersects[0].instanceId;
          const pt = pointsRef.current[idx];
          if (pt) onSelectPointRef.current?.(pt);
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY);
      const mesh = instancedMeshRef.current;
      if (!mesh) return;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(mesh);

      renderer.domElement.style.cursor = intersects[0]?.instanceId !== undefined ? 'pointer' : 'grab';
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointermove', handlePointerMove);

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
      controls.autoRotate = autoRotateRef.current && !selectedPointRef.current && !interactingRef.current;
      controls.update(delta);
      // Bulletproof morphing particle transition animation
      if (morphAnimRef.current?.active && instancedMeshRef.current) {
        const { startTime, duration, fromCoords, toCoords } = morphAnimRef.current;
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - t, 3); // Cubic ease out

        const mesh = instancedMeshRef.current;
        const dummy = new THREE.Object3D();
        const curScale = pointScaleRef.current;
        const selPt = selectedPointRef.current;

        for (let i = 0; i < toCoords.length; i++) {
          const from = fromCoords[i] || toCoords[i];
          const to = toCoords[i];
          const curX = from.x + (to.x - from.x) * ease;
          const curY = from.y + (to.y - from.y) * ease;
          const curZ = from.z + (to.z - from.z) * ease;

          const isSelected = selPt && (selPt.rowIndex ?? selPt.id) === (normalizedPointsRef.current[i]?.rowIndex ?? normalizedPointsRef.current[i]?.id);
          const r = (isSelected ? 1.9 : 1.0) * curScale;

          dummy.position.set(curX, curY, curZ);
          dummy.scale.set(r, r, r);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;

        // Move the highlight rings together with their points.
        if (outlierGroupRef.current && outlierGroupRef.current.children.length === morphAnimRef.current.outlierIndices.length) {
          morphAnimRef.current.outlierIndices.forEach((ptIdx, ringIdx) => {
            const ring = outlierGroupRef.current?.children[ringIdx];
            if (ring) {
              const from = fromCoords[ptIdx] || toCoords[ptIdx];
              const to = toCoords[ptIdx];
              ring.position.set(
                from.x + (to.x - from.x) * ease,
                from.y + (to.y - from.y) * ease,
                from.z + (to.z - from.z) * ease
              );
            }
          });
        }

        if (t >= 1) {
          morphAnimRef.current.active = false;
        }
      }

      if (outlierGroupRef.current) {
        const active = isSpotlightActiveRef.current;
        outlierGroupRef.current.visible = active;
        if (active && outlierGroupRef.current.children.length > 0) {
          const time = performance.now() * 0.005;
          const scale = 1.0 + Math.sin(time) * 0.32;
          const opacity = 0.6 + Math.cos(time) * 0.35;
          for (const child of outlierGroupRef.current.children) {
            if (child instanceof THREE.Mesh) {
              child.scale.set(scale, scale, scale);
              child.quaternion.copy(camera.quaternion);
              if (child.material && 'opacity' in child.material) {
                child.material.opacity = opacity;
              }
            }
          }
        }
      }

      grid.position.x = camera.position.x;
      grid.position.z = camera.position.z;
      renderer.render(scene, camera);
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
      cancelAnimationFrame(animId);
      if (axesGroupRef.current) {
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
      controls.dispose();
      gridRef.current = null;
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(theme === 'light' ? '#ffffff' : '#101815');
    gridRef.current?.material.uniforms.gridColor.value.set(theme === 'light' ? '#8296ad' : '#678575');
    for (const group of [axesGroupRef.current, biplotGroupRef.current]) group?.traverse(object => {
      if (!(object instanceof THREE.Sprite) || typeof object.userData.label !== 'string') return;
      const texture = (object.material as THREE.SpriteMaterial).map;
      if (!texture || !(texture.image instanceof HTMLCanvasElement)) return;
      paintTextLabel(texture.image, object.userData.label, object.userData.stroke, theme);
      texture.needsUpdate = true;
    });
  }, [theme, sceneReady]);

  useEffect(() => {
    const grid = gridRef.current;
    const axes = axesGroupRef.current;
    if (!grid || !axes) return;
    grid.visible = true;
    grid.position.y = groundY;
    axes.position.y = groundY;
  }, [groundY, sceneReady]);

  // Auto-rotate toggle
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotating && !selectedPoint && !interactingRef.current;
    }
  }, [isAutoRotating, selectedPoint]);

  // 2. UPDATE INSTANCED MESH DATA POINTS & CENTROIDS
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;

    if (instancedMeshRef.current) {
      scene.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      (instancedMeshRef.current.material as THREE.Material).dispose();
      instancedMeshRef.current = null;
    }

    if (outlierGroupRef.current) {
      while (outlierGroupRef.current.children.length > 0) {
        const obj = outlierGroupRef.current.children[0];
        outlierGroupRef.current.remove(obj);
        if (obj instanceof THREE.Mesh && obj.geometry) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      }
    }

    if (centroidGroupRef.current) {
      while (centroidGroupRef.current.children.length > 0) {
        const obj = centroidGroupRef.current.children[0];
        centroidGroupRef.current.remove(obj);
      }
    }

    const count = normalizedPoints.length;
    if (count === 0) return;

    const toCoords = normalizedPoints.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const fromCoords = currentPositionsRef.current;
    const outlierIndices: number[] = [];

    // Trigger smooth particle morphing transition if previous coordinates exist
    const shouldMorph = fromCoords.length === count && fromCoords.length > 0;
    if (shouldMorph) {
      morphAnimRef.current = {
        active: true,
        startTime: performance.now(),
        duration: 1100,
        fromCoords: [...fromCoords],
        toCoords: [...toCoords],
        outlierIndices,
      };
    } else {
      morphAnimRef.current = null;
    }
    // Update current positions tracker
    currentPositionsRef.current = toCoords;

    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.35,
    });

    const mesh = new THREE.InstancedMesh(sphereGeo, sphereMat, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    let fMin = Infinity, fMax = -Infinity;
    if (colorMode === 'feature' && selectedFeature) {
      for (const p of dataPoints) {
        const val = p.originalFeatures[selectedFeature];
        if (typeof val === 'number') {
          if (val < fMin) fMin = val;
          if (val > fMax) fMax = val;
        }
      }
    }
    const fRange = fMax - fMin || 1;

    for (let i = 0; i < count; i++) {
      const pt = normalizedPoints[i];
      const isSelected = selectedPoint && (selectedPoint.rowIndex ?? selectedPoint.id) === (pt.rowIndex ?? pt.id);
      const r = (isSelected ? 1.9 : 1.0) * pointScale;

      const startPos = shouldMorph ? fromCoords[i] : toCoords[i];
      dummy.position.set(startPos.x, startPos.y, startPos.z);
      dummy.scale.set(r, r, r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (isSelected) {
        color.set('#FFFFFF');
      } else if (selectedFeature === '__rule_match' && colorMode === 'feature') {
        color.set(pt.analysisMatch ? '#f97316' : '#475569');
      } else if (isSpotlightActive && (pt.isOutlier || pt.cluster === -1)) {
        color.set('#F43F5E'); // Outlier spotlight warning red (sáng rực rỡ như lúc đầu)
      } else if (colorMode === 'ground-truth') {
        const hex = labelColorMap[String(pt.label ?? '').trim()] || '#929EAF';
        color.set(hex);
      } else if (colorMode === 'cluster') {
        if (pt.cluster === -1) {
          color.set('#64748B'); // Noise
        } else {
          const hex = CLUSTER_COLORS[pt.cluster % CLUSTER_COLORS.length] || '#4E79A7';
          color.set(hex);
        }
      } else if (colorMode === 'feature' && selectedFeature) {
        const val = pt.originalFeatures[selectedFeature] || 0;
        const norm = Math.max(0, Math.min(1, (val - fMin) / fRange));
        color.setHSL(0.66 - norm * 0.66, 0.85, 0.55);
      } else {
        color.set('#8B9CFB');
      }

      mesh.setColorAt(i, color);

      // Highlight ring for an outlier or noise point.
      if (pt.isOutlier || pt.cluster === -1) {
        outlierIndices.push(i);
        const ringGeo = new THREE.RingGeometry(1.6 * pointScale, 2.5 * pointScale, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(startPos.x, startPos.y, startPos.z);
        outlierGroupRef.current?.add(ringMesh);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    scene.add(mesh);
    instancedMeshRef.current = mesh;


    // Centroids visualization
    if (centroidsVisible && hasClustering) {
      const clusterSums: Record<number, { x: number; y: number; z: number; count: number }> = {};
      for (const p of normalizedPoints) {
        if (!Number.isInteger(p.cluster) || p.cluster < 0) continue;
        if (!clusterSums[p.cluster]) {
          clusterSums[p.cluster] = { x: 0, y: 0, z: 0, count: 0 };
        }
        clusterSums[p.cluster].x += p.x;
        clusterSums[p.cluster].y += p.y;
        clusterSums[p.cluster].z += p.z;
        clusterSums[p.cluster].count += 1;
      }

      Object.entries(clusterSums).forEach(([clStr, sum]) => {
        const cId = parseInt(clStr, 10);
        const cx = sum.x / sum.count;
        const cy = sum.y / sum.count;
        const cz = sum.z / sum.count;
        const cColor = CLUSTER_COLORS[cId % CLUSTER_COLORS.length] || '#8B9CFB';

        const coreGeo = new THREE.SphereGeometry(2.0, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(cColor),
          wireframe: true,
          transparent: true,
          opacity: 0.8,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.set(cx, cy, cz);

        centroidGroupRef.current?.add(coreMesh);
      });
    }
  }, [sceneReady, normalizedPoints, colorMode, selectedFeature, selectedPoint, pointScale, centroidsVisible, dataPoints, labelColorMap, isSpotlightActive, hasClustering]);

  // Gaussian surfaces use the same transform as the point cloud.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady || !gmm || !dataPoints.length) return;
    const group = new THREE.Group();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    dataPoints.forEach(p => [p.x, p.y, p.z].forEach((v, j) => { min[j] = Math.min(min[j], v); max[j] = Math.max(max[j], v); }));
    const scale = 72 / Math.max(...min.map((v, j) => max[j] - v || 1));
    gmm.means.forEach((mean, c) => {
      const geometry = new THREE.SphereGeometry(1, 24, 16);
      const material = new THREE.MeshBasicMaterial({ color: CLUSTER_COLORS[c % CLUSTER_COLORS.length], wireframe: true, transparent: true, opacity: 0.22, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...mean.map((v, j) => (v - (min[j] + max[j]) / 2) * scale) as [number, number, number]);
      mesh.scale.set(...gmm.variances[c].map(v => 2 * Math.sqrt(v) * scale) as [number, number, number]); group.add(mesh);
    });
    scene.add(group);
    return () => { scene.remove(group); group.children.forEach(child => { const mesh = child as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; mesh.geometry.dispose(); mesh.material.dispose(); }); };
  }, [gmm, dataPoints, sceneReady]);

  // 3. RENDER PCA FEATURE LOADINGS (BIPLOT)
  useEffect(() => {
    if (!biplotGroupRef.current || !sceneReady) return;

    while (biplotGroupRef.current.children.length > 0) {
      const obj = biplotGroupRef.current.children[0];
      biplotGroupRef.current.remove(obj);
    }

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
  useEffect(() => {
    if (!axesGroupRef.current || !sceneReady) return;

    while (axesGroupRef.current.children.length > 0) {
      const obj = axesGroupRef.current.children[0];
      axesGroupRef.current.remove(obj);
      if (obj instanceof THREE.Mesh && obj.geometry) {
        obj.geometry.dispose();
      }
    }

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




  useEffect(() => {
    setIsAutoRotating(false);
    if (cameraRef.current && controlsRef.current) {
      controlsRef.current.maxDistance = 260;
      cameraRef.current.position.set(65, 45, 80);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [viewKey]);

  // 5. SMOOTH CAMERA FLY-TO FOCUS ON SELECTED POINT
  useEffect(() => {
    if (!selectedPoint || !controlsRef.current || !cameraRef.current) return;
    const pt = normalizedPoints.find((p) => (p.rowIndex ?? p.id) === (selectedPoint.rowIndex ?? selectedPoint.id));
    if (!pt) return;

    const targetPos = new THREE.Vector3(pt.x, pt.y, pt.z);
    let frame = 0;
    const totalFrames = 25;
    const startTarget = controlsRef.current.target.clone();

    const flyTo = () => {
      frame++;
      const progress = Math.min(1, frame / totalFrames);
      const ease = 1 - Math.pow(1 - progress, 3);
      controlsRef.current?.target.lerpVectors(startTarget, targetPos, ease);
      controlsRef.current?.update();

      if (frame < totalFrames) {
        requestAnimationFrame(flyTo);
      }
    };
    flyTo();
  }, [selectedPoint, normalizedPoints]);

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
        <div className="view-point-size-panel"><label htmlFor={`${viewMenuName}-size`}>{tr("Point size")} <output>{pointScale.toFixed(1)}×</output></label><input id={`${viewMenuName}-size`} aria-label={tr("Point size scale")} type="range" min="0.3" max="2.9" step="0.2" value={pointScale} onChange={event => setPointScale(Number(event.target.value))} /></div>
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
                <span>{selectedFeature === '__anomaly_score' ? tr("Higher score = easier isolation") : selectedFeature === '__rule_match' ? tr("Blue: not matched · Red: matched") : selectedFeature || tr("No feature selected")}</span>
                {selectedFeature && <div className="view-color-scale"><span>{tr("Low")}</span><i /><span>{tr("High")}</span></div>}
              </div>
            ) : (
              <ul className="view-legend-items" aria-label={tr("Groups in the current view")}>
                {legendGroups.map(([group, count]) => {
                  const cluster = typeof group === 'number' ? group : null;
                  const name = cluster === null ? String(group) || tr('Unlabeled') : cluster === -1 ? tr('Noise') : tr('Cluster') + ' ' + cluster;
                  const swatch = cluster === null ? labelColorMap[String(group)] ?? '#929EAF' : cluster === -1 ? '#64748B' : CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
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
