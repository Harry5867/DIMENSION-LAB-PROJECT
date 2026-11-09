import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Search, X } from 'lucide-react';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import {
  atlasLayerNames, capitals, capitalPositions, capitalRole, createEarthRenderer, featuredCapitalIndices,
  hanoiIndex, type AtlasLayers, type Capital,
} from './globeScene';
import { borderSource, earthPosition } from './atlasLines';
import { loadTerrainData, sourceIndex, terrainDefaults, type TerrainData } from './terrainData';
import { TerrainControls } from './TerrainControls';
import { StoryControls } from './StoryControls';
import { StoryMarkers } from './StoryMarkers';
import { filterStories, groupStories, loadStories, projectStoryGroups, type StoryFilter, type StoryGroup, type StoryRecord } from './storyData';
import './data-globe.css';
import { localizedCountry, useWelcomeLanguage } from './WelcomeLanguage';
import { genesisEase, genesisFrame, genesisProjection, genesisScanEnd, type WelcomeGenesisRequest } from '../visuals/welcomeGenesis';
import { createAtlasIgnition } from '../visuals/atlasIgnition';

const home = { yaw: MathUtils.degToRad(-102), pitch: MathUtils.degToRad(20) };
const minZoom = .76;
const maxZoom = 1.85;
const globeModes = [
  { id: 'atlas', label: 'Atlas' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'stories', label: 'Stories' },
] as const;
export type GlobeMode = typeof globeModes[number]['id'];
const atlasDefaults: AtlasLayers = { particles: true, grid: true, borders: true, labels: true, flags: false };
const exhibitionBase: AtlasLayers = { ...atlasDefaults, borders: false, labels: false };
const ease = (current: number, target: number, speed: number, dt: number) => current + (target - current) * (1 - Math.exp(-speed * dt));
const featured = new Set(featuredCapitalIndices);
const regionalCapitals = featuredCapitalIndices.map(anchor => capitalPositions
  .map((position, index) => ({ index, distance: position.distanceToSquared(capitalPositions[anchor]) }))
  .filter(({ index }) => !featured.has(index) && !capitalRole(capitals[index]))
  .sort((a, b) => a.distance - b.distance)
  .slice(0, 14)
  .map(({ index }) => index));
const coordinatesOnGrid = [
  { text: '0°', position: earthPosition(0, 0) },
  { text: '30° N', position: earthPosition(30, 90) },
  { text: '30° S', position: earthPosition(-30, 90) },
  { text: '60° E', position: earthPosition(0, 60) },
  { text: '120° W', position: earthPosition(0, -120) },
];
type LabelRect = { x: number; y: number; width: number; height: number };
const overlaps = (a: LabelRect, b: LabelRect) =>
  a.x < b.x + b.width + 6 && a.x + a.width + 6 > b.x &&
  a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y;

function capitalKind(city: Capital, vietnamese = false) {
  switch (capitalRole(city)) {
    case 'alternate': return vietnamese ? 'BẢN GHI THỦ ĐÔ KHÁC' : 'ALTERNATE CAPITAL RECORD';
    case 'regional': return vietnamese ? 'THỦ PHỦ KHU VỰC' : 'REGIONAL CAPITAL';
    default: return vietnamese ? 'THỦ ĐÔ / QUỐC GIA' : 'CAPITAL / COUNTRY';
  }
}

function coordinates(city: Capital) {
  const lat = Math.abs(city.latitude).toFixed(4) + '° ' + (city.latitude < 0 ? 'S' : 'N');
  const lon = Math.abs(city.longitude).toFixed(4) + '° ' + (city.longitude < 0 ? 'W' : 'E');
  return lat + ' · ' + lon;
}

