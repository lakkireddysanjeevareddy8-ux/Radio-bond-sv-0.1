import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  BathroomDimensions,
  BathroomDoorConfig,
  BathroomWindowConfig,
  DEFAULT_WINDOW_CONFIG,
  DevicePlacement,
  DoorWall,
  DoorMaterial,
  DoorSwing,
  Bathroom3DConfig,
  DEFAULT_BATHROOM_CONFIG,
} from '../types/bathroom';
import { Bathroom3DCanvas } from '../components/Bathroom3DCanvas';
import {
  RadarSimulatedNotice,
  RadarSpecsPills,
} from '../components/RadarVolumetricVisualization';
import { BathroomPlacementEngine } from '../services/BathroomPlacementEngine';
import { BathroomConfigService } from '../services/BathroomConfigService';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { colors, typography, spacing, borderRadius, shadows, TOUCH_TARGET } from '../utils/theme';
import {
  ArrowLeft,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Info,
  Save,
  Compass,
  Sliders,
  Maximize2,
  DoorOpen,
  DoorClosed,
  ChevronRight,
  Radio,
  Layers,
  CheckCircle2,
  HelpCircle,
  Activity,
} from 'lucide-react-native';

type SetupStep = 1 | 2 | 3 | 4 | 5 | 6;

// Format 3D wall enum to Front, Back, Right, Left for clear user-facing labels
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

