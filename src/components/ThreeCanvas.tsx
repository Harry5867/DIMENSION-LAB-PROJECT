import React, { useCallback, useEffect, useId, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DataPoint, ColorMode } from '../types';
import { getErrorMessage } from '../utils/typeGuards';
import { RotateCcw, Orbit, MousePointer2, Minus, Plus, Sliders, Palette, Maximize, Minimize, Focus } from 'lucide-react';
import { createPlotGrid } from './plotGrid';

type GridMode = 'ground' | 'zero' | 'off';

interface ThreeCanvasProps {
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
  onCameraChange?: (camPos: THREE.Vector3, targetPos: THREE.Vector3) => void;
  syncCameraPos?: THREE.Vector3 | null;
  syncTargetPos?: THREE.Vector3 | null;
  titleBadge?: string;
  showProjectionBadge?: boolean;
  axisFeatures?: string[];
  showCentroids?: boolean;
  pcaComponents?: number[][];
  featureNames?: string[];
  showBiplot?: boolean;
  biplotTopK?: number;
  biplotScale?: number;
  onToggleBiplot?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  showOutliersSpotlight?: boolean;
  onToggleOutliersSpotlight?: () => void;
  isComputing?: boolean;
  isFullscreen?: boolean;
  toolbarHost?: HTMLDivElement | null;
  toolbarLabel?: string;
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
  onCameraChange,
  syncCameraPos,
  syncTargetPos,
  titleBadge,
  showProjectionBadge = true,
  axisFeatures,
  showCentroids = false,
  pcaComponents,
  featureNames,
  showBiplot = false,
  biplotTopK = 6,
  biplotScale = 30,
  onToggleBiplot,
  showOutliersSpotlight,
  onToggleOutliersSpotlight,
  isComputing = false,
  isFullscreen = false,
  toolbarHost,
  toolbarLabel = '3D view controls',
  onToggleFullscreen,
  theme = 'light',
}) => {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [viewMode, setViewMode] = useState<'rotate' | 'select'>('rotate');
  const [gridMode, setGridMode] = useState<GridMode>('ground');
  const gridNoteId = useId();
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
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
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
  const isComputingRef = useRef(isComputing);
  isComputingRef.current = isComputing;
  const scanGroupRef = useRef<THREE.Group | null>(null);

  interface ScanSequence {
    active: boolean;
    startTime: number;
    duration: number;
    startAngle: number;
    radius: number;
    initialY: number;
  }
  const scanSequenceRef = useRef<ScanSequence | null>(null);

  const showAxes = true;

  // Normalized points to fit cleanly in [-36, 36] coordinate box
  const { points: normalizedPoints, groundY, zeroY, pointsRelativeToZero } = useMemo(() => {
    if (dataPoints.length === 0) {
      return { points: [], groundY: -36, zeroY: 0, pointsRelativeToZero: null };
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
      zeroY: -midY * scale,
      pointsRelativeToZero: minY > 0 ? 'above' : maxY < 0 ? 'below' : null,
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
    scene.background = new THREE.Color(getComputedStyle(container).getPropertyValue('--plot-bg').trim() || '#f7f8fa');
    sceneRef.current = scene;

    // Centroid Group
    const centroidGroup = new THREE.Group();
    scene.add(centroidGroup);
    centroidGroupRef.current = centroidGroup;

    // Biplot Feature Vectors Group
    const biplotGroup = new THREE.Group();
    scene.add(biplotGroup);
    biplotGroupRef.current = biplotGroup;

    // 3D Grid / Laser Scanning Plane for AI Computation Simulation
    const scanGroup = new THREE.Group();
    scanGroup.visible = false;

    // A. Horizontal Wireframe Grid Plane (74x74 matching bounding box)
    const gridGeo = new THREE.PlaneGeometry(74, 74, 14, 14);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = Math.PI / 2;
    scanGroup.add(gridMesh);

    // B. Semi-transparent Glowing Laser Energy Sheet
    const sheetGeo = new THREE.PlaneGeometry(74, 74);
    const sheetMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const sheetMesh = new THREE.Mesh(sheetGeo, sheetMat);
    sheetMesh.rotation.x = Math.PI / 2;
    scanGroup.add(sheetMesh);

    // C. Bright Glowing Cyan Leading Edge Border
    const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(74, 74));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      linewidth: 2,
    });
    const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLine.rotation.x = Math.PI / 2;
    scanGroup.add(edgeLine);

    // D. Bright Center Scanning Beam Line
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-37, 0, 0),
      new THREE.Vector3(37, 0, 0),
    ]);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const beamLine = new THREE.Line(beamGeo, beamMat);
    scanGroup.add(beamLine);

    scene.add(scanGroup);
    scanGroupRef.current = scanGroup;


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

    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controlsRef.current = controls;

    controls.addEventListener('change', () => {
      onCameraChangeRef.current?.(camera.position, controls.target);
    });

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

      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const idx = intersects[0].instanceId;
        const pt = pointsRef.current[idx];
        setHoveredPoint(pt || null);
        setTooltipPos({ x: e.clientX, y: e.clientY });
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredPoint(null);
        setTooltipPos(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const handlePointerLeave = () => {
      setHoveredPoint(null);
      setTooltipPos(null);
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerleave', handlePointerLeave);

    // Keyboard Navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (modal && !modal.contains(container))
        || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (e.key === 'r' || e.key === 'R') {
        handleResetCamera();
      } else if (e.key === '+' || e.key === '=') {
        handleZoom('in');
      } else if (e.key === '-' || e.key === '_') {
        handleZoom('out');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!activeRef.current) return;
      controls.update();
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

        // Also morph the radar rings together with their outlier points!
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

      // Pulsing radar animation for outlier beacons (only active when spotlight is ON)
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


      // 360° Cinematic Orbit + Coordinated Laser Sweep during Computation
      if (scanSequenceRef.current?.active && cameraRef.current && controlsRef.current) {
        const { startTime, duration, startAngle, radius, initialY } = scanSequenceRef.current;
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        // Smooth sine ease in-out for natural camera movement
        const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

        // 1. Orbit camera 360 degrees around the center target
        const target = controlsRef.current.target;
        const currentAngle = startAngle + ease * Math.PI * 2;
        camera.position.x = target.x + radius * Math.cos(currentAngle);
        camera.position.z = target.z + radius * Math.sin(currentAngle);
        camera.position.y = initialY;
        camera.lookAt(target);
        controls.update();

        // 2. Coordinated Laser Grid Sweep from bottom (-36) to top (+36)
        if (scanGroupRef.current) {
          scanGroupRef.current.visible = true;
          // Smooth sine sweep: starts at -36, sweeps to +36, then back down
          const scanY = -36 + (Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * 72;
          scanGroupRef.current.position.y = Math.max(-36, Math.min(36, scanY));

          // Energy pulse
          const pulse = 0.7 + Math.sin(t * Math.PI * 8) * 0.3;
          scanGroupRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material && 'opacity' in child.material) {
              child.material.opacity = child.material.wireframe ? 0.35 * pulse : 0.1 * pulse;
            }
          });
        }

        if (t >= 1) {
          scanSequenceRef.current.active = false;
          if (scanGroupRef.current) scanGroupRef.current.visible = false;
        }
      } else if (scanGroupRef.current && !isComputingRef.current) {
        scanGroupRef.current.visible = false;
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
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerleave', handlePointerLeave);
      cancelAnimationFrame(animId);
      if (axesGroupRef.current) {
        scene.remove(axesGroupRef.current);
        axesGroupRef.current = null;
      }
      if (outlierGroupRef.current) {
        scene.remove(outlierGroupRef.current);
        outlierGroupRef.current = null;
      }
      if (scanGroupRef.current) {
        scene.remove(scanGroupRef.current);
        scanGroupRef.current = null;
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
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(theme === 'light' ? '#f7f8fa' : '#0d1117');
    gridRef.current?.material.uniforms.gridColor.value.set(theme === 'light' ? '#8296ad' : '#697e99');
  }, [theme, sceneReady]);

  useEffect(() => {
    const grid = gridRef.current;
    const axes = axesGroupRef.current;
    if (!grid || !axes) return;
    const planeY = gridMode === 'zero' ? zeroY : groundY;
    grid.visible = gridMode !== 'off';
    grid.position.y = planeY;
    axes.position.y = planeY;
  }, [gridMode, groundY, zeroY, sceneReady]);

  // Dual Viewport Sync
  useEffect(() => {
    if (syncCameraPos && syncTargetPos && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.copy(syncCameraPos);
      controlsRef.current.target.copy(syncTargetPos);
      controlsRef.current.update();
    }
  }, [syncCameraPos, syncTargetPos]);


  // Trigger 360° Camera Orbit & Laser Scan Sequence when isComputing is activated
  useEffect(() => {
    if (isComputing && cameraRef.current && controlsRef.current) {
      const cam = cameraRef.current;
      const target = controlsRef.current.target;
      const dx = cam.position.x - target.x;
      const dz = cam.position.z - target.z;
      const radius = Math.hypot(dx, dz) || 100;
      const startAngle = Math.atan2(dz, dx);

      scanSequenceRef.current = {
        active: true,
        startTime: performance.now(),
        duration: 2200, // 2.2s smooth cinematic scan
        startAngle,
        radius,
        initialY: cam.position.y,
      };
    } else {
      if (scanSequenceRef.current) scanSequenceRef.current.active = false;
      if (scanGroupRef.current) scanGroupRef.current.visible = false;
    }
  }, [isComputing]);

  // Auto-rotate toggle
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotating;
    }
  }, [isAutoRotating]);

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

      // Glowing radar ring beacon for Outlier / Noise points
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
    if (centroidsVisible && colorMode === 'cluster' && hasClustering) {
      const clusterSums: Record<number, { x: number; y: number; z: number; count: number }> = {};
      for (const p of normalizedPoints) {
        if (p.cluster === -1) continue;
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

    topFeatures.forEach((feat) => {
      const dir = new THREE.Vector3(feat.x, feat.y, feat.z).normalize();
      const origin = new THREE.Vector3(0, 0, 0);

      const arrowHelper = new THREE.ArrowHelper(dir, origin, biplotScale, 0x8B9CFB, 3.0, 1.4);
      biplotGroupRef.current?.add(arrowHelper);

      const sprite = createTextLabelSprite(feat.name, '#8B9CFB');
      sprite.position.copy(dir).multiplyScalar(biplotScale + 4);
      biplotGroupRef.current?.add(sprite);
    });
  }, [sceneReady, biplotVisible, reductionMethod, pcaComponents, featureNames, biplotTopK, biplotScale]);

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

    let labelX = 'X axis';
    let labelY = 'Y axis';
    let labelZ = 'Z axis';

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
      const sprite = createTextLabelSprite(label, hexColor);
      const tipPos = origin.clone().add(dir.clone().multiplyScalar(axisLength + 6));
      sprite.position.copy(tipPos);
      axesGroupRef.current?.add(sprite);
    };

    createAxis(new THREE.Vector3(1, 0, 0), 0xef4444, labelX);
    createAxis(new THREE.Vector3(0, 1, 0), 0x10b981, labelY);
    createAxis(new THREE.Vector3(0, 0, 1), 0x3b82f6, labelZ);
  }, [sceneReady, showAxes, reductionMethod, axisFeatures]);




  useEffect(() => {
    setHoveredPoint(null); setTooltipPos(null); setIsAutoRotating(false);
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

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enableRotate = viewMode === 'rotate';
    controls.enablePan = viewMode === 'rotate';
  }, [sceneReady, theme, viewMode]);

  const legendTitle = colorMode === 'cluster' ? 'Predicted clusters' : colorMode === 'feature' ? 'Feature scale' : 'Original labels';
  const toolbar = (
    <div className="view-toolbar" role="group" aria-label={toolbarLabel}>
      <div className="view-toolbar-modes" data-mode={viewMode}>
        <button type="button" title="Rotate view" aria-label="Rotate view" aria-pressed={viewMode === 'rotate'} onClick={() => setViewMode('rotate')}><Orbit size={17} /></button>
        <button type="button" title="Select point" aria-label="Select point" aria-pressed={viewMode === 'select'} onClick={() => { setViewMode('select'); setIsAutoRotating(false); }}><MousePointer2 size={16} /></button>
      </div>
      <span aria-hidden="true" className="view-toolbar-divider" />
      <button type="button" title="Zoom out (−)" aria-label="Zoom out" onClick={() => handleZoom('out')}><Minus size={17} /></button>
      <button type="button" title="Zoom in (+)" aria-label="Zoom in" onClick={() => handleZoom('in')}><Plus size={17} /></button>
      <button type="button" title="Fit to data" aria-label="Fit to data" onClick={handleFitToData}><Focus size={16} /></button>
      <button type="button" title="Reset view (R)" aria-label="Reset view" onClick={handleResetCamera}><RotateCcw size={16} /></button>
      {onToggleFullscreen && (
        <button type="button" data-fullscreen-toggle
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onToggleFullscreen}>
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
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
            {snapshotError}
          </div>
        )}

        {/* Viewport Header Badge */}
        {showProjectionBadge && <div className="view-projection">
          <span aria-hidden="true">+</span>
          <span>
            {titleBadge || `3D PROJECTION (${reductionMethod})`}
          </span>
        </div>

        }
        {/* Axis Info overlay if Raw Data */}
        {isFullscreen && axisFeatures && axisFeatures.length > 0 && (
          <div className="view-axis-info">
            {axisFeatures.map((feat, idx) => (
              <span key={feat} className="px-2 py-0.5 rounded bg-[var(--bg-panel)]/90 border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                Axis {idx === 0 ? 'X' : idx === 1 ? 'Y' : 'Z'}: <strong className="text-[var(--text-main)]">{feat}</strong>
              </span>
            ))}
          </div>
        )}

        <details className="view-menu view-legend" name={viewMenuName}>
          <summary aria-label={`Color legend: ${legendTitle}`} title={legendTitle}><Palette size={16} /></summary>
          <div className="view-menu-panel view-legend-panel">
            <strong>{legendTitle}</strong>
            {colorMode === 'feature' ? (
              <div className="view-legend-items">
                <span>{selectedFeature || 'No feature selected'}</span>
                {selectedFeature && <div className="view-color-scale"><span>Low</span><i /><span>High</span></div>}
              </div>
            ) : (
              <ul className="view-legend-items" aria-label="Groups in the current view">
                {legendGroups.map(([group, count]) => {
                  const cluster = typeof group === 'number' ? group : null;
                  const name = cluster === null ? String(group) || 'Unlabeled' : cluster === -1 ? 'Noise' : 'Cluster ' + cluster;
                  const swatch = cluster === null ? labelColorMap[String(group)] ?? '#929EAF' : cluster === -1 ? '#64748B' : CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
                  return <li key={group}><i style={{ background: swatch }} /><span>{name}</span><small>{count.toLocaleString('en-US')}</small></li>;
                })}
              </ul>
            )}
          </div>
        </details>

        {!isFullscreen && toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
          <details className="view-menu view-options" name={viewMenuName}>
            <summary aria-label="View options" title="View options"><Sliders size={16} /></summary>
            <div className="view-menu-panel view-options-panel">
              <label>Grid
                <select value={gridMode} onChange={event => setGridMode(event.target.value as GridMode)}
                  aria-describedby={gridMode === 'zero' ? gridNoteId : undefined}>
                  <option value="ground">Ground grid</option>
                  <option value="zero">XZ plane (Y = 0)</option>
                  <option value="off">Off</option>
                </select>
              </label>
              {gridMode === 'zero' && (
                <p id={gridNoteId} className="view-grid-note" role="status">
                  {pointsRelativeToZero ? `All points are ${pointsRelativeToZero} Y = 0.` : 'The grid is at Y = 0 of the plotted data.'}
                </p>
              )}
              <button type="button" aria-pressed={isAutoRotating} onClick={() => { setViewMode('rotate'); setIsAutoRotating(value => !value); }}>Auto-rotate</button>
              <button type="button" aria-pressed={isSpotlightActive} onClick={handleToggleSpotlight}>Highlight outliers</button>
              <button type="button" aria-pressed={centroidsVisible} onClick={() => setCentroidsVisible(value => !value)}>Show centroids</button>
              {reductionMethod === 'PCA' && <button type="button" aria-pressed={biplotVisible} onClick={() => onToggleBiplot ? onToggleBiplot() : setBiplotVisible(value => !value)}>PCA biplot</button>}
              <label>Point size <input type="range" min="0.3" max="2.9" step="0.2" value={pointScale} onChange={event => setPointScale(Number(event.target.value))} /></label>
              {!snapshotRef && <button type="button" onClick={handleTakeSnapshot}>Export PNG</button>}
            </div>
          </details>
      </div>
    </div>
  );
};

function createTextLabelSprite(text: string, strokeColor: string = '#8B9CFB'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(250, 250, 247, 0.94)';
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.stroke();

    ctx.fillStyle = '#344438';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(12, 3, 1);
  return sprite;
}
