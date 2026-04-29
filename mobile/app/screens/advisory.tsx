import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, Volume2, Check, TriangleAlert } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAnimatedAdvisory, PipelineStage } from '../../hooks';
import { COLORS, SPRING } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PIPELINE_STAGES: Array<{ id: PipelineStage; label: string; icon: string }> = [
  { id: 'data_fetched', label: 'डेटा ला रहे हैं', icon: '📡' },
  { id: 'rag_retrieved', label: 'RAG लोड हो रहा', icon: '📚' },
  { id: 'price_predicted', label: 'भाव की भविष्यवाणी', icon: '📈' },
  { id: 'advisory_generated', label: 'सलाह बना रहे हैं', icon: '🤖' },
  { id: 'guardrail_approved', label: 'सत्यापन', icon: '✓' },
];

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function AdvisoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    recording,
    pipeline,
    advisory,
    animationValues,
    actions,
  } = useAnimatedAdvisory();

  const micScale = useSharedValue(1);
  const orbPulse = useSharedValue(1);
  const sonarOpacity = useSharedValue(0);

  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.id === pipeline.stage);
  const isLoading = pipeline.isProcessing;

  useEffect(() => {
    orbPulse.value = withRepeat(
      withSequence(withSpring(1.05, SPRING.gentle), withSpring(1, SPRING.gentle)),
      -1,
      false
    );
  }, [orbPulse]);

  useEffect(() => {
    if (recording.isRecording) {
      micScale.value = withRepeat(
        withSequence(withSpring(0.95, SPRING.snappy), withSpring(1.05, SPRING.snappy)),
        -1,
        false
      );
      sonarOpacity.value = withRepeat(
        withSequence(withTiming(0.8, { duration: 1000 }), withTiming(0.3, { duration: 1000 })),
        -1,
        false
      );
    } else {
      micScale.value = withSpring(1, SPRING.snappy);
      sonarOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [recording.isRecording, micScale, sonarOpacity]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbPulse.value }],
  }));

  const sonarStyle = useAnimatedStyle(() => ({
    opacity: sonarOpacity.value,
  }));

  const handleMicPress = async () => {
    if (recording.isRecording) {
      await actions.handleMicRelease();
    } else {
      await actions.handleMicPress();
    }
  };

  const handleReset = () => {
    useAnimatedAdvisory();
  };

  const decisionText =
    advisory.advisory?.decision === 'harvest_now'
      ? 'अभी काटें'
      : advisory.advisory?.decision === 'hold_3_days'
        ? '3 दिन रुकें'
        : advisory.advisory?.decision === 'hold_7_days'
          ? '7 दिन रुकें'
          : advisory.advisory?.decision === 'redirect_mandi'
            ? 'दूसरी मंडी जाएं'
            : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <View style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>आवाज़ सलाह</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.visualization}>
          <Animated.View style={[styles.orbContainer, orbStyle]}>
            <Animated.View style={[styles.sonarRing, sonarStyle]} />
            <Animated.View style={[styles.sonarRing, styles.sonarRing2, sonarStyle]} />
            <View
              style={[
                styles.orb,
                recording.isRecording && styles.orbActive,
                isLoading && styles.orbProcessing,
              ]}
            >
              <Text style={styles.orbIcon}>
                {recording.isRecording ? '🎤' : isLoading ? '🤖' : '🌾'}
              </Text>
            </View>
          </Animated.View>

          {!recording.isRecording && !isLoading && !advisory.advisory && (
            <Text style={styles.instruction}>
              माइक्रोफोन बटन दबाएं{'\n'}अपना सवाल पूछें
            </Text>
          )}

          {recording.isRecording && (
            <Text style={styles.recordingText}>सुन रहे हैं...</Text>
          )}

          {isLoading && (
            <View style={styles.pipeline}>
              {PIPELINE_STAGES.map((stage, index) => {
                const isActive = currentStageIndex === index;
                const isCompleted = pipeline.completedStages.includes(stage.id);

                return (
                  <View key={stage.id} style={styles.pipelineStage}>
                    <View
                      style={[
                        styles.stageDot,
                        isActive && styles.stageDotActive,
                        isCompleted && styles.stageDotCompleted,
                      ]}
                    >
                      <Text style={styles.stageIcon}>{stage.icon}</Text>
                    </View>
                    <Text
                      style={[
                        styles.stageLabel,
                        isActive && styles.stageLabelActive,
                        isCompleted && styles.stageLabelCompleted,
                      ]}
                    >
                      {stage.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {advisory.advisory && (
          <ScrollView style={styles.advisoryScroll}>
            <View style={styles.advisoryCard}>
              <View style={styles.successHeader}>
                <View style={styles.successIcon}>
                  <Check size={24} color="#22C55E" />
                </View>
                <Text style={styles.successTitle}>सलाह तैयार है!</Text>
              </View>

              <View style={styles.decisionContainer}>
                <Text style={styles.decisionLabel}>निर्णय:</Text>
                <Text style={styles.decisionText}>{decisionText}</Text>
              </View>

              <View style={styles.advisoryContent}>
                <Text style={styles.advisoryTitle}>आपकी सलाह:</Text>
                <Text style={styles.advisoryText}>
                  {advisory.advisory.full_text_local || advisory.advisory.full_text_english}
                </Text>
              </View>

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>फसल</Text>
                  <Text style={styles.detailValue}>{advisory.advisory.crop}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>भाव</Text>
                  <Text style={styles.detailValue}>
                    ₹{advisory.advisory.forecast_price.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>खतरा</Text>
                  <Text style={styles.detailValue}>
                    {advisory.advisory.spoilage_risk_pct}% सड़न
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>विश्वास</Text>
                  <Text style={styles.detailValue}>
                    {Math.round(advisory.advisory.confidence * 100)}%
                  </Text>
                </View>
              </View>

              {advisory.advisory.bundle_available && (
                <View style={styles.bundleBanner}>
                  <Text style={styles.bundleText}>
                    Cooperative में ₹{advisory.advisory.bundle_saving}/quintal बचत उपलब्ध!
                  </Text>
                </View>
              )}

              {advisory.advisory.guardrail_status === 'approved' && (
                <TouchableOpacity style={styles.playButton}>
                  <Volume2 size={20} color="#FAFAFA" />
                  <Text style={styles.playButtonText}>आवाज़ सुनें</Text>
                </TouchableOpacity>
              )}

              {advisory.advisory.guardrail_status === 'review' && (
                <View style={styles.warningBanner}>
                  <TriangleAlert size={16} color="#FBBF24" />
                  <Text style={styles.warningText}>यह सलाह अभी समीक्षा में है</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      <View style={[styles.micContainer, { paddingBottom: insets.bottom + 20 }]}>
        {!advisory.advisory && (
          <AnimatedTouchable
            style={[styles.micButton, recording.isRecording && styles.micButtonActive, micStyle]}
            onPress={handleMicPress}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="large" color="#FAFAFA" />
            ) : recording.isRecording ? (
              <MicOff size={32} color="#FAFAFA" />
            ) : (
              <Mic size={32} color="#FAFAFA" />
            )}
          </AnimatedTouchable>
        )}

        {recording.isRecording && (
          <Text style={styles.hintText}>बोलने के बाद बटन दबाएं</Text>
        )}

        {advisory.advisory && (
          <TouchableOpacity style={styles.newButton} onPress={handleReset}>
            <Text style={styles.newButtonText}>नया सवाल पूछें</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.night,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    width: 24,
    height: 24,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: COLORS.white,
    transform: [{ rotate: '45deg' }],
  },
  headerTitle: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  visualization: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  sonarRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: COLORS.sprout,
  },
  sonarRing2: {
    width: 240,
    height: 240,
    borderColor: COLORS.leaf,
  },
  orb: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.forest,
    borderWidth: 2,
    borderColor: COLORS.canopy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbActive: {
    backgroundColor: '#052E16',
    borderColor: '#22C55E',
  },
  orbProcessing: {
    backgroundColor: '#111827',
    borderColor: '#3B82F6',
  },
  orbIcon: {
    fontSize: 48,
  },
  instruction: {
    color: COLORS.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  recordingText: {
    color: COLORS.sprout,
    fontFamily: 'Poppins_500Medium',
    fontSize: 18,
    marginTop: 16,
  },
  pipeline: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  pipelineStage: {
    alignItems: 'center',
    width: 70,
  },
  stageDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stageDotActive: {
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  stageDotCompleted: {
    backgroundColor: '#052E16',
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  stageIcon: {
    fontSize: 20,
  },
  stageLabel: {
    color: COLORS.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    textAlign: 'center',
  },
  stageLabelActive: {
    color: '#3B82F6',
  },
  stageLabelCompleted: {
    color: '#22C55E',
  },
  advisoryScroll: {
    flex: 1,
  },
  advisoryCard: {
    backgroundColor: COLORS.forest,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.canopy,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  successIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#052E16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: '#22C55E',
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
  },
  decisionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  decisionLabel: {
    color: COLORS.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  decisionText: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
  },
  advisoryContent: {
    backgroundColor: '#0D2B1F',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  advisoryTitle: {
    color: COLORS.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginBottom: 8,
  },
  advisoryText: {
    color: COLORS.white,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  detailItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0D2B1F',
    borderRadius: 8,
    padding: 12,
  },
  detailLabel: {
    color: COLORS.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginBottom: 4,
  },
  detailValue: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  bundleBanner: {
    backgroundColor: COLORS.harvest,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bundleText: {
    color: COLORS.night,
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    textAlign: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
  },
  playButtonText: {
    color: '#FAFAFA',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#422006',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  warningText: {
    color: '#FBBF24',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  micContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: '#EF4444',
  },
  hintText: {
    color: COLORS.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  newButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  newButtonText: {
    color: '#FAFAFA',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
});