export const BathroomDesignerScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { activeDeviceId, devices } = useDeviceStore();
  const targetDeviceId = route.params?.deviceId || activeDeviceId;
  const activeDevice = devices.find((d) => d.deviceId === targetDeviceId) || devices[0];
  const liveTelemetry = activeDevice?.telemetry;

  // Step indicator state
  const [currentStep, setCurrentStep] = useState<SetupStep>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Configuration state
  const [dimensions, setDimensions] = useState<BathroomDimensions>(DEFAULT_BATHROOM_CONFIG.dimensions);
  const [door, setDoor] = useState<BathroomDoorConfig>(DEFAULT_BATHROOM_CONFIG.door);
  const [windowConfig, setWindowConfig] = useState<BathroomWindowConfig>(DEFAULT_WINDOW_CONFIG);
  const [device, setDevice] = useState<DevicePlacement>(DEFAULT_BATHROOM_CONFIG.device);

  // Dimension text inputs
  const [lengthInput, setLengthInput] = useState(String(DEFAULT_BATHROOM_CONFIG.dimensions.length));
  const [widthInput, setWidthInput] = useState(String(DEFAULT_BATHROOM_CONFIG.dimensions.width));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_BATHROOM_CONFIG.dimensions.height));
  const [doorWidthInput, setDoorWidthInput] = useState(String(DEFAULT_BATHROOM_CONFIG.door.width));
  const [dimensionError, setDimensionError] = useState<string | null>(null);

  // Load existing configuration on mount
  useEffect(() => {
    let isMounted = true;
    BathroomConfigService.loadConfig(targetDeviceId).then((loaded) => {
      if (isMounted && loaded) {
        setDimensions(loaded.dimensions);
        setDoor(loaded.door);
        if (loaded.window) {
          setWindowConfig(loaded.window);
        }
        setDevice(loaded.device);
        setLengthInput(String(loaded.dimensions.length));
        setWidthInput(String(loaded.dimensions.width));
        setHeightInput(String(loaded.dimensions.height));
        setDoorWidthInput(String(loaded.door.width));
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [targetDeviceId]);

  // Real-time radar coverage statistics
  const coverageStats = useMemo(() => {
    return BathroomPlacementEngine.evaluatePlacement(dimensions, door, device);
  }, [dimensions, door, device]);

  // Smart placement recommendation
  const smartRecommendation = useMemo(() => {
    return BathroomPlacementEngine.getBestRecommendation(dimensions, door);
  }, [dimensions, door]);

  // Dimension validation
  const validateAndApplyDimensions = () => {
    const l = parseFloat(lengthInput);
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);

    if (isNaN(l) || l < 1.2 || l > 10.0) {
      setDimensionError('Length must be between 1.2m and 10.0m');
      return false;
    }
    if (isNaN(w) || w < 1.0 || w > 10.0) {
      setDimensionError('Width must be between 1.0m and 10.0m');
      return false;
    }
    if (isNaN(h) || h < 1.8 || h > 4.5) {
      setDimensionError('Ceiling height must be between 1.8m and 4.5m');
      return false;
    }

    setDimensionError(null);
    setDimensions({ length: Math.round(l * 10) / 10, width: Math.round(w * 10) / 10, height: Math.round(h * 10) / 10 });
    return true;
  };

  const handleApplyPreset = (l: number, w: number, h: number) => {
    setLengthInput(String(l));
    setWidthInput(String(w));
    setHeightInput(String(h));
    setDimensionError(null);
    setDimensions({ length: l, width: w, height: h });
  };

  const handleApplySmartRecommendation = () => {
    const rec = smartRecommendation.best;
    setDevice({
      wall: rec.wall,
      mountingHeight: rec.mountingHeight,
      offsetRatio: rec.offsetRatio,
      yawAngleDeg: rec.yawAngleDeg,
      pitchAngleDeg: -10,
    });
  };

  /**
   * When door location changes in Step 2, update the door wall ONLY.
   * The device stays in its configured position unless the user explicitly moves it.
   */
  const handleSelectDoorWall = (newDoorWall: DoorWall) => {
    setDoor((d) => ({ ...d, wall: newDoorWall }));
  };

  const handleSaveConfiguration = async () => {
    setIsSaving(true);
    const configToSave: Bathroom3DConfig = {
      id: `bth-${Date.now()}`,
      deviceId: targetDeviceId,
      name: 'Master Bathroom',
      dimensions,
      door,
      window: windowConfig,
      device,
      stats: coverageStats,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await BathroomConfigService.saveConfig(configToSave, targetDeviceId);
    setIsSaving(false);

    if (result.success) {
      setSaveSuccess(true);
      setTimeout(() => {
        Alert.alert(
          'Bathroom Setup Saved',
          `WSG-01 3D layout saved successfully.${result.cloudSynced ? ' Synced to cloud.' : ' Saved on device.'}\n\nRecommended Mounting: ${device.wall} Wall at ${device.mountingHeight}m height.`,
          [{ text: 'Done', onPress: () => navigation.goBack() }]
        );
      }, 300);
    } else {
      Alert.alert('Error', result.error || 'Failed to save configuration');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading 3D Bathroom Studio...</Text>
      </View>
    );
  }

  const stepTitles = [
    'Room Dimensions',
    'Door Position',
    '3D Bathroom',
    'WSG-01 Placement',
    'Radar Coverage',
    'Review & Save',
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Smart Bathroom Designer</Text>
          <Text style={styles.headerSubtitle}>
            Step {currentStep} of 6: {stepTitles[currentStep - 1]}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.autoSuggestBtn}
          onPress={handleApplySmartRecommendation}
          accessibilityLabel="Auto-Optimize Placement"
        >
          <Sparkles size={16} color="#0284C7" />
          <Text style={styles.autoSuggestText}>Auto-Fit</Text>
        </TouchableOpacity>
      </View>

      {/* Step Progress Indicator */}
      <View style={styles.progressBarContainer}>
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <TouchableOpacity
            key={step}
            style={[
              styles.progressSegment,
              step === currentStep && styles.progressSegmentActive,
              step < currentStep && styles.progressSegmentCompleted,
            ]}
            onPress={() => {
              if (step === 1 || validateAndApplyDimensions()) {
                setCurrentStep(step as SetupStep);
              }
            }}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Interactive 3D Viewport (Always visible for real-time visual feedback) */}
        <View style={styles.viewportCard}>
          <Bathroom3DCanvas
            dimensions={dimensions}
            door={door}
            window={windowConfig}
            device={device}
            onDeviceChange={setDevice}
            showRadar={true}
            onDoorToggle={() => setDoor((d) => ({ ...d, isOpen: !d.isOpen }))}
            height={380}
          />
          <View style={styles.statsBadgeRow}>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Coverage</Text>
              <Text style={styles.statPillValue}>{coverageStats.interiorCoveragePct}%</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Door Leak Risk</Text>
              <Text
                style={[
                  styles.statPillValue,
                  coverageStats.doorBleedRisk === 'HIGH' && { color: '#EF4444' },
                  coverageStats.doorBleedRisk === 'MEDIUM' && { color: '#F59E0B' },
                  coverageStats.doorBleedRisk === 'LOW' && { color: '#10B981' },
                  coverageStats.doorBleedRisk === 'NONE' && { color: '#059669' },
                ]}
              >
                {coverageStats.doorBleedRisk}
              </Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statPillLabel}>Setup Score</Text>
              <Text style={[styles.statPillValue, { color: colors.primary }]}>
                {coverageStats.overallScore}/100
              </Text>
            </View>
          </View>
        </View>

        {/* ================= STEP 1: DIMENSIONS ================= */}
        {currentStep === 1 && (
          <View style={styles.stepSection}>
            <Text style={styles.sectionHeading}>Step 1: Bathroom Dimensions</Text>
            <Text style={styles.sectionDescription}>
              Enter your bathroom's rough measurements. The 3D room will scale automatically.
            </Text>

            {/* Quick Presets with Dynamic Highlighting */}
            {(() => {
              const isCompact =
                Math.abs(dimensions.length - 1.8) < 0.15 && Math.abs(dimensions.width - 1.5) < 0.15;
              const isStandard =
                Math.abs(dimensions.length - 2.4) < 0.15 && Math.abs(dimensions.width - 1.8) < 0.15;
              const isSpacious =
                Math.abs(dimensions.length - 3.2) < 0.15 && Math.abs(dimensions.width - 2.4) < 0.15;

              return (
                <View style={styles.presetRow}>
                  <TouchableOpacity
                    style={[styles.presetButton, isCompact && styles.presetButtonActive]}
                    onPress={() => handleApplyPreset(1.8, 1.5, 2.7)}
                  >
                    <Text
                      style={[
                        styles.presetButtonTitle,
                        isCompact && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      Compact
                    </Text>
                    <Text style={styles.presetButtonSubtitle}>1.8m × 1.5m</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetButton, isStandard && styles.presetButtonActive]}
                    onPress={() => handleApplyPreset(2.4, 1.8, 2.7)}
                  >
                    <Text
                      style={[
                        styles.presetButtonTitle,
                        isStandard && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      Standard
                    </Text>
                    <Text style={styles.presetButtonSubtitle}>2.4m × 1.8m</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetButton, isSpacious && styles.presetButtonActive]}
                    onPress={() => handleApplyPreset(3.2, 2.4, 2.7)}
                  >
                    <Text
                      style={[
                        styles.presetButtonTitle,
                        isSpacious && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      Spacious
                    </Text>
                    <Text style={styles.presetButtonSubtitle}>3.2m × 2.4m</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* Dimension Inputs */}
            <View style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Length (Depth)</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    value={lengthInput}
                    onChangeText={(val) => {
                      setLengthInput(val);
                      const n = parseFloat(val);
                      if (!isNaN(n) && n >= 1.2 && n <= 10) {
                        setDimensions((d) => ({ ...d, length: n }));
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="2.4"
                  />
                  <Text style={styles.inputUnit}>meters</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Width</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    value={widthInput}
                    onChangeText={(val) => {
                      setWidthInput(val);
                      const n = parseFloat(val);
                      if (!isNaN(n) && n >= 1.0 && n <= 10) {
                        setDimensions((d) => ({ ...d, width: n }));
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="1.8"
                  />
                  <Text style={styles.inputUnit}>meters</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Height (Floor to Ceiling)</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    value={heightInput}
                    onChangeText={(val) => {
                      setHeightInput(val);
                      const n = parseFloat(val);
                      if (!isNaN(n) && n >= 1.8 && n <= 4.5) {
                        setDimensions((d) => ({ ...d, height: n }));
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="2.7"
                  />
                  <Text style={styles.inputUnit}>meters</Text>
                </View>
              </View>
            </View>

            {dimensionError && (
              <View style={styles.errorBanner}>
                <AlertTriangle size={16} color="#DC2626" />
                <Text style={styles.errorBannerText}>{dimensionError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.primaryNextBtn}
              onPress={() => {
                if (validateAndApplyDimensions()) {
                  setCurrentStep(2);
                }
              }}
            >
              <Text style={styles.primaryNextBtnText}>Next: Door Position</Text>
              <ChevronRight size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* ================= STEP 2: DOOR POSITION ================= */}
        {currentStep === 2 && (
          <View style={styles.stepSection}>
            <Text style={styles.sectionHeading}>Step 2: Bathroom Door</Text>
            <Text style={styles.sectionDescription}>
              Select which wall the bathroom entry door is located on and how it swings.
            </Text>

            {/* 4-Wall Selector Grid (Front, Back, Right, Left) */}
            <Text style={styles.subHeading}>Door Location Wall</Text>
            <View style={styles.wallSelectorGrid}>
              {[
                { id: 'TOP' as DoorWall, label: 'Front Wall' },
                { id: 'BOTTOM' as DoorWall, label: 'Back Wall' },
                { id: 'RIGHT' as DoorWall, label: 'Right Wall' },
                { id: 'LEFT' as DoorWall, label: 'Left Wall' },
              ].map(({ id: w, label }) => (
                <TouchableOpacity
                  key={w}
                  style={[styles.wallChoiceCard, door.wall === w && styles.wallChoiceCardActive]}
                  onPress={() => handleSelectDoorWall(w)}
                >
                  <Text style={[styles.wallChoiceText, door.wall === w && styles.wallChoiceTextActive]}>
                    {label}
                  </Text>
                  {door.wall === w && <Check size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Door Material & Width */}
            <View style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Door Position Along Wall</Text>
                <View style={styles.buttonSegmentRow}>
                  {[
                    { ratio: 0.25, label: 'Left (25%)' },
                    { ratio: 0.5, label: 'Center (50%)' },
                    { ratio: 0.75, label: 'Right (75%)' },
                  ].map((pos) => (
                    <TouchableOpacity
                      key={pos.ratio}
                      style={[
                        styles.segmentBtn,
                        Math.abs(door.positionRatio - pos.ratio) < 0.05 && styles.segmentBtnActive,
                      ]}
                      onPress={() => setDoor((d) => ({ ...d, positionRatio: pos.ratio }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          Math.abs(door.positionRatio - pos.ratio) < 0.05 && styles.segmentBtnTextActive,
                        ]}
                      >
                        {pos.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Door Width</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    value={doorWidthInput}
                    onChangeText={(val) => {
                      setDoorWidthInput(val);
                      const n = parseFloat(val);
                      if (!isNaN(n) && n >= 0.6 && n <= 1.2) {
                        setDoor((d) => ({ ...d, width: n }));
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="0.8"
                  />
                  <Text style={styles.inputUnit}>meters</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Door Material (Affects 24GHz RF Penetration)</Text>
                <View style={styles.buttonSegmentRow}>
                  {(['WOOD', 'GLASS', 'METAL', 'OTHER'] as DoorMaterial[]).map((mat) => (
                    <TouchableOpacity
                      key={mat}
                      style={[styles.segmentBtn, door.material === mat && styles.segmentBtnActive]}
                      onPress={() => setDoor((d) => ({ ...d, material: mat }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          door.material === mat && styles.segmentBtnTextActive,
                        ]}
                      >
                        {mat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Door Swing Direction</Text>
                <View style={styles.buttonSegmentRow}>
                  {(
                    [
                      { id: 'INSIDE_LEFT', label: 'In-Left' },
                      { id: 'INSIDE_RIGHT', label: 'In-Right' },
                      { id: 'OUTSIDE_LEFT', label: 'Out-Left' },
                    ] as { id: DoorSwing; label: string }[]
                  ).map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.segmentBtn, door.swing === s.id && styles.segmentBtnActive]}
                      onPress={() => setDoor((d) => ({ ...d, swing: s.id }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          door.swing === s.id && styles.segmentBtnTextActive,
                        ]}
                      >
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Window Configuration Section */}
            <Text style={[styles.subHeading, { marginTop: 18 }]}>Bathroom Window</Text>
            <Text style={[styles.sectionDescription, { marginBottom: 10 }]}>
              Position the bathroom ventilation or privacy window in 3D.
            </Text>

            <View style={styles.wallSelectorGrid}>
              {[
                { id: 'LEFT' as DoorWall, label: 'Left Wall' },
                { id: 'RIGHT' as DoorWall, label: 'Right Wall' },
                { id: 'TOP' as DoorWall, label: 'Front Wall' },
                { id: 'BOTTOM' as DoorWall, label: 'Back Wall' },
              ].map(({ id: w, label }) => (
                <TouchableOpacity
                  key={w}
                  style={[styles.wallChoiceCard, windowConfig.wall === w && styles.wallChoiceCardActive]}
                  onPress={() => setWindowConfig((win) => ({ ...win, wall: w }))}
                >
                  <Text style={[styles.wallChoiceText, windowConfig.wall === w && styles.wallChoiceTextActive]}>
                    {label}
                  </Text>
                  {windowConfig.wall === w && <Check size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Window Position Along Wall</Text>
                <View style={styles.buttonSegmentRow}>
                  {[
                    { ratio: 0.25, label: 'Left (25%)' },
                    { ratio: 0.5, label: 'Center (50%)' },
                    { ratio: 0.8, label: 'Right (80%)' },
                  ].map((pos) => (
                    <TouchableOpacity
                      key={pos.ratio}
                      style={[
                        styles.segmentBtn,
                        Math.abs(windowConfig.positionRatio - pos.ratio) < 0.08 && styles.segmentBtnActive,
                      ]}
                      onPress={() => setWindowConfig((win) => ({ ...win, positionRatio: pos.ratio }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          Math.abs(windowConfig.positionRatio - pos.ratio) < 0.08 && styles.segmentBtnTextActive,
                        ]}
                      >
                        {pos.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Window Width</Text>
                <View style={styles.buttonSegmentRow}>
                  {[0.5, 0.7, 0.9].map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={[
                        styles.segmentBtn,
                        Math.abs(windowConfig.width - w) < 0.05 && styles.segmentBtnActive,
                      ]}
                      onPress={() => setWindowConfig((win) => ({ ...win, width: w }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          Math.abs(windowConfig.width - w) < 0.05 && styles.segmentBtnTextActive,
                        ]}
                      >
                        {w}m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCurrentStep(1)}>
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryNextBtn} onPress={() => setCurrentStep(3)}>
                <Text style={styles.primaryNextBtnText}>Next: 3D Bathroom</Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= STEP 3: 3D GENERATION & FIXTURES ================= */}
        {currentStep === 3 && (
          <View style={styles.stepSection}>
            <Text style={styles.sectionHeading}>Step 3: 3D Bathroom Generated</Text>
            <Text style={styles.sectionDescription}>
              Your bathroom has been automatically modeled with toilet, vanity sink, and shower area based on {dimensions.length}m × {dimensions.width}m dimensions.
            </Text>

            <View style={styles.infoCard}>
              <Info size={18} color="#0284C7" />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoCardTitle}>Interactive 3D Controls</Text>
                <Text style={styles.infoCardText}>
                  • Drag with your finger to rotate 360° around the bathroom.{'\n'}
                  • Tap the Eye button for Top-Down plan view.{'\n'}
                  • Tap the Layers button to toggle cutaway wall visibility.
                </Text>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCurrentStep(2)}>
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryNextBtn} onPress={() => setCurrentStep(4)}>
                <Text style={styles.primaryNextBtnText}>Next: Device Placement</Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= STEP 4: WSG-01 PLACEMENT ================= */}
        {currentStep === 4 && (
          <View style={styles.stepSection}>
            <Text style={styles.sectionHeading}>Step 4: WSG-01 Placement</Text>
            <Text style={styles.sectionDescription}>
              Choose which wall to mount your WSG-01 device on, and adjust mounting height.
            </Text>

            {/* Smart Auto-Suggest Banner */}
            <TouchableOpacity
              style={styles.smartSuggestBanner}
              onPress={handleApplySmartRecommendation}
            >
              <Sparkles size={18} color="#0284C7" />
              <View style={{ flex: 1 }}>
                <Text style={styles.smartSuggestTitle}>Recommended Placement</Text>
                <Text style={styles.smartSuggestDescription}>
                  {smartRecommendation.summaryAdvice}
                </Text>
              </View>
              <View style={styles.applyBtnPill}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </View>
            </TouchableOpacity>

            {/* Mounting Wall Selector (Front, Back, Right, Left) */}
            <Text style={styles.subHeading}>Mounting Wall</Text>
            <View style={styles.wallSelectorGrid}>
              {[
                { id: 'TOP' as DoorWall, label: 'Front Wall' },
                { id: 'BOTTOM' as DoorWall, label: 'Back Wall' },
                { id: 'RIGHT' as DoorWall, label: 'Right Wall' },
                { id: 'LEFT' as DoorWall, label: 'Left Wall' },
              ].map(({ id: w, label }) => {
                const isDoorWall = door.wall === w;
                return (
                  <TouchableOpacity
                    key={w}
                    style={[
                      styles.wallChoiceCard,
                      device.wall === w && styles.wallChoiceCardActive,
                    ]}
                    onPress={() => {
                      const optimal = BathroomPlacementEngine.getBestPlacementForWall(dimensions, door, w);
                      optimal.mountingHeight = device.mountingHeight;
                      setDevice(optimal);
                    }}
                  >
                    <Text
                      style={[
                        styles.wallChoiceText,
                        device.wall === w && styles.wallChoiceTextActive,
                      ]}
                    >
                      {label} {isDoorWall ? '(Door Wall)' : ''}
                    </Text>
                    {device.wall === w && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Height & Horizontal Position Presets */}
            <View style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Mounting Height: {device.mountingHeight.toFixed(1)}m from floor
                </Text>
                <View style={styles.buttonSegmentRow}>
                  {[1.5, 1.8, 2.0, 2.2].map((h) => (
                    <TouchableOpacity
                      key={h}
                      style={[
                        styles.segmentBtn,
                        Math.abs(device.mountingHeight - h) < 0.05 && styles.segmentBtnActive,
                      ]}
                      onPress={() => setDevice((d) => ({ ...d, mountingHeight: h }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          Math.abs(device.mountingHeight - h) < 0.05 && styles.segmentBtnTextActive,
                        ]}
                      >
                        {h}m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Wall Position (Left to Right)</Text>
                <View style={styles.buttonSegmentRow}>
                  {[
                    { ratio: 0.25, label: 'Left (25%)' },
                    { ratio: 0.5, label: 'Center (50%)' },
                    { ratio: 0.75, label: 'Right (75%)' },
                  ].map((pos) => (
                    <TouchableOpacity
                      key={pos.ratio}
                      style={[
                        styles.segmentBtn,
                        Math.abs(device.offsetRatio - pos.ratio) < 0.05 && styles.segmentBtnActive,
                      ]}
                      onPress={() => setDevice((d) => ({ ...d, offsetRatio: pos.ratio }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          Math.abs(device.offsetRatio - pos.ratio) < 0.05 && styles.segmentBtnTextActive,
                        ]}
                      >
                        {pos.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Sensor Horizontal Angle: {device.yawAngleDeg > 0 ? `+${device.yawAngleDeg}°` : `${device.yawAngleDeg}°`}
                </Text>
                <View style={styles.buttonSegmentRow}>
                  {[-30, -15, 0, 15, 30].map((deg) => (
                    <TouchableOpacity
                      key={deg}
                      style={[styles.segmentBtn, device.yawAngleDeg === deg && styles.segmentBtnActive]}
                      onPress={() => setDevice((d) => ({ ...d, yawAngleDeg: deg }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          device.yawAngleDeg === deg && styles.segmentBtnTextActive,
                        ]}
                      >
                        {deg === 0 ? '0° (Center)' : `${deg}°`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Sensor Vertical Tilt: {device.pitchAngleDeg > 0 ? `+${device.pitchAngleDeg}° (Up)` : `${device.pitchAngleDeg}° (Down)`}
                </Text>
                <View style={styles.buttonSegmentRow}>
                  {[-20, -10, 0, 10].map((pitch) => (
                    <TouchableOpacity
                      key={pitch}
                      style={[styles.segmentBtn, device.pitchAngleDeg === pitch && styles.segmentBtnActive]}
                      onPress={() => setDevice((d) => ({ ...d, pitchAngleDeg: pitch }))}
                    >
                      <Text
                        style={[
                          styles.segmentBtnText,
                          device.pitchAngleDeg === pitch && styles.segmentBtnTextActive,
                        ]}
                      >
                        {pitch === 0 ? '0° (Level)' : `${pitch}°`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCurrentStep(3)}>
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryNextBtn} onPress={() => setCurrentStep(5)}>
                <Text style={styles.primaryNextBtnText}>Next: Radar Coverage</Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= STEP 5: RADAR COVERAGE & ANALYSIS ================= */}
        {currentStep === 5 && (
          <View style={styles.stepSection}>
            <Text style={styles.sectionHeading}>Step 5: 24GHz mmWave Coverage</Text>
            <Text style={styles.sectionDescription}>
              Evaluating HLK-LD2410C radar field of view (±30° azimuth) and potential doorway bleed risk.
            </Text>

            {/* Radar Hardware Specs Pills */}
            <View style={{ marginBottom: 12 }}>
              <RadarSpecsPills
                mountingHeight={device.mountingHeight}
                yawDeg={device.yawAngleDeg}
              />
            </View>

            {/* Radar Warning if bleeding */}
            {coverageStats.warningNote ? (
              <View style={styles.warningCard}>
                <AlertTriangle size={20} color="#DC2626" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningCardTitle}>Doorway Spillover Risk</Text>
                  <Text style={styles.warningCardText}>{coverageStats.warningNote}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.successCard}>
                <ShieldCheck size={20} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successCardTitle}>Safe Radar Orientation</Text>
                  <Text style={styles.successCardText}>
                    Beam is oriented away from doorway, keeping detection contained inside the bathroom.
                  </Text>
                </View>
              </View>
            )}

            {/* Simulated Model Technical Notice */}
            <View style={{ marginBottom: 12 }}>
              <RadarSimulatedNotice />
            </View>

            {/* Live Sensor Detection vs Conceptual 3D Model Status */}
            <View style={styles.inputCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Activity size={16} color={liveTelemetry?.presence ? '#10B981' : '#0284C7'} />
                  <Text style={styles.inputLabel}>
                    {liveTelemetry ? 'Physical WSG-01 Sensor Live Data' : 'Conceptual Radar Field Mode'}
                  </Text>
                </View>
                <View style={[
                  styles.sensorBadgePill,
                  liveTelemetry?.presence && styles.sensorBadgeActive,
                ]}>
                  <Text style={styles.sensorBadgeText}>
                    {liveTelemetry ? (liveTelemetry.presence ? 'TARGET DETECTED' : 'AREA CLEAR') : 'THEORETICAL FOV'}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10, lineHeight: 17 }}>
                {liveTelemetry
                  ? 'Real-time telemetry reported from physical LD2410C 24GHz FMCW sensor over BLE/Wi-Fi.'
                  : 'Displaying simulated 60° azimuth theoretical coverage volume. Actual sensor sensitivity and gate energy thresholds can be fine-tuned per bathroom.'}
              </Text>

              <View style={styles.buttonSegmentRow}>
                <View style={[styles.segmentBtn, { backgroundColor: '#F8FAFC' }]}>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>Movement</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: liveTelemetry?.movement ? '#0284C7' : '#64748B' }}>
                    {liveTelemetry?.movement ? 'Moving' : 'Still / Clear'}
                  </Text>
                </View>
                <View style={[styles.segmentBtn, { backgroundColor: '#F8FAFC' }]}>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>Presence</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: liveTelemetry?.presence ? '#10B981' : '#64748B' }}>
                    {liveTelemetry?.presence ? 'Occupied' : 'Vacant'}
                  </Text>
                </View>
                <View style={[styles.segmentBtn, { backgroundColor: '#F8FAFC' }]}>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>Stillness</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>
                    {liveTelemetry?.stillnessSeconds ? `${liveTelemetry.stillnessSeconds}s` : '0s'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Volumetric Coverage Zones Breakdown */}
            <View style={styles.inputCard}>
              <View style={styles.coverageBreakdownRow}>
                <View style={[styles.colorIndicator, { backgroundColor: '#10B981' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownTitle}>Core Stillness Zone (&lt; 1.8m)</Text>
                  <Text style={styles.breakdownSub}>
                    High-sensitivity respiration and subtle micromovement detection (toilet & bath area).
                  </Text>
                </View>
              </View>

              <View style={styles.coverageBreakdownRow}>
                <View style={[styles.colorIndicator, { backgroundColor: '#06B6D4' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownTitle}>Body Motion Zone (1.8m - 3.0m)</Text>
                  <Text style={styles.breakdownSub}>
                    Active human walking and gross movement detection.
                  </Text>
                </View>
              </View>

              <View style={styles.coverageBreakdownRow}>
                <View style={[styles.colorIndicator, { backgroundColor: '#F59E0B' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownTitle}>Edge Motion Zone (3.0m - 4.0m)</Text>
                  <Text style={styles.breakdownSub}>
                    Perimeter motion tracking with moderate gate energy threshold.
                  </Text>
                </View>
              </View>

              <View style={styles.coverageBreakdownRow}>
                <View style={[styles.colorIndicator, { backgroundColor: '#F97316' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownTitle}>Fringe Boundary (4.0m - 4.8m)</Text>
                  <Text style={styles.breakdownSub}>
                    Outer radar range limit where signal attenuates before room boundary.
                  </Text>
                </View>
              </View>

              <View style={styles.coverageBreakdownRow}>
                <View style={[styles.colorIndicator, { backgroundColor: '#EF4444' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.breakdownTitle}>Doorway Spillover Risk (Red)</Text>
                  <Text style={styles.breakdownSub}>
                    Area outside the door where hallway foot traffic could trigger false alarms.
                  </Text>
                </View>
              </View>
            </View>

            {/* Technical Realistic Notice */}
            <View style={styles.technicalDisclaimerCard}>
              <Text style={styles.disclaimerHeading}>Technical Engineering Note</Text>
              <Text style={styles.disclaimerText}>
                The 3D radar cone is a simulated volumetric model based on HLK-LD2410C manufacturer specs. 24 GHz millimeter radio waves can partially penetrate lightweight wood, drywall, and glass. Software models cannot guarantee zero transmission. In-room calibration is recommended to fine-tune gate sensitivity.
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCurrentStep(4)}>
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryNextBtn} onPress={() => setCurrentStep(6)}>
                <Text style={styles.primaryNextBtnText}>Next: Review & Save</Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= STEP 6: REVIEW & SAVE ================= */}
        {currentStep === 6 && (
          <View style={styles.stepSection}>
            <Text style={styles.sectionHeading}>Step 6: Review & Save Setup</Text>
            <Text style={styles.sectionDescription}>
              Confirm your bathroom layout and WSG-01 installation specifications.
            </Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Bathroom Dimensions</Text>
                <Text style={styles.summaryValue}>
                  {dimensions.length}m L × {dimensions.width}m W × {dimensions.height}m H
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Door Position</Text>
                <Text style={styles.summaryValue}>
                  {formatWallName(door.wall)} Wall ({door.width}m {door.material.toLowerCase()})
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Window Position</Text>
                <Text style={styles.summaryValue}>
                  {formatWallName(windowConfig.wall)} Wall ({windowConfig.width}m)
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>WSG-01 Mounting</Text>
                <Text style={styles.summaryValue}>
                  {formatWallName(device.wall)} Wall at {device.mountingHeight}m
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sensor Orientation</Text>
                <Text style={styles.summaryValue}>
                  {device.yawAngleDeg === 0 ? 'Centered (0°)' : `${device.yawAngleDeg}° yaw`} • {device.pitchAngleDeg}° tilt
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Estimated Coverage</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>
                  {coverageStats.interiorCoveragePct}%
                </Text>
              </View>
              <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.summaryLabel}>Corridor Spillover Risk</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    {
                      color:
                        coverageStats.doorBleedRisk === 'HIGH'
                          ? '#EF4444'
                          : coverageStats.doorBleedRisk === 'NONE'
                          ? '#059669'
                          : '#F59E0B',
                    },
                  ]}
                >
                  {coverageStats.doorBleedRisk}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveMainBtn, isSaving && { opacity: 0.7 }]}
              onPress={handleSaveConfiguration}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={18} color="#FFFFFF" />
                  <Text style={styles.saveMainBtnText}>Save Bathroom Configuration</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setCurrentStep(5)}
              disabled={isSaving}
            >
              <Text style={styles.secondaryBtnText}>Back to Radar Analysis</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  autoSuggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  autoSuggestText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  progressBarContainer: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  progressSegmentActive: {
    backgroundColor: colors.primary,
  },
  progressSegmentCompleted: {
    backgroundColor: '#0284C7',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  viewportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...shadows.sm,
  },
  statsBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statPill: {
    alignItems: 'center',
  },
  statPillLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statPillValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  stepSection: {
    gap: 14,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  subHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    ...shadows.sm,
  },
  presetButtonActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDFA',
  },
  presetButtonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  presetButtonSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    ...shadows.sm,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: borderRadius.md,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  inputUnit: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  wallSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wallChoiceCard: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.sm,
  },
  wallChoiceCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDFA',
  },
  wallChoiceText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  wallChoiceTextActive: {
    color: colors.primary,
  },
  buttonSegmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    minWidth: 65,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  smartSuggestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: borderRadius.md,
    padding: 12,
  },
  smartSuggestTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  smartSuggestDescription: {
    fontSize: 12,
    color: '#0284C7',
    marginTop: 2,
    lineHeight: 16,
  },
  applyBtnPill: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  applyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  infoCardText: {
    fontSize: 12,
    color: '#0284C7',
    marginTop: 4,
    lineHeight: 18,
  },
  warningCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: borderRadius.md,
    padding: 12,
  },
  warningCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  warningCardText: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
    lineHeight: 16,
  },
  successCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.md,
    padding: 12,
  },
  successCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  successCardText: {
    fontSize: 12,
    color: '#065F46',
    marginTop: 2,
    lineHeight: 16,
  },
  coverageBreakdownRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  colorIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  breakdownSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 16,
  },
  technicalDisclaimerCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    padding: 12,
  },
  disclaimerHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#64748B',
    marginBottom: 4,
  },
  disclaimerText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 17,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  primaryNextBtn: {
    flex: 2,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...shadows.sm,
  },
  primaryNextBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveMainBtn: {
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...shadows.md,
  },
  saveMainBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  sensorBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  sensorBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  sensorBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#0F172A',
  },
});
