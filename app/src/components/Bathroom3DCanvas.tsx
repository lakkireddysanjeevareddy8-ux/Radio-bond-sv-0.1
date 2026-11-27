import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Polygon,
  Polyline,
  Line,
  Circle,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import {
  BathroomDimensions,
  BathroomDoorConfig,
  BathroomWindowConfig,
  DEFAULT_WINDOW_CONFIG,
  DevicePlacement,
  DoorWall,
} from '../types/bathroom';
import {
  Bathroom3DMath,
  CameraOptions,
  ProjectedPolygon,
} from '../utils/bathroom3DMath';
import { BathroomPlacementEngine } from '../services/BathroomPlacementEngine';
import { colors, borderRadius, spacing, shadows } from '../utils/theme';
import { RadarVolumetricLegend } from './RadarVolumetricVisualization';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  Layers,
  Radio,
  DoorOpen,
  DoorClosed,
  Maximize2,
  Minimize2,
  Compass,
  Sparkles,
  Move,
  AlertTriangle,
} from 'lucide-react-native';

// Helper to format 3D wall name to intuitive Front, Back, Right, Left
const formatWallName = (wall: DoorWall): string => {
  switch (wall) {
    case 'TOP':
      return 'Front';
    case 'BOTTOM':
      return 'Back';
    case 'RIGHT':
      return 'Right';
    case 'LEFT':
      return 'Left';
  }
};

interface Bathroom3DCanvasProps {
  dimensions: BathroomDimensions;
  door: BathroomDoorConfig;
  window?: BathroomWindowConfig;
  device: DevicePlacement;
  showRadar?: boolean;
  showFixtures?: boolean;
  onDoorToggle?: () => void;
  onDeviceChange?: (device: DevicePlacement) => void;
  height?: number;
}

