import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/lib/config";

const MARK = require("../../assets/images/mark.png");

// Velvet folds, darker and lighter stripes (left curtain red, right orange)
const LEFT_FOLDS = ["#8E1A1C", "#C02A23", "#9C1F1F", "#CF3628", "#A02320", "#C52E22", "#931C1D"];
const RIGHT_FOLDS = ["#B83C0A", "#E3591A", "#C0440D", "#EE6C20", "#C4480F", "#E25C17", "#B53A0A"];

const VEIL_FADE_AT = 250;
const OPEN_AT = 700;
const OPEN_MS = 900;
const TOTAL_MS = OPEN_AT + OPEN_MS + 100;

/**
 * Launch intro: starts exactly like the native splash (mark on dark), reveals a
 * closed stage curtain, then the curtain opens onto the app. Shown once per
 * cold start; skipped when the device asks for reduced motion.
 */
export function CurtainIntro() {
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const [done, setDone] = useState(false);

  const veil = useSharedValue(1);
  const open = useSharedValue(0);
  const markScale = useSharedValue(1);
  const markOpacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    const ease = Easing.inOut(Easing.cubic);
    veil.value = withDelay(VEIL_FADE_AT, withTiming(0, { duration: 300 }));
    markScale.value = withDelay(OPEN_AT - 150, withTiming(1.3, { duration: 500, easing: ease }));
    markOpacity.value = withDelay(OPEN_AT - 50, withTiming(0, { duration: 350 }));
    open.value = withDelay(OPEN_AT, withTiming(1, { duration: OPEN_MS, easing: ease }));
    const timer = setTimeout(() => setDone(true), TOTAL_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion, veil, open, markScale, markOpacity]);

  // Panels slide out and bunch up towards the sides like gathered fabric
  const leftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -open.value * width * 0.42 }, { scaleX: 1 - open.value * 0.8 }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: open.value * width * 0.42 }, { scaleX: 1 - open.value * 0.8 }],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  if (done || reduceMotion) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.panel, styles.left, { transformOrigin: "left" }, leftStyle]}>
        {LEFT_FOLDS.map((c, i) => (
          <View key={i} style={[styles.fold, { backgroundColor: c }]} />
        ))}
        <View style={[styles.hem, { right: 0 }]} />
      </Animated.View>
      <Animated.View style={[styles.panel, styles.right, { transformOrigin: "right" }, rightStyle]}>
        <View style={[styles.hem, { left: 0 }]} />
        {RIGHT_FOLDS.map((c, i) => (
          <View key={i} style={[styles.fold, { backgroundColor: c }]} />
        ))}
      </Animated.View>

      <Animated.View style={[styles.veil, veilStyle]} />
      <Animated.View style={[styles.markWrap, markStyle]}>
        <Image source={MARK} style={styles.mark} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

const fill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  overlay: { ...fill, zIndex: 1000, elevation: 1000 },
  panel: { position: "absolute", top: 0, bottom: 0, width: "50.5%", flexDirection: "row" },
  left: { left: 0 },
  right: { right: 0 },
  fold: { flex: 1 },
  hem: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: "#FFB020", opacity: 0.85 },
  veil: { ...fill, backgroundColor: colors.background },
  markWrap: { ...fill, alignItems: "center", justifyContent: "center" },
  mark: { width: 120, height: 120 },
});
