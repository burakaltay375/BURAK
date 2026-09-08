import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useVideoPlayer, VideoView } from "expo-video";

import { resolveApiUrl, type Hotel } from "@/src/api";
import { COLORS } from "@/src/theme";

const DEFAULT_IDLE_DELAY_MS = 15_000;
const IDLE_DELAY_MS = Math.max(
  Number(process.env.EXPO_PUBLIC_INTRO_IDLE_MS) || DEFAULT_IDLE_DELAY_MS,
  1_000,
);

type Props = {
  children: ReactNode;
  hotel: Hotel | null | undefined;
  background?: ReactNode;
};

export default function IdleIntroBackground({ children, hotel, background }: Props) {
  const [showIntro, setShowIntro] = useState(false);
  const showIntroRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedSinceInteractionRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const introUrl = resolveApiUrl(hotel?.intro_video_url);

  const player = useVideoPlayer(introUrl, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });

  const clearIdleTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const hideIntro = useCallback(() => {
    showIntroRef.current = false;
    setShowIntro(false);
    player.pause();
    player.currentTime = 0;
  }, [player]);

  const startIntro = useCallback(() => {
    if (!introUrl || playedSinceInteractionRef.current) return;
    playedSinceInteractionRef.current = true;
    showIntroRef.current = true;
    setShowIntro(true);
    player.currentTime = 0;
    player.muted = true;
    player.loop = false;
    player.play();
  }, [introUrl, player]);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!introUrl || playedSinceInteractionRef.current) return;
    timerRef.current = setTimeout(startIntro, IDLE_DELAY_MS);
  }, [clearIdleTimer, introUrl, startIntro]);

  const handleInteraction = useCallback(() => {
    clearIdleTimer();
    if (showIntroRef.current) hideIntro();
    playedSinceInteractionRef.current = false;
    armIdleTimer();
  }, [armIdleTimer, clearIdleTimer, hideIntro]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const previous = lastPointerRef.current;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    if (
      previous &&
      Math.abs(previous.x - event.clientX) < 4 &&
      Math.abs(previous.y - event.clientY) < 4
    ) {
      return;
    }
    handleInteraction();
  }, [handleInteraction]);

  useEffect(() => {
    hideIntro();
    playedSinceInteractionRef.current = false;
    armIdleTimer();
    return clearIdleTimer;
  }, [armIdleTimer, clearIdleTimer, hideIntro]);

  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      clearIdleTimer();
      hideIntro();
      // Do not re-arm here. A new user interaction starts the next idle cycle,
      // which prevents the intro looping forever while nobody is present.
    });
    return () => subscription.remove();
  }, [clearIdleTimer, hideIntro, player]);

  useEffect(() => {
    if (!showIntro) return;
    // expo-video's playToEnd event is not reliable in every web browser.
    // The backend already records the validated media duration, so use it
    // as a bounded fallback without changing the existing API.
    const durationSeconds = Math.min(
      Math.max(hotel?.intro_video_duration ?? 300, 1),
      300,
    );
    const fallback = setTimeout(hideIntro, (durationSeconds + 0.75) * 1_000);
    return () => clearTimeout(fallback);
  }, [hideIntro, hotel?.intro_video_duration, showIntro]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    // `scroll` can fire after layout/data refreshes without user input. Wheel,
    // touch and pointer events still cover real scrolling without allowing the
    // dashboard's periodic refresh to keep resetting the idle timer.
    const events = ["mousedown", "click", "touchstart", "touchmove", "pointerdown", "keydown", "wheel"] as const;
    document.addEventListener("mousemove", handleMouseMove, { passive: true, capture: true });
    events.forEach((event) => document.addEventListener(event, handleInteraction, { passive: true, capture: true }));
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, { capture: true });
      events.forEach((event) => document.removeEventListener(event, handleInteraction, { capture: true }));
    };
  }, [handleInteraction, handleMouseMove]);

  return (
    <View style={styles.root} testID="idle-intro-shell">
      <View pointerEvents="none" style={styles.baseBackground}>
        {background}
      </View>
      {showIntro && introUrl && (
        <View
          pointerEvents="none"
          style={styles.mediaLayer}
          testID="idle-intro-background"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <VideoView player={player} style={styles.video} nativeControls={false} contentFit="cover" />
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.dimOverlay} />
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface, overflow: "hidden" },
  baseBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.surface },
  mediaLayer: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  video: { ...StyleSheet.absoluteFillObject, transform: [{ scale: 1.04 }] },
  dimOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.42)" },
  content: { flex: 1, zIndex: 1 },
});