export const Bathroom3DCanvas: React.FC<Bathroom3DCanvasProps> = ({
  dimensions,
  door,
  window: windowConfig = DEFAULT_WINDOW_CONFIG,
  device,
  showRadar = true,
  showFixtures = true,
  onDoorToggle,
  onDeviceChange,
  height = 360,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 680;
  const isSmall = windowWidth < 380;

  const [layoutWidth, setLayoutWidth] = useState(360);
  const [isFitScreen, setIsFitScreen] = useState(false);
  const [doorWarning, setDoorWarning] = useState<string | null>(null);
  const doorWarningTimerRef = useRef<any>(null);

  // Compute effective viewport height based on fit-to-screen mode and mobile screen width
  const effectiveHeight = isFitScreen
    ? Math.min(650, Math.max(450, layoutWidth * 1.1))
    : isMobile
    ? Math.min(340, Math.max(260, layoutWidth * 0.72))
    : Math.max(380, height);

  const [camera, setCamera] = useState<CameraOptions>({
    yawDeg: 42,
    pitchDeg: 34,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isTopDown: false,
  });

  const [transparentWalls, setTransparentWalls] = useState(true);
  const [radarVisible, setRadarVisible] = useState(showRadar);

  // FMCW Radar animated travelling pulse phase (0.0 to 1.0)
  const [pulsePhase, setPulsePhase] = useState(0);
  const pulseAnimRef = useRef<number | null>(null);

  useEffect(() => {
    if (!radarVisible) {
      setPulsePhase(0);
      return;
    }

    const cycleDuration = 2200; // 2.2 seconds per sweep cycle
    let startTimestamp: number | null = null;

    const loop = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const phase = (elapsed % cycleDuration) / cycleDuration;
      setPulsePhase(phase);
      pulseAnimRef.current = requestAnimationFrame(loop);
    };

    pulseAnimRef.current = requestAnimationFrame(loop);

    return () => {
      if (pulseAnimRef.current) {
        cancelAnimationFrame(pulseAnimRef.current);
      }
    };
  }, [radarVisible]);

  // Keep camera & device refs for gesture handler
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const deviceRef = useRef(device);
  deviceRef.current = device;

  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  const doorRef = useRef(door);
  doorRef.current = door;

  const onDeviceChangeRef = useRef(onDeviceChange);
  onDeviceChangeRef.current = onDeviceChange;

  // Snapshot camera orientation when a drag gesture begins
  const startGestureRef = useRef({
    yaw: 42,
    pitch: 34,
    panX: 0,
    panY: 0,
  });

  // Drag & drop state for the WSG-01 device
  const [isDraggingDevice, setIsDraggingDevice] = useState(false);
  const isDraggingDeviceRef = useRef(false);
  const [dragHoverWall, setDragHoverWall] = useState<DoorWall | null>(null);
  const dragHoverWallRef = useRef<DoorWall | null>(null);
  const startTouchRef = useRef({ x: 0, y: 0 });
  const startHeightRef = useRef(device.mountingHeight);

  // Smoothly animated dimensions for scaling transitions between presets
  const [animatedDims, setAnimatedDims] = useState<BathroomDimensions>(dimensions);
  const animFrameRef = useRef<number | null>(null);
  const animCurrentRef = useRef(dimensions);

  useEffect(() => {
    const startL = animCurrentRef.current.length;
    const startW = animCurrentRef.current.width;
    const startH = animCurrentRef.current.height;
    const targetL = dimensions.length;
    const targetW = dimensions.width;
    const targetH = dimensions.height;

    if (
      Math.abs(startL - targetL) < 0.01 &&
      Math.abs(startW - targetW) < 0.01 &&
      Math.abs(startH - targetH) < 0.01
    ) {
      return;
    }

    const duration = 400; // 400ms smooth expansion/shrink
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic curve
      const ease = 1 - Math.pow(1 - progress, 3);

      const curL = Math.round((startL + (targetL - startL) * ease) * 100) / 100;
      const curW = Math.round((startW + (targetW - startW) * ease) * 100) / 100;
      const curH = Math.round((startH + (targetH - startH) * ease) * 100) / 100;

      const nextDims = { length: curL, width: curW, height: curH };
      animCurrentRef.current = nextDims;
      setAnimatedDims(nextDims);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [dimensions.length, dimensions.width, dimensions.height]);

  // Calculate 2D projected screen coordinate of the WSG-01 sensor
  const deviceScreenPos = useMemo(() => {
    const worldCoords = Bathroom3DMath.getDeviceWorldCoordinates(animatedDims, device);
    return Bathroom3DMath.projectPoint(worldCoords, camera, layoutWidth, effectiveHeight);
  }, [animatedDims, device, camera, layoutWidth, effectiveHeight]);

  const deviceScreenPosRef = useRef(deviceScreenPos);
  deviceScreenPosRef.current = deviceScreenPos;

  // Helper to get 2D projected coordinates of the 4 wall centers
  const getProjectedWallCenters = (
    dims: BathroomDimensions,
    cam: CameraOptions,
    w: number,
    h: number
  ): Record<DoorWall, { x: number; y: number }> => {
    const halfW = dims.width / 2;
    const halfL = dims.length / 2;
    const midH = 1.8;

    return {
      TOP: Bathroom3DMath.projectPoint({ x: 0, y: halfL, z: midH }, cam, w, h),
      BOTTOM: Bathroom3DMath.projectPoint({ x: 0, y: -halfL, z: midH }, cam, w, h),
      LEFT: Bathroom3DMath.projectPoint({ x: -halfW, y: 0, z: midH }, cam, w, h),
      RIGHT: Bathroom3DMath.projectPoint({ x: halfW, y: 0, z: midH }, cam, w, h),
    };
  };

  // Touch / Drag PanResponder: handles both device drag-and-drop and 3D orbital camera
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          startTouchRef.current = { x: locationX, y: locationY };
          startHeightRef.current = deviceRef.current.mountingHeight;

          // Check if touch is on or near the WSG-01 device (within 48px radius)
          const devX = deviceScreenPosRef.current.x;
          const devY = deviceScreenPosRef.current.y;
          const distToDev = Math.hypot(locationX - devX, locationY - devY);

          if (distToDev <= 48) {
            isDraggingDeviceRef.current = true;
            setIsDraggingDevice(true);
            dragHoverWallRef.current = deviceRef.current.wall;
            setDragHoverWall(deviceRef.current.wall);
          } else {
            isDraggingDeviceRef.current = false;
            setIsDraggingDevice(false);
            dragHoverWallRef.current = null;
            setDragHoverWall(null);
            startGestureRef.current = {
              yaw: cameraRef.current.yawDeg,
              pitch: cameraRef.current.pitchDeg,
              panX: cameraRef.current.panX,
              panY: cameraRef.current.panY,
            };
          }
        },
        onPanResponderMove: (_, gestureState) => {
          if (isDraggingDeviceRef.current) {
            // Dragging WSG-01 device horizontally across walls & vertically along height
            const curTouchX = startTouchRef.current.x + gestureState.dx;
            const curTouchY = startTouchRef.current.y + gestureState.dy;

            const wallCenters = getProjectedWallCenters(
              dimensionsRef.current,
              cameraRef.current,
              layoutWidth,
              effectiveHeight
            );

            // Find nearest wall to current touch position
            let closestWall: DoorWall = deviceRef.current.wall;
            let minDist = Infinity;
            (['TOP', 'BOTTOM', 'LEFT', 'RIGHT'] as DoorWall[]).forEach((w) => {
              const d = Math.hypot(curTouchX - wallCenters[w].x, curTouchY - wallCenters[w].y);
              if (d < minDist) {
                minDist = d;
                closestWall = w;
              }
            });

            // Update target wall hover state
            if (closestWall !== dragHoverWallRef.current) {
              dragHoverWallRef.current = closestWall;
              setDragHoverWall(closestWall);
            }

            // Calculate horizontal offset ratio along the targeted wall
            let ratio = 0.5;
            if (closestWall === 'TOP' || closestWall === 'BOTTOM') {
              ratio = 0.5 + (curTouchX - wallCenters[closestWall].x) / (layoutWidth * 0.35);
            } else {
              ratio = 0.5 + (curTouchY - wallCenters[closestWall].y) / (effectiveHeight * 0.35);
            }
            ratio = Math.max(0.12, Math.min(0.88, ratio));

            // Calculate vertical mounting height adjustment from dy (dragging up increases height)
            const heightSensitivity = 0.007;
            const deltaH = -gestureState.dy * heightSensitivity;
            const minH = 0.9;
            const maxH = Math.max(1.8, dimensionsRef.current.height - 0.2);
            const nextH = Math.round(Math.max(minH, Math.min(maxH, startHeightRef.current + deltaH)) * 10) / 10;

            // Check if this position is directly on the door itself (not forbidden on the rest of the wall)
            const isOnDoor = BathroomPlacementEngine.isPlacementOnDoor(
              dimensionsRef.current,
              doorRef.current,
              { wall: closestWall, offsetRatio: ratio, mountingHeight: nextH }
            );

            if (isOnDoor) {
              setDoorWarning(
                `⚠️ The gadget cannot be placed on the door! Move beside or above the door.`
              );
            } else {
              setDoorWarning(null);
            }

            // Use placement engine and apply both horizontal ratio and vertical height
            const optimal = BathroomPlacementEngine.getBestPlacementForWall(
              dimensionsRef.current,
              doorRef.current,
              closestWall
            );
            optimal.offsetRatio = Math.round(ratio * 20) / 20;
            optimal.mountingHeight = nextH;

            onDeviceChangeRef.current?.(optimal);
            return;
          }

          // Camera rotation when not dragging the device
          if (cameraRef.current.isTopDown) {
            setCamera((prev) => ({
              ...prev,
              panX: startGestureRef.current.panX + gestureState.dx * 0.25,
              panY: startGestureRef.current.panY + gestureState.dy * 0.25,
            }));
            return;
          }

          const sensitivity = 0.42;
          let nextYaw = (startGestureRef.current.yaw + gestureState.dx * sensitivity) % 360;
          if (nextYaw < 0) nextYaw += 360;

          const nextPitch = Math.max(
            10,
            Math.min(85, startGestureRef.current.pitch - gestureState.dy * (sensitivity * 0.6))
          );

          setCamera((prev) => ({
            ...prev,
            yawDeg: nextYaw,
            pitchDeg: nextPitch,
          }));
        },
        onPanResponderRelease: () => {
          if (isDraggingDeviceRef.current) {
            isDraggingDeviceRef.current = false;
            setIsDraggingDevice(false);
            dragHoverWallRef.current = null;
            setDragHoverWall(null);

            // If released directly on the door panel, nudge to the nearest clear spot beside the door
            const curDev = deviceRef.current;
            if (
              BathroomPlacementEngine.isPlacementOnDoor(
                dimensionsRef.current,
                doorRef.current,
                curDev
              )
            ) {
              const wallLen =
                curDev.wall === 'TOP' || curDev.wall === 'BOTTOM'
                  ? dimensionsRef.current.width
                  : dimensionsRef.current.length;
              const doorW = doorRef.current.width || 0.8;
              const doorPosRatio = doorRef.current.positionRatio ?? 0.5;
              const halfDoorRatio = doorW / wallLen / 2;
              const safeRatio =
                curDev.offsetRatio < doorPosRatio
                  ? Math.max(0.12, Math.round((doorPosRatio - halfDoorRatio - 0.1) * 20) / 20)
                  : Math.min(0.88, Math.round((doorPosRatio + halfDoorRatio + 0.1) * 20) / 20);

              onDeviceChangeRef.current?.({
                ...curDev,
                offsetRatio: safeRatio,
              });
            }

            // Auto-clear door warning banner after 2.5 seconds
            if (doorWarningTimerRef.current) {
              clearTimeout(doorWarningTimerRef.current);
            }
            doorWarningTimerRef.current = setTimeout(() => {
              setDoorWarning(null);
            }, 2500);
          }
        },
      }),
    [layoutWidth, effectiveHeight]
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0 && Math.abs(width - layoutWidth) > 5) {
      setLayoutWidth(width);
    }
  };

  // Generate and depth-sort 3D polygons (uses smoothly animated dimensions)
  const projectedPolygons = useMemo(() => {
    const polys = Bathroom3DMath.generateBathroomScene(
      animatedDims,
      door,
      device,
      {
        showRadar: radarVisible,
        showFixtures,
        transparentWalls,
        pulsePhase,
        window: windowConfig,
      }
    );

    const projected = polys.map((poly) =>
      Bathroom3DMath.projectPolygon(poly, camera, layoutWidth, effectiveHeight)
    );

    return projected.sort((a, b) => b.avgDepth - a.avgDepth);
  }, [
    animatedDims,
    door,
    windowConfig,
    device,
    camera,
    layoutWidth,
    effectiveHeight,
    radarVisible,
    showFixtures,
    transparentWalls,
    pulsePhase,
  ]);

  const handleZoom = (delta: number) => {
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(0.6, Math.min(2.5, prev.zoom + delta)),
    }));
  };

  const handleResetCamera = () => {
    setCamera({
      yawDeg: 42,
      pitchDeg: 34,
      zoom: isFitScreen ? 1.25 : 1.0,
      panX: 0,
      panY: 0,
      isTopDown: false,
    });
  };

  const handleToggleTopDown = () => {
    setCamera((prev) => ({
      ...prev,
      isTopDown: !prev.isTopDown,
      zoom: !prev.isTopDown ? 0.95 : 1.0,
      panX: 0,
      panY: 0,
    }));
  };

  const handleToggleFitScreen = () => {
    setIsFitScreen((prev) => {
      const next = !prev;
      setCamera((c) => ({
        ...c,
        zoom: next ? 1.25 : 1.0,
      }));
      return next;
    });
  };

  return (
    <View style={styles.outerContainer}>
      {/* 1. Pure 3D Canvas Viewport - Completely clean with zero button/text overlays */}
      <View
        style={[styles.canvasContainer, { height: effectiveHeight }]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <Svg
          width={layoutWidth}
          height={effectiveHeight}
          viewBox={`0 0 ${layoutWidth} ${effectiveHeight}`}
        >
          <Defs>
            <LinearGradient id="radarBeamGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#10B981" stopOpacity="0.08" />
            </LinearGradient>
            <LinearGradient id="radarCyanGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#06B6D4" stopOpacity="0.40" />
              <Stop offset="100%" stopColor="#06B6D4" stopOpacity="0.08" />
            </LinearGradient>
            <LinearGradient id="radarYellowGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#F59E0B" stopOpacity="0.06" />
            </LinearGradient>
            <LinearGradient id="radarOrangeGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#F97316" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#F97316" stopOpacity="0.06" />
            </LinearGradient>
            <LinearGradient id="radarSpillGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#EF4444" stopOpacity="0.55" />
              <Stop offset="100%" stopColor="#EF4444" stopOpacity="0.10" />
            </LinearGradient>
          </Defs>

          {/* Render 3D Polygons */}
          {projectedPolygons.map((poly) => {
            const pointsStr = poly.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

            if (poly.points.length === 2) {
              return (
                <Line
                  key={poly.id}
                  x1={poly.points[0].x}
                  y1={poly.points[0].y}
                  x2={poly.points[1].x}
                  y2={poly.points[1].y}
                  stroke={poly.strokeColor || '#94A3B8'}
                  strokeWidth={poly.strokeWidth || 1}
                  opacity={poly.opacity}
                />
              );
            }

            return (
              <Polygon
                key={poly.id}
                points={pointsStr}
                fill={poly.color}
                stroke={poly.strokeColor || 'transparent'}
                strokeWidth={poly.strokeWidth || 0}
                opacity={poly.opacity}
              />
            );
          })}

          {/* Interactive Draggable Handle over WSG-01 */}
          <G x={deviceScreenPos.x} y={deviceScreenPos.y}>
            <Circle
              r={isDraggingDevice ? 26 : 18}
              fill={isDraggingDevice ? 'rgba(56, 189, 248, 0.35)' : 'rgba(16, 185, 129, 0.22)'}
              stroke={isDraggingDevice ? '#38BDF8' : '#10B981'}
              strokeWidth={2}
              strokeDasharray={isDraggingDevice ? '4,3' : undefined}
            />
            <Circle
              r={isDraggingDevice ? 8 : 5.5}
              fill={isDraggingDevice ? '#38BDF8' : '#10B981'}
            />
            <SvgText
              x={0}
              y={-22}
              textAnchor="middle"
              fill={isDraggingDevice ? '#38BDF8' : '#F8FAFC'}
              fontSize={9.5}
              fontWeight="bold"
            >
              {isDraggingDevice
                ? `${formatWallName(dragHoverWall || device.wall)} • ${device.mountingHeight.toFixed(1)}m`
                : `WSG-01 (${device.mountingHeight.toFixed(1)}m)`}
            </SvgText>
          </G>
        </Svg>

        {/* Door Warning Banner (temporary alert when dragged directly over door panel) */}
        {doorWarning && (
          <View style={styles.doorWarningBanner}>
            <AlertTriangle size={15} color="#FFFFFF" />
            <Text style={styles.doorWarningText}>{doorWarning}</Text>
          </View>
        )}

        {/* Live Drag Indicator */}
        {isDraggingDevice && !doorWarning && (
          <View style={styles.dragIndicatorBanner}>
            <Sparkles size={13} color="#38BDF8" />
            <Text style={styles.dragIndicatorText}>
              Moving to {formatWallName(dragHoverWall || device.wall)} Wall • Height: {device.mountingHeight.toFixed(1)}m
            </Text>
          </View>
        )}
      </View>

      {/* 2. Controls Panel - Fully Responsive for Mobile & Desktop */}
      <View style={styles.controlsBelowCard}>
        {/* Row A: WSG-01 Wall Selector */}
        <View style={[styles.quickWallBarBelow, isMobile && styles.quickWallBarBelowMobile]}>
          <View style={styles.quickWallLabelBadge}>
            <Move size={12} color="#38BDF8" />
            <Text style={styles.quickWallLabelText}>WSG-01 Wall:</Text>
            {isMobile && (
              <Text style={styles.activeWallHighlight}>
                {formatWallName(device.wall)} Wall
              </Text>
            )}
          </View>
          <View style={[styles.wallPillsContainer, isSmall && styles.wallPillsContainerSmall]}>
            {[
              { id: 'TOP' as DoorWall, label: 'Front' },
              { id: 'BOTTOM' as DoorWall, label: 'Back' },
              { id: 'RIGHT' as DoorWall, label: 'Right' },
              { id: 'LEFT' as DoorWall, label: 'Left' },
            ].map(({ id: w, label }) => {
              const isActive = device.wall === w;
              const isDoorWall = door.wall === w;
              return (
                <Pressable
                  key={w}
                  style={({ pressed }) => [
                    styles.quickWallPill,
                    isActive && styles.quickWallPillActive,
                    pressed && styles.quickWallPillPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => {
                    setDoorWarning(null);
                    const optimal = BathroomPlacementEngine.getBestPlacementForWall(
                      dimensions,
                      door,
                      w
                    );
                    optimal.mountingHeight = device.mountingHeight;
                    onDeviceChange?.(optimal);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move WSG-01 to ${label} Wall`}
                >
                  <Text
                    style={[
                      styles.quickWallPillText,
                      isActive && styles.quickWallPillTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {label}{isDoorWall ? ' (Door)' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Row B: 3D Toolbar & Camera Actions */}
        {isMobile ? (
          <View style={styles.mobileToolbarContainer}>
            {/* Mobile Tier 1: View Mode Status & Framing Actions */}
            <View style={styles.mobileToolbarRow}>
              <View style={styles.modeBadgeBelow}>
                <Compass size={13} color="#0284C7" />
                <Text style={styles.modeBadgeText}>
                  {camera.isTopDown ? 'Top-Down' : `3D ${Math.round(camera.yawDeg)}°`}
                </Text>
              </View>

              <View style={styles.mobileBtnRow}>
                {/* Fit to Screen Toggle */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    isFitScreen && styles.toolBtnActive,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={handleToggleFitScreen}
                  accessibilityRole="button"
                  accessibilityLabel="Fit Screen Toggle"
                >
                  {isFitScreen ? (
                    <Minimize2 size={16} color="#FFFFFF" />
                  ) : (
                    <Maximize2 size={16} color="#334155" />
                  )}
                </Pressable>

                {/* Top-Down Toggle */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    camera.isTopDown && styles.toolBtnActive,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={handleToggleTopDown}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Top-Down or 3D View"
                >
                  <Eye size={16} color={camera.isTopDown ? '#FFFFFF' : '#334155'} />
                </Pressable>

                {/* Reset Camera */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={handleResetCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Reset 3D Camera"
                >
                  <RotateCcw size={16} color="#334155" />
                </Pressable>
              </View>
            </View>

            {/* Mobile Tier 2: Feature Toggles & Zoom Controls */}
            <View style={styles.mobileToolbarRow}>
              <View style={styles.mobileBtnRow}>
                {/* Radar Beam Toggle */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    radarVisible && styles.toolBtnRadarActive,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => setRadarVisible((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Radar Field"
                >
                  <Radio size={16} color={radarVisible ? '#FFFFFF' : '#334155'} />
                </Pressable>

                {/* Transparent Walls Toggle */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    transparentWalls && styles.toolBtnActive,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => setTransparentWalls((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Cutaway Walls"
                >
                  <Layers size={16} color={transparentWalls ? '#FFFFFF' : '#334155'} />
                </Pressable>

                {/* Door Simulation Toggle */}
                {onDoorToggle && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.toolBtn,
                      door.isOpen && styles.toolBtnWarningActive,
                      pressed && styles.toolBtnPressed,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={onDoorToggle}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle Door Open or Closed"
                  >
                    {door.isOpen ? (
                      <DoorOpen size={16} color="#FFFFFF" />
                    ) : (
                      <DoorClosed size={16} color="#334155" />
                    )}
                  </Pressable>
                )}
              </View>

              <View style={styles.mobileBtnRow}>
                {/* Zoom In */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => handleZoom(0.2)}
                  accessibilityRole="button"
                  accessibilityLabel="Zoom In"
                >
                  <ZoomIn size={16} color="#334155" />
                </Pressable>

                {/* Zoom Out */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => handleZoom(-0.2)}
                  accessibilityRole="button"
                  accessibilityLabel="Zoom Out"
                >
                  <ZoomOut size={16} color="#334155" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.toolBarBelow}>
            {/* Desktop Angle Indicator Badge */}
            <View style={styles.modeBadgeBelow}>
              <Compass size={13} color="#0284C7" />
              <Text style={styles.modeBadgeText}>
                {camera.isTopDown ? 'Top-Down Plan' : `3D Angle ${Math.round(camera.yawDeg)}°`}
              </Text>
            </View>

            {/* Desktop Action Buttons Group */}
            <View style={styles.actionButtonGroupBelow}>
              {/* Fit to Screen Toggle */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  isFitScreen && styles.toolBtnActive,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={handleToggleFitScreen}
                accessibilityRole="button"
                accessibilityLabel="Fit Screen Toggle"
              >
                {isFitScreen ? (
                  <Minimize2 size={15} color="#FFFFFF" />
                ) : (
                  <Maximize2 size={15} color="#334155" />
                )}
              </Pressable>

              {/* Top-Down Toggle */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  camera.isTopDown && styles.toolBtnActive,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={handleToggleTopDown}
                accessibilityRole="button"
                accessibilityLabel="Toggle Top-Down or 3D View"
              >
                <Eye size={15} color={camera.isTopDown ? '#FFFFFF' : '#334155'} />
              </Pressable>

              {/* Cutaway Transparent Walls Toggle */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  transparentWalls && styles.toolBtnActive,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => setTransparentWalls((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Toggle Cutaway Walls"
              >
                <Layers size={15} color={transparentWalls ? '#FFFFFF' : '#334155'} />
              </Pressable>

              {/* Radar Beam Toggle */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  radarVisible && styles.toolBtnRadarActive,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => setRadarVisible((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Toggle Radar Field of View"
              >
                <Radio size={15} color={radarVisible ? '#FFFFFF' : '#334155'} />
              </Pressable>

              {/* Door Open/Close Simulation Toggle */}
              {onDoorToggle && (
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    door.isOpen && styles.toolBtnWarningActive,
                    pressed && styles.toolBtnPressed,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={onDoorToggle}
                  accessibilityRole="button"
                  accessibilityLabel="Open or Close Door Simulation"
                >
                  {door.isOpen ? (
                    <DoorOpen size={15} color="#FFFFFF" />
                  ) : (
                    <DoorClosed size={15} color="#334155" />
                  )}
                </Pressable>
              )}

              {/* Reset Camera */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={handleResetCamera}
                accessibilityRole="button"
                accessibilityLabel="Reset 3D Camera"
              >
                <RotateCcw size={15} color="#334155" />
              </Pressable>

              {/* Zoom In */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => handleZoom(0.2)}
                accessibilityRole="button"
                accessibilityLabel="Zoom In"
              >
                <ZoomIn size={15} color="#334155" />
              </Pressable>

              {/* Zoom Out */}
              <Pressable
                style={({ pressed }) => [
                  styles.toolBtn,
                  pressed && styles.toolBtnPressed,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => handleZoom(-0.2)}
                accessibilityRole="button"
                accessibilityLabel="Zoom Out"
              >
                <ZoomOut size={15} color="#334155" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Row C: Gesture Hint & Volumetric Radar Legend */}
        <View style={styles.legendBarBelow}>
          <Text style={styles.gestureHintText}>
            {camera.isTopDown
              ? 'Drag WSG-01 to move • Drag canvas to pan'
              : 'Drag WSG-01 to move • Drag canvas to rotate 360°'}
          </Text>

          {radarVisible && (
            <RadarVolumetricLegend compact={isMobile} showBleed={true} />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  canvasContainer: {
    backgroundColor: '#0B1120', // Clean dark viewport for high-contrast 3D rendering
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
        } as any)
      : null),
  },
  doorWarningBanner: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 25,
  },
  doorWarningText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  dragIndicatorBanner: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 15,
    ...shadows.md,
  },
  dragIndicatorText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Controls card cleanly docked BELOW the 3D canvas
  controlsBelowCard: {
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  quickWallBarBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickWallBarBelowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  quickWallLabelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.3)',
  },
  quickWallLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  activeWallHighlight: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    marginLeft: 'auto',
  },
  wallPillsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  wallPillsContainerSmall: {
    flexWrap: 'wrap',
  },
  quickWallPill: {
    flex: 1,
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          userSelect: 'none',
        } as any)
      : null),
  },
  quickWallPillActive: {
    backgroundColor: '#0284C7',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  quickWallPillPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  quickWallPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  quickWallPillTextActive: {
    color: '#FFFFFF',
  },
  // Mobile Multi-Tier Toolbar
  mobileToolbarContainer: {
    gap: 8,
  },
  mobileToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  mobileBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Desktop Toolbar
  toolBarBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  modeBadgeBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    ...shadows.sm,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionButtonGroupBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          userSelect: 'none',
        } as any)
      : null),
  },
  toolBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  toolBtnActive: {
    backgroundColor: '#0284C7',
  },
  toolBtnRadarActive: {
    backgroundColor: '#10B981',
  },
  toolBtnWarningActive: {
    backgroundColor: '#EF4444',
  },
  legendBarBelow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  gestureHintText: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
  legendItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#E2E8F0',
  },
});