export function DataGlobe({ suspended = false, showDetails = true, motionEnabled, theme = 'light', modeControlsTarget, explorationControlsTarget, onModeChange, onExplore, genesis }: {
  theme?: 'light' | 'dark';
  modeControlsTarget?: HTMLElement | null;
  explorationControlsTarget: HTMLElement | null;
  onModeChange: (mode: GlobeMode) => void;
  motionEnabled?: boolean;
  suspended?: boolean;
  showDetails?: boolean;
  onExplore: () => void;
  genesis?: WelcomeGenesisRequest;
}) {
  const { language, t } = useWelcomeLanguage();
  const cityName = (city: Capital) => language === 'vi' && city.id === capitals[hanoiIndex].id ? 'Hà Nội' : city.city;
  const countryName = (city: Capital) => localizedCountry(city.iso || '', city.country, language);
  const viewport = useRef<HTMLDivElement>(null);
  const canvasMount = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<number, HTMLButtonElement>());
  const gridLabels = useRef<Array<HTMLSpanElement | null>>([]);
  const tooltip = useRef<HTMLDivElement>(null);
  const directory = useRef<HTMLDetailsElement>(null);
  const layersMenu = useRef<HTMLDetailsElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<GlobeMode>('atlas');
  const [terrainData, setTerrainData] = useState<TerrainData | null>(null);
  const [terrainError, setTerrainError] = useState(false);
  const [terrainSettings, setTerrainSettings] = useState(terrainDefaults);
  const [terrainHovered, setTerrainHovered] = useState<number | null>(null);
  const [terrainSelected, setTerrainSelected] = useState<number | null>(null);
  const terrainPointer = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [regionalAnchor, setRegionalAnchor] = useState<number | null>(null);
  const [stories, setStories] = useState<StoryRecord[] | null>(null);
  const [storyError, setStoryError] = useState(false);
  const [storyAttempt, setStoryAttempt] = useState(0);
  const [storyCategory, setStoryCategory] = useState<StoryFilter>('All');
  const [storySelected, setStorySelected] = useState<string | null>(null);
  const [storyHovered, setStoryHovered] = useState<string | null>(null);
  const [storyClusterFocused, setStoryClusterFocused] = useState(false);
  const [storiesDetailed, setStoriesDetailed] = useState(false);
  const [storiesCompact, setStoriesCompact] = useState(false);
  const storyNodes = useRef(new Map<string, HTMLButtonElement>());
  const storyCategoryControl = useRef<HTMLSelectElement>(null);
  const isStories = mode === 'stories';
  const filteredStories = useMemo(() => stories ? filterStories(stories, storyCategory) : [], [stories, storyCategory]);
  const selectedStory = isStories && showDetails ? filteredStories.find(story => story.id === storySelected) ?? null : null;
  const storyGroups = useMemo(() => groupStories(filteredStories, storiesDetailed, storiesCompact, selectedStory?.id ?? null), [filteredStories, storiesDetailed, storiesCompact, selectedStory?.id]);
  const storyInspecting = isStories && (storyHovered !== null || selectedStory !== null || storyClusterFocused);
  const [layers, setLayers] = useState(atlasDefaults);
  const isAtlas = mode === 'atlas';
  const [atlasMounted, setAtlasMounted] = useState(true);
  useEffect(() => {
    if (isAtlas) { setAtlasMounted(true); return; }
    const timer = window.setTimeout(() => setAtlasMounted(false), 550);
    return () => window.clearTimeout(timer);
  }, [isAtlas]);
  const terrain = useMemo(() => mode === 'terrain' && terrainData
    ? { data: terrainData, ...terrainSettings, highlight: terrainHovered ?? (terrainSelected === null ? null : sourceIndex(terrainData.grid, terrainData.points[terrainSelected].latitude, terrainData.points[terrainSelected].longitude)) }
    : null, [mode, terrainData, terrainSettings, terrainHovered, terrainSelected]);
  const terrainInspecting = mode === 'terrain' && (terrainHovered !== null || terrainSelected !== null);
  const active = isAtlas && showDetails ? selected : null;
  const markerIndices = useMemo(() => {
    const indices = new Set(featuredCapitalIndices);
    if (regionalAnchor !== null) regionalCapitals[regionalAnchor].forEach(index => indices.add(index));
    if (active !== null) indices.add(active);
    if (hovered !== null) indices.add(hovered);
    return [...indices];
  }, [active, hovered, regionalAnchor]);
  const state = useRef({ isAtlas, active, hovered, suspended, motionEnabled, theme, language, layers, markerIndices, terrain, terrainInspecting, terrainHovered, isStories, storyGroups, storyHovered, storySelected: selectedStory?.id ?? null, storyInspecting, storiesDetailed });
  state.current = { isAtlas, active, hovered, suspended, motionEnabled, theme, language, layers: isAtlas ? layers : exhibitionBase,
    markerIndices, terrain, terrainInspecting, terrainHovered, isStories, storyGroups, storyHovered, storySelected: selectedStory?.id ?? null, storyInspecting, storiesDetailed };
  const orbit = useRef({ ...home, velocityX: 0, velocityY: 0, zoom: 1, idle: 0 });
  const goal = useRef({ ...home, zoom: 1, focus: null as { yaw: number; pitch: number; elapsed: number } | null });
  const pointer = useRef({ x: 0, y: 0 });
  const constellationPointer = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const genesisRef = useRef(genesis);
  genesisRef.current = genesis;

  function selectMode(nextMode: GlobeMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    onModeChange(nextMode);
    setSelected(null);
    setHovered(null);
    setDirectoryOpen(false);
    setTerrainHovered(null);
    setStoryHovered(null);
    setStorySelected(null);
    setStoryClusterFocused(false);
    terrainPointer.current = null;
    opener.current = null;
  }

  useEffect(() => {
    if (!genesis) return;
    selectMode('atlas');
    setLayers(atlasDefaults);
    setSelected(null);
    setHovered(null);
    setQuery('');
    setDirectoryOpen(false);
    setRegionalAnchor(null);
    if (directory.current) directory.current.open = false;
    if (layersMenu.current) layersMenu.current.open = false;
  }, [genesis?.id]);

  function selectStory(id: string | null, trigger: HTMLElement) {
    if (!id) { closeStory(); return; }
    const story = filteredStories.find(item => item.id === id);
    if (!story) return;
    opener.current = trigger;
    setStorySelected(id);
    setStoryClusterFocused(false);
    setStoryHovered(null);
    onExplore();
    focusAt(MathUtils.degToRad(-story.longitude), MathUtils.degToRad(story.latitude), Math.max(1.12, goal.current.zoom));
  }

  function closeStory() {
    setStorySelected(null);
    setStoryHovered(null);
    setStoryClusterFocused(false);
    const trigger = opener.current;
    requestAnimationFrame(() => {
      const usable = trigger?.isConnected && !trigger.hidden && trigger.getClientRects().length;
      (usable ? trigger : storyCategoryControl.current)?.focus({ preventScroll: true });
    });
  }

  function openStoryGroup(group: StoryGroup, trigger: HTMLButtonElement) {
    if (group.members.length === 1) { selectStory(group.members[0].id, trigger); return; }
    onExplore();
    setStoryHovered(null);
    setStoriesDetailed(true);
    setStoryClusterFocused(true);
    focusAt(-Math.atan2(group.position.x, group.position.z), Math.asin(group.position.y), Math.max(1.45, goal.current.zoom));
    viewport.current?.focus({ preventScroll: true });
  }

  function changeStoryCategory(category: StoryFilter) {
    setStoryCategory(category);
    setStoryClusterFocused(false);
    setStoryHovered(null);
    if (storySelected && !filterStories(stories ?? [], category).some(story => story.id === storySelected)) setStorySelected(null);
  }

  function inspectTerrain(index: number | null) {
    setTerrainSelected(index);
    setTerrainHovered(null);
    terrainPointer.current = null;
    if (index === null || !terrainData) return;
    const point = terrainData.points[index];
    focusAt(MathUtils.degToRad(-point.longitude), MathUtils.degToRad(point.latitude), goal.current.zoom);
  }

  function focusAt(yaw: number, pitch: number, zoom: number) {
    const turn = Math.PI * 2;
    goal.current = {
      yaw: orbit.current.yaw + MathUtils.euclideanModulo(yaw - orbit.current.yaw + Math.PI, turn) - Math.PI,
      pitch, zoom, focus: { yaw: orbit.current.yaw, pitch: orbit.current.pitch, elapsed: 0 },
    };
    orbit.current.velocityX = 0;
    orbit.current.velocityY = 0;
    orbit.current.idle = 0;
  }

  function openCity(index: number, trigger: HTMLElement) {
    const city = capitals[index];
    opener.current = directory.current?.contains(trigger)
      ? directory.current.querySelector('summary')
      : trigger;
    if (directory.current) directory.current.open = false;
    onExplore();
    setHovered(null);
    setSelected(index);
    const zoom = index === hanoiIndex ? 1.25 : 1.12;
    focusAt(MathUtils.degToRad(-city.longitude), MathUtils.degToRad(city.latitude), Math.max(zoom, goal.current.zoom));
  }

  function closeCity() {
    setSelected(null);
    const previousControl = opener.current;
    const focusTarget = previousControl?.isConnected && !previousControl.hidden
      ? previousControl
      : directory.current?.querySelector('summary');
    focusTarget?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (active !== null) closeButton.current?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    if (showDetails) return;
    setSelected(null);
    setHovered(null);
    setStorySelected(null);
    setStoryHovered(null);
  }, [showDetails]);

  useEffect(() => {
    if (!isStories || stories) return;
    const controller = new AbortController();
    setStoryError(false);
    loadStories(controller.signal).then(records => {
      if (!controller.signal.aborted) setStories(records);
    }).catch(() => { if (!controller.signal.aborted) setStoryError(true); });
    return () => controller.abort();
  }, [isStories, stories, storyAttempt]);

  useEffect(() => {
    if (storyHovered && !storyGroups.some(group => group.key === storyHovered)) setStoryHovered(null);
  }, [storyGroups, storyHovered]);

  useEffect(() => {
    if (mode !== 'terrain' || terrainData) return;
    let current = true;
    setTerrainError(false);
    loadTerrainData().then(data => {
      if (current) setTerrainData(data);
    }).catch(() => {
      if (current) setTerrainError(true);
    });
    return () => { current = false; };
  }, [mode, terrainData]);

  useEffect(() => {
    const frame = viewport.current;
    const mount = canvasMount.current;
    if (!frame || !mount) return;
    let renderer = createEarthRenderer(mount);
    const glCanvas = renderer.kind === 'webgl' ? renderer.canvas : null;
    const surfaceStyle = mount.style;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, radius = 0, raf = 0, lastTime = 0;
    let centerX = 0, baseRadius = 0, markerLeft = 8, markerTop = 8, markerBottom = 0;
    let visible = true, needsDraw = true;
    let tiltX = 0, tiltY = 0;
    let lastHoverX = 2, lastHoverY = 2;
    let lastTheme = theme, lastLanguage = language;
    let frameBounds = frame.getBoundingClientRect();
    let lastYaw = NaN, lastPitch = NaN, lastRadius = NaN;
    let lastActive: number | null = null, lastHovered: number | null = null;
    let lastLayers: AtlasLayers | undefined, lastMarkers: number[] | undefined;
    let lastStoryGroups: StoryGroup[] | undefined, lastStoryMode = false, lastStoryHover: string | null = null, lastStorySelection: string | null = null;
    let lastTerrain: typeof terrain = null, retainedTerrain: typeof terrain = null, terrainBlend = 0, lastTerrainBlend = 0;
    let lastPickTime = -Infinity;
    let lastDraw = -Infinity, lastRegionCheck = -Infinity, nearestRegion: number | null = null;
    const orientation = new Quaternion();
    const angles = new Euler(0, 0, 0, 'XYZ');
    const projected = new Vector3();
    const labelRects: LabelRect[] = [];
    let introId = 0, introElapsed = 0;
    let lastIntroDraw = -Infinity;
    let introBounds: DOMRect | null = null;
    let ignition: ReturnType<typeof createAtlasIgnition> = null;

    function useCanvasFallback() {
      renderer.dispose();
      renderer = createEarthRenderer(mount!, true);
      if (width && height) renderer.resize(width, height, centerX);
      needsDraw = true;
    }

    function contextLost(event: Event) {
      event.preventDefault();
      if (renderer.kind !== 'webgl') return;
      useCanvasFallback();
      const request = genesisRef.current;
      if (request && renderer.failed()) request.onComplete(request.id);
    }
    glCanvas?.addEventListener('webglcontextlost', contextLost, { once: true });

    function positionLabel(label: HTMLElement, x: number, y: number, labelWidth: number, labelHeight: number, centered = false) {
      const offsets = centered ? [-labelWidth / 2] : [12, -12 - labelWidth];
      const top = y - labelHeight / 2;
      for (const offset of offsets) {
        const rect = { x: x + offset, y: top, width: labelWidth, height: labelHeight };
        if (rect.x < markerLeft || rect.x + labelWidth > width - 2 || top < markerTop || top + labelHeight > markerBottom ||
          labelRects.some(occupied => overlaps(occupied, rect))) continue;
        labelRects.push(rect);
        if (centered) label.style.transform = `translate3d(${rect.x.toFixed(1)}px,${top.toFixed(1)}px,0)`;
        else label.classList.toggle('label-left', offset < 0);
        if (label.hidden) label.hidden = false;
        return;
      }
      if (!label.hidden) label.hidden = true;
    }

    const sizeObserver = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      if (!width || !height) return;
      const desktopCenter = Number.parseFloat(getComputedStyle(frame).getPropertyValue('--globe-center'));
      const immersive = Number.isFinite(desktopCenter);
      const fitted = getComputedStyle(frame).getPropertyValue('--globe-fit').trim() === '1';
      centerX = width * (immersive ? desktopCenter : .5);
      baseRadius = fitted ? Math.min(width * .46, height * .43) : immersive ? Math.max(height * .56, width * .64) : Math.min(width, height) * .46;
      markerLeft = immersive && !fitted ? width * .13 : 8;
      markerTop = immersive && !fitted ? Math.min(106, Math.max(70, height * .1 + 6)) : 14;
      markerBottom = height - (immersive && !fitted ? 96 : 8);
      frameBounds = frame.getBoundingClientRect();
      renderer.resize(width, height, centerX);
      introBounds = null;
      setStoriesCompact(width < 520);
      needsDraw = true;
    });
    sizeObserver.observe(frame);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    visibilityObserver.observe(frame);
    const refreshBounds = () => { frameBounds = frame!.getBoundingClientRect(); introBounds = null; };
    const syncVisibility = () => {
      cancelAnimationFrame(raf);
      lastTime = 0;
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('resize', refreshBounds);
    document.addEventListener('visibilitychange', syncVisibility);
    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.current = { x: event.clientX / innerWidth * 2 - 1, y: event.clientY / innerHeight * 2 - 1 };
      const x = event.clientX - frameBounds.left, y = event.clientY - frameBounds.top;
      const overControl = event.target instanceof Element && !!event.target.closest('button, input, select, summary, .globe-city-panel');
      constellationPointer.current = !overControl && x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null;
    };
    const resetPointer = () => { pointer.current = { x: 0, y: 0 }; constellationPointer.current = null; };
    window.addEventListener('pointermove', trackPointer, { passive: true });
    window.addEventListener('blur', resetPointer);
    window.addEventListener('pointerout', eventLeave);
    function eventLeave(event: PointerEvent) { if (!event.relatedTarget) resetPointer(); }
    document.addEventListener('scroll', refreshBounds, { capture: true, passive: true });

    function handleWheel(event: WheelEvent) {
      if (genesisRef.current || event.ctrlKey || event.metaKey || !(event.target instanceof Element) ||
        event.target.closest('button, details, .globe-city-panel')) return;
      const rect = frame!.getBoundingClientRect();
      const x = event.clientX - rect.left - centerX;
      const y = event.clientY - rect.top - height / 2;
      if (Math.hypot(x, y) > radius) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      const next = MathUtils.clamp(goal.current.zoom - delta * .0012, minZoom, maxZoom);
      if (next === goal.current.zoom) return;
      event.preventDefault();
      goal.current.zoom = next;
    }
    frame.addEventListener('wheel', handleWheel, { passive: false });

    function tick(time: number) {
      raf = requestAnimationFrame(tick);
      const elapsedFrame = (time - (lastTime || time)) / 1000;
      const dt = Math.min(elapsedFrame, .04);
      lastTime = time;
      if (!genesisRef.current && introId) {
        introId = 0;
        ignition = null;
        introBounds = null;
        needsDraw = true;
      }
      if ((!visible && !genesisRef.current) || document.hidden || state.current.suspended || !width || !height) return;
      const current = orbit.current;
      const target = goal.current;
      const { isAtlas, active, hovered, layers, markerIndices, terrain, terrainInspecting, isStories, storyGroups, storyHovered, storySelected, storyInspecting, storiesDetailed, theme, language } = state.current;
      const request = genesisRef.current;
      let reveal: ReturnType<typeof genesisFrame> | undefined;
      const host = request?.host.current;
      if (host && request && isAtlas) {
        if (introId !== request.id) {
          introId = request.id;
          introElapsed = 0;
          lastIntroDraw = -Infinity;
          introBounds = null;
          ignition = createAtlasIgnition(host);
          drag.current = null;
          resetPointer();
          tiltX = tiltY = 0;
          Object.assign(current, home, { velocityX: 0, velocityY: 0, zoom: 1, idle: 0 });
          Object.assign(target, home, { zoom: 1, focus: null });
          terrainBlend = 0;
          retainedTerrain = null;
          request.onStarted(request.id);
        } else introElapsed += Math.min(elapsedFrame, .14);

        // The stream and the Atlas render from the same playhead. Keep the
        // live canvas, home orientation and projection throughout the intro.
        if (time - lastIntroDraw < renderer.frameInterval - 1) return;
        lastIntroDraw = time;
        reveal = genesisFrame(introElapsed);
        const page = host.parentElement?.style;
        if (host.dataset.phase !== reveal.phase) host.dataset.phase = reveal.phase;
        for (const key of ['silhouette', 'atmosphere', 'eyebrow', 'headline', 'description', 'action', 'navigation', 'controls', 'grid', 'disk'] as const) {
          page?.setProperty('--genesis-' + key, reveal[key].toFixed(4));
        }
        page?.setProperty('--genesis-pulse', reveal.hanoiPulse.toFixed(4));
        page?.setProperty('--genesis-pulse-alpha', (Math.sin(Math.PI * reveal.hanoiPulse) * .76).toFixed(4));
        if (!introBounds) {
          const box = host.getBoundingClientRect();
          if (box.width > 0 && box.height > 0) {
            introBounds = box;
            ignition?.resize(box.width, box.height, window.devicePixelRatio || 1);
          }
        }
        if (introBounds) ignition?.draw(reveal, genesisProjection(introBounds, frameBounds, centerX, baseRadius), theme === 'dark');
      } else if (request) {
        request.onComplete(request.id);
      }
      const reduced = state.current.motionEnabled === undefined ? motion.matches : !state.current.motionEnabled;
      const free = !drag.current && !target.focus;

      if (target.focus) {
        const focus = target.focus;
        focus.elapsed += dt;
        const progress = reduced ? 1 : Math.min(1, focus.elapsed / .8);
        const eased = progress * progress * (3 - 2 * progress);
        current.yaw = MathUtils.lerp(focus.yaw, target.yaw, eased);
        current.pitch = MathUtils.lerp(focus.pitch, target.pitch, eased);
        if (progress === 1) target.focus = null;
      } else if (free) {
        if (!reduced) {
          current.yaw += current.velocityX * dt;
          current.pitch = MathUtils.clamp(current.pitch + current.velocityY * dt, -1.55, 1.55);
        }
        current.velocityX *= Math.exp(-6 * dt);
        current.velocityY *= Math.exp(-6 * dt);
      }
      const idleSpeed = !request && free && !reduced && active === null && hovered === null && !terrainInspecting && !storyInspecting ? (isStories ? .025 : .082) : 0;
      current.idle = reduced ? 0 : ease(current.idle, idleSpeed, 3, dt);
      current.yaw += current.idle * dt;
      current.zoom = reduced ? target.zoom : ease(current.zoom, target.zoom, 11, dt);
      const follow = !request && !reduced && free && active === null && hovered === null && !terrainInspecting && !storyInspecting;
      const inspectingPointer = free && ((terrain && terrainPointer.current && terrainInspecting) || (isStories && storyHovered !== null));
      tiltX = reduced ? 0 : inspectingPointer ? tiltX : ease(tiltX, follow ? pointer.current.x * .13 : 0, 6, dt);
      tiltY = reduced ? 0 : inspectingPointer ? tiltY : ease(tiltY, follow ? pointer.current.y * .10 : 0, 6, dt);
      const yaw = current.yaw + tiltX;
      const pitch = current.pitch + tiltY;
      radius = baseRadius * current.zoom;
      const cursor = !request && isAtlas && layers.particles && !drag.current && !target.focus ? constellationPointer.current : null;
      const hoverPoint = cursor ? { x: (cursor.x - centerX) / radius, y: (height / 2 - cursor.y) / radius } : null;
      const hoverX = hoverPoint?.x ?? 2, hoverY = hoverPoint?.y ?? 2;
      const highlight = hovered ?? active;
      if (terrain) retainedTerrain = terrain;
      terrainBlend = reduced ? Number(!!terrain) : MathUtils.clamp(terrainBlend + (terrain ? 1 : -1) * dt / .55, 0, 1);
      if (terrainBlend === 0 && !terrain) retainedTerrain = null;
      orientation.setFromEuler(angles.set(pitch, yaw, 0));
      if (isStories) {
        if (!storiesDetailed && current.zoom >= 1.34) setStoriesDetailed(true);
        else if (storiesDetailed && current.zoom <= 1.20 && target.zoom <= 1.20) setStoriesDetailed(false);
      }
      if (terrain && time - lastPickTime >= 90) {
        lastPickTime = time;
        const position = terrainPointer.current;
        const nearest = position && !drag.current && !target.focus
          ? renderer.pickTerrain(terrain, terrainBlend, orientation, (position.x - centerX) / radius, (height / 2 - position.y) / radius)
          : null;
        if (nearest !== state.current.terrainHovered) {
          setTerrainHovered(nearest);
        }
      }
      if (!reveal && time - lastDraw < renderer.frameInterval) return;
      if (!reveal && !needsDraw && !renderer.needsRedraw() && theme === lastTheme && language === lastLanguage && hoverX === lastHoverX && hoverY === lastHoverY && layers === lastLayers && markerIndices === lastMarkers &&
        isStories === lastStoryMode && (!isStories || (storyGroups === lastStoryGroups && storyHovered === lastStoryHover && storySelected === lastStorySelection)) &&
        retainedTerrain === lastTerrain && terrainBlend === lastTerrainBlend &&
        active === lastActive && hovered === lastHovered && Math.abs(yaw - lastYaw) < .00015 &&
        Math.abs(pitch - lastPitch) < .00015 && Math.abs(radius - lastRadius) < .035) return;
      needsDraw = false;
      lastYaw = yaw;
      lastPitch = pitch;
      if (radius !== lastRadius) surfaceStyle.setProperty('--globe-diameter', `${radius * 2}px`);
      lastRadius = radius;
      lastActive = active;
      lastHovered = hovered;
      lastLayers = layers;
      lastMarkers = markerIndices;
      lastStoryMode = isStories;
      lastStoryGroups = storyGroups;
      lastStoryHover = storyHovered;
      lastStorySelection = storySelected;
      lastTerrain = retainedTerrain;
      lastTerrainBlend = terrainBlend;
      lastDraw = time;
      lastHoverX = hoverX; lastHoverY = hoverY;
      lastTheme = theme; lastLanguage = language;
      const narrow = width < 520;
      const detailed = current.zoom >= 1.35 && !narrow;
      renderer.draw(orientation, radius, highlight === null ? null : capitalPositions[highlight], layers, detailed, retainedTerrain, terrainBlend, hoverPoint, theme, isStories, reveal);
      if (reveal && renderer.failed()) {
        if (renderer.kind === 'webgl') useCanvasFallback();
        else if (request) request.onComplete(request.id);
        return;
      }

      if (isStories) {
        const visibleStories = projectStoryGroups(storyGroups, orientation, { width, height, centerX, radius, left: markerLeft, top: markerTop, bottom: markerBottom, compact: narrow }, storySelected, storyHovered);
        const visibleKeys = new Set(visibleStories.map(item => item.group.key));
        if (storyHovered && !visibleKeys.has(storyHovered)) setStoryHovered(null);
        for (const [key, marker] of storyNodes.current) if (!visibleKeys.has(key) && !marker.hidden) marker.hidden = true;
        for (const { group, x, y, anchorX, anchorY } of visibleStories) {
          const marker = storyNodes.current.get(group.key);
          if (!marker) continue;
          marker.hidden = false;
          marker.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
          marker.style.zIndex = group.key === storyHovered ? '4' : '1';
          marker.classList.toggle('preview-below', y < markerTop + 160);
          marker.classList.toggle('preview-right', x < markerLeft + 110);
          marker.classList.toggle('preview-left', x > width - 110);
          const dx = anchorX - x, dy = anchorY - y;
          const tether = marker.querySelector<HTMLElement>('.story-tether');
          const anchor = marker.querySelector<HTMLElement>('.story-anchor');
          if (tether && anchor) {
            tether.hidden = anchor.hidden = Math.hypot(dx, dy) < 1;
            tether.style.width = `${Math.hypot(dx, dy)}px`;
            tether.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
            anchor.style.transform = `translate(${dx}px,${dy}px) translate(-50%,-50%)`;
          }
          const image = marker.querySelector<HTMLImageElement>('img[data-src]');
          if (image && !image.getAttribute('src')) image.src = image.dataset.src!;
        }
        return;
      }

      if (!isAtlas) return;

      if (current.zoom < 1.16 && nearestRegion !== null) {
        nearestRegion = null;
        setRegionalAnchor(null);
      } else if (current.zoom >= 1.20 && time - lastRegionCheck >= 180) {
        lastRegionCheck = time;
        let best = -Infinity;
        let nextRegion = 0;
        featuredCapitalIndices.forEach((index, region) => {
          projected.copy(capitalPositions[index]).applyQuaternion(orientation);
          const score = projected.z + (region === nearestRegion ? .025 : 0);
          if (score > best) {
            best = score;
            nextRegion = region;
          }
        });
        if (nextRegion !== nearestRegion) {
          nearestRegion = nextRegion;
          setRegionalAnchor(nextRegion);
        }
      }

      const candidates = [];
      for (const [index, marker] of markers.current) {
        projected.copy(capitalPositions[index]).applyQuaternion(orientation);
        const x = centerX + projected.x * radius;
        const y = height / 2 - projected.y * radius;
        if (projected.z <= (index === hanoiIndex ? 0 : .13) || x <= markerLeft || x >= width - 8 || y <= markerTop || y >= markerBottom) {
          if (!marker.hidden) marker.hidden = true;
          continue;
        }
        const priority = index === active ? 5 : index === hovered ? 4 : index === hanoiIndex ? 3 : projected.z;
        candidates.push({ index, marker, x, y, priority });
      }
      candidates.sort((a, b) => b.priority - a.priority);
      labelRects.length = 0;
      const maxVisibleMarkers = narrow ? (current.zoom >= 1.2 ? 8 : 6) : (detailed ? 14 : current.zoom >= 1.2 ? 12 : 10);
      for (const [rank, { index, marker, x, y }] of candidates.entries()) {
        const markerVisible = rank < maxVisibleMarkers;
        if (marker.hidden === markerVisible) marker.hidden = !markerVisible;
        if (!markerVisible) continue;
        if (reveal) {
          const start = genesisScanEnd + .10 + rank * .024;
          marker.style.setProperty('--genesis-marker', String(index === hanoiIndex ? reveal.hanoi : genesisEase(reveal.time, start, start + .51)));
        }
        marker.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
        const label = marker.firstElementChild as HTMLElement | null;
        if (label) {
          if (layers.labels) {
            const hanoi = index === hanoiIndex;
            positionLabel(label, x, y, hanoi ? 127 : capitals[index].city.length * 6.4, hanoi ? 26 : 14);
          } else if (!label.hidden) label.hidden = true;
        }
        if (index === hovered && tooltip.current) {
          const tooltipHeight = index === hanoiIndex ? 105 : 48;
          const left = Math.max(6, Math.min(width - 186, x + 10));
          const top = y + tooltipHeight + 16 > markerBottom ? Math.max(markerTop, y - tooltipHeight) : y + 16;
          tooltip.current.style.transform = `translate3d(${left}px,${top}px,0)`;
        }
      }
      coordinatesOnGrid.forEach(({ text, position }, index) => {
        const label = gridLabels.current[index];
        if (!label) return;
        projected.copy(position).applyQuaternion(orientation);
        if (!layers.grid || projected.z < .37 || (narrow && index > 2)) {
          if (!label.hidden) label.hidden = true;
          return;
        }
        positionLabel(label, centerX + projected.x * radius, height / 2 - projected.y * radius, text.length * 6, 12, true);
      });
      if (reveal?.complete && request) request.onComplete(request.id);
    }
    syncVisibility();
    return () => {
      cancelAnimationFrame(raf);
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      frame.removeEventListener('wheel', handleWheel);
      glCanvas?.removeEventListener('webglcontextlost', contextLost);
      window.removeEventListener('resize', refreshBounds);
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('pointermove', trackPointer);
      window.removeEventListener('blur', resetPointer);
      window.removeEventListener('pointerout', eventLeave);
      document.removeEventListener('scroll', refreshBounds, true);
      renderer.dispose();
    };
  }, []);

  const city = active === null ? null : capitals[active];
  const preview = !isAtlas || hovered === null || active !== null || suspended ? null : capitals[hovered];
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return capitals.map((capital, index) => ({ capital, index }))
      .filter(({ capital }) => !search || [capital.city, capital.country, capital.region, capital.iso, cityName(capital), countryName(capital)]
        .some(value => value?.toLowerCase().includes(search)));
  }, [query, language]);

  const modeControls = <div className="globe-mode-switcher" role="group" aria-label={t('Visualization mode', 'Chế độ trực quan hóa')}>
    {globeModes.map(item => <button className="globe-mode-option" type="button" key={item.id} aria-pressed={mode === item.id} onClick={() => selectMode(item.id)}>
      {t(item.label, { atlas: 'Bản đồ', terrain: 'Địa hình', stories: 'Câu chuyện' }[item.id])}
    </button>)}
  </div>;

  return <div className={`data-globe${suspended ? ' atlas-suspended' : ''}`} data-mode={mode} onKeyDown={event => {
    if (event.key === 'Escape' && city) { event.preventDefault(); closeCity(); }
    else if (event.key === 'Escape' && selectedStory) { event.preventDefault(); closeStory(); }
  }}>
    <span id="globe-keyboard-help" className="sr-only">{t('Use arrow keys to rotate, plus and minus to zoom, and Home to reset the view. Story and capital lists provide an alternative to selecting markers.', 'Dùng phím mũi tên để xoay, dấu cộng và trừ để thu phóng, phím Home để đặt lại góc nhìn. Bạn cũng có thể chọn từ danh sách câu chuyện và thủ đô.')}</span>
    <div ref={viewport} className="globe-viewport" role="group" tabIndex={0} aria-describedby="globe-keyboard-help" aria-label={t('Interactive Earth globe', 'Quả cầu Trái Đất tương tác')}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Home') {
          setStoryClusterFocused(false);
          pointer.current = { x: 0, y: 0 };
          focusAt(home.yaw, home.pitch, 1);
        } else if (['+', '=', '-', '_'].includes(event.key)) {
          goal.current.zoom = MathUtils.clamp(goal.current.zoom + (event.key === '+' || event.key === '=' ? .1 : -.1), minZoom, maxZoom);
        } else if (event.key.startsWith('Arrow')) {
          setStoryClusterFocused(false);
          goal.current.focus = null;
          orbit.current.velocityX = orbit.current.velocityY = orbit.current.idle = 0;
          if (event.key === 'ArrowLeft') orbit.current.yaw -= .12;
          else if (event.key === 'ArrowRight') orbit.current.yaw += .12;
          else orbit.current.pitch = MathUtils.clamp(orbit.current.pitch + (event.key === 'ArrowUp' ? .12 : -.12), -1.55, 1.55);
        } else return;
        event.preventDefault();
      }} onPointerDown={event => {
      if (genesisRef.current || !event.isPrimary || event.button !== 0 || (event.target as Element).closest('button')) return;
      goal.current.focus = null;
      setStoryClusterFocused(false);
      orbit.current.velocityX = 0;
      orbit.current.velocityY = 0;
      orbit.current.idle = 0;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
      setHovered(null);
      setTerrainHovered(null);
      terrainPointer.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (!event.isPrimary) return;
      const previous = drag.current;
      if (previous?.id === event.pointerId) {
        const dx = (event.clientX - previous.x) * .006;
        const dy = (event.clientY - previous.y) * .006;
        const elapsed = Math.max(12, event.timeStamp - previous.time) / 1000;
        orbit.current.yaw += dx;
        orbit.current.pitch = MathUtils.clamp(orbit.current.pitch + dy, -1.55, 1.55);
        orbit.current.velocityX = MathUtils.clamp(dx / elapsed, -2.1, 2.1);
        orbit.current.velocityY = MathUtils.clamp(dy / elapsed, -2.1, 2.1);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
      } else if (event.pointerType === 'mouse') {
        const bounds = event.currentTarget.getBoundingClientRect();
        terrainPointer.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      }
    }} onPointerLeave={() => {
      constellationPointer.current = null;
      terrainPointer.current = null;
      setTerrainHovered(null);
    }} onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      if (event.timeStamp - drag.current.time > 85) {
        orbit.current.velocityX = 0;
        orbit.current.velocityY = 0;
      }
      drag.current = null;
      if (event.pointerType === 'mouse') {
        const bounds = event.currentTarget.getBoundingClientRect();
        terrainPointer.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      }
    }} onLostPointerCapture={() => { drag.current = null; }} onPointerCancel={() => {
      drag.current = null;
      orbit.current.velocityX = 0;
      orbit.current.velocityY = 0;
    }}>
      <div ref={canvasMount} className="globe-renderer" aria-hidden="true" />
      {atlasMounted && coordinatesOnGrid.map(({ text }, index) => <span key={text} hidden aria-hidden="true" className="atlas-coordinate"
        ref={node => { gridLabels.current[index] = node; }}>{text}</span>)}
      {atlasMounted && markerIndices.map(index => <button key={capitals[index].id}
        ref={node => {
          if (node) markers.current.set(index, node);
          else markers.current.delete(index);
        }} type="button" hidden
        className={`globe-capital-marker${index === hanoiIndex ? ' atlas-origin-marker' : ''}`}
        aria-label={cityName(capitals[index]) + ', ' + countryName(capitals[index]) + (index === hanoiIndex ? t(' · My Origin', ' · Điểm khởi đầu') : '')}
        aria-pressed={active === index}
        aria-hidden={!isAtlas}
        tabIndex={isAtlas ? 0 : -1}
        onPointerEnter={event => { if (event.pointerType === 'mouse' && !drag.current) setHovered(index); }}
        onPointerLeave={() => setHovered(current => current === index ? null : current)}
        onFocus={() => setHovered(index)}
        onBlur={() => setHovered(current => current === index ? null : current)}
        onClick={event => openCity(index, event.currentTarget)}>
        <span className="atlas-city-label" hidden aria-hidden="true">{index === hanoiIndex
          ? <>{t('HANOI', 'HÀ NỘI')}<small>{t('MY ORIGIN · VIETNAM', 'KHỞI ĐẦU · VIỆT NAM')}</small></>
          : capitals[index].city}</span>
        {layers.flags && capitals[index].iso && <img className="atlas-capital-flag" alt="" loading="lazy" decoding="async"
          src={`${import.meta.env.BASE_URL}atlas-flags/${capitals[index].iso.toLowerCase()}.svg`} />}
      </button>)}
      {isStories && <StoryMarkers groups={storyGroups} nodes={storyNodes} hovered={storyHovered} selected={selectedStory?.id ?? null}
        onHover={key => { if (!drag.current && !suspended) setStoryHovered(key); }} onOpen={openStoryGroup} />}
      {preview && <div ref={tooltip} className="globe-capital-tooltip" role="tooltip">
        {hovered === hanoiIndex
          ? <><span className="atlas-origin-kicker">{t('MY ORIGIN / 001', 'KHỞI ĐẦU / 001')}</span><strong>{t('HANOI, VIETNAM', 'HÀ NỘI, VIỆT NAM')}</strong>
            <span>21.0285° N<br />105.8542° E</span><span>{t('SOUTHEAST ASIA', 'ĐÔNG NAM Á')}</span></>
          : <><strong>{cityName(preview)}</strong><span>{countryName(preview)}</span></>}
      </div>}
    </div>
    {city && <section className={`globe-city-panel${active === hanoiIndex ? ' atlas-origin-panel' : ''}`} aria-labelledby="globe-city-name">
      <button ref={closeButton} type="button" aria-label={t('Close capital details', 'Đóng thông tin thủ đô')} onClick={closeCity}><X size={16} /></button>
      <p className="welcome-eyebrow">{active === hanoiIndex ? t('MY ORIGIN / 001', 'KHỞI ĐẦU / 001') : capitalKind(city, language === 'vi')}</p>
      <h2 id="globe-city-name">{cityName(city)}</h2>
      <p>{active === hanoiIndex ? t('Capital of Vietnam', 'Thủ đô Việt Nam') : `${countryName(city)} · ${city.continent}`}</p>
      <dl>
        <dt>{t('Region', 'Khu vực')}</dt><dd>{active === hanoiIndex ? t('Southeast Asia', 'Đông Nam Á') : city.region}</dd>
        <dt>{t('Coordinates', 'Tọa độ')}</dt><dd>{coordinates(city)}</dd>
      </dl>
      {active === hanoiIndex
        ? <p className="atlas-origin-quote">{t('“A point of origin in a world of data.”', '“Điểm khởi đầu trong một thế giới dữ liệu.”')}</p>
        : <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/" target="_blank" rel="noreferrer">{t('Source · Natural Earth', 'Nguồn · Natural Earth')}</a>}
    </section>}
    {isAtlas && <div className="globe-controls" role="group" aria-label={t('Globe controls', 'Điều khiển quả cầu')}>
      <details ref={directory} className="globe-directory" onToggle={event => {
        const open = event.currentTarget.open;
        if (open && layersMenu.current) layersMenu.current.open = false;
        setDirectoryOpen(open);
      }}>
        <summary aria-label={t('Find a capital', 'Tìm thủ đô')}><Search size={15} aria-hidden="true" /></summary>
        {directoryOpen && <div className="globe-directory-panel">
          <label><Search size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('City or country', 'Thành phố hoặc quốc gia')} aria-label={t('Search capitals', 'Tìm kiếm thủ đô')} /></label>
          <ul>{matches.map(({ capital, index }) => <li key={capital.id}>
            <button type="button" onClick={event => openCity(index, event.currentTarget)}>{cityName(capital)}<small>{countryName(capital)}</small></button>
          </li>)}</ul>
          {matches.length === 0 && <p>{t('No capitals found.', 'Không tìm thấy thủ đô.')}</p>}
        </div>}
      </details>
      <details ref={layersMenu} className="globe-directory atlas-layers" onToggle={event => {
        if (event.currentTarget.open && directory.current) directory.current.open = false;
      }}>
        <summary aria-label={t('Layers', 'Các lớp hiển thị')}><Layers size={15} aria-hidden="true" /></summary>
        <div className="globe-directory-panel atlas-layer-options">
          {(Object.keys(atlasLayerNames) as Array<keyof AtlasLayers>).map(key => <label key={key}>
            <input type="checkbox" checked={layers[key]} onChange={event => {
              const checked = event.currentTarget.checked;
              setLayers(current => ({ ...current, [key]: checked }));
            }} /> {t(atlasLayerNames[key], { particles: 'Các điểm dữ liệu', grid: 'Lưới địa lý', borders: 'Biên giới quốc gia', labels: 'Tên thủ đô', flags: 'Cờ thủ đô' }[key])}
          </label>)}
          <a href={borderSource} target="_blank" rel="noreferrer">{t('Land borders · Natural Earth', 'Biên giới · Natural Earth')}</a>
        </div>
      </details>
    </div>}
    {explorationControlsTarget && mode === 'terrain' && createPortal(<TerrainControls data={terrainData} error={terrainError} settings={terrainSettings}
      selected={terrainSelected} onSettingsChange={setTerrainSettings} onInspect={inspectTerrain}
      onReset={() => { setTerrainSettings({ ...terrainDefaults }); setTerrainSelected(null); setTerrainHovered(null); terrainPointer.current = null; }} />, explorationControlsTarget)}
    {explorationControlsTarget && isStories && createPortal(<StoryControls stories={stories} filtered={filteredStories} category={storyCategory} selected={selectedStory} error={storyError}
      onCategory={changeStoryCategory} onSelect={selectStory} onClose={closeStory} onRetry={() => setStoryAttempt(attempt => attempt + 1)}
      categoryRef={storyCategoryControl} onAtlas={story => {
        selectMode('atlas');
        const index = capitals.findIndex(city => city.id === story.placeId);
        if (index >= 0) openCity(index, storyCategoryControl.current ?? viewport.current!);
        else focusAt(MathUtils.degToRad(-story.longitude), MathUtils.degToRad(story.latitude), goal.current.zoom);
      }} />, explorationControlsTarget)}
    {modeControlsTarget ? createPortal(modeControls, modeControlsTarget) : modeControls}
  </div>;
}
