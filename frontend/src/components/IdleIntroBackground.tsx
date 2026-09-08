import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useVideoPlayer, VideoView } from "expo-video";

import { resolveApiUrl, type Hotel } from "@/src/api";
import { COLORS } from "@/src/theme";

const DEFAULT_IDLE_DELAY_MS = 7_000;
const POINTER_MOVE_THRESHOLD_PX = 6;
const GLOBAL_IDLE_VIDEO = require("../../assets/videos/idle-intro.mp4");
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
  const [isIdle, setIsIdle] = useState(false);
  const [failedHotelIntroKey, setFailedHotelIntroKey] = useState<string | null>(null);
  const [globalIntroFailed, setGlobalIntroFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const hotelIntroUrl = resolveApiUrl(hotel?.intro_video_url);
  const hotelIntroKey = `${hotel?.id ?? "hotel"}:${hotelIntroUrl ?? "none"}`;
  const useGlobalIntro = !hotelIntroUrl || failedHotelIntroKey === hotelIntroKey;
  const introSource = useGlobalIntro ? GLOBAL_IDLE_VIDEO : hotelIntroUrl;
  const introSourceKey = useGlobalIntro ? "global" : hotelIntroKey;
  const introAvailable = !globalIntroFailed;

  const player = useVideoPlayer(null, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  const clearIdleTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopIntro = useCallback(() => {
    setIsIdle(false);
    player.pause();
    player.currentTime = 0;
  }, [player]);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    stopIntro();
    timerRef.current = setTimeout(() => setIsIdle(introAvailable), IDLE_DELAY_MS);
  }, [clearIdleTimer, introAvailable, stopIntro]);

  useEffect(() => {
    player.pause();
    player.currentTime = 0;
    player.replace(introSource);
  }, [introSource, player]);

  useEffect(() => {
    setIsIdle(false);
    setGlobalIntroFailed(false);
    lastPointerRef.current = null;
    resetIdleTimer();
    return clearIdleTimer;
  }, [clearIdleTimer, hotel?.id, hotelIntroUrl, resetIdleTimer]);

  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status !== "error") return;
      if (!useGlobalIntro && hotelIntroUrl) {
        setFailedHotelIntroKey(hotelIntroKey);
      } else {
        setGlobalIntroFailed(true);
        stopIntro();
      }
    });
    return () => subscription.remove();
  }, [hotelIntroKey, hotelIntroUrl, player, stopIntro, useGlobalIntro]);

  useEffect(() => {
    if (!isIdle || !introAvailable) {
      player.pause();
      return;
    }
    player.currentTime = 0;
    player.muted = true;
    player.loop = true;
    player.play();
  }, [introAvailable, introSource, isIdle, player]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const previous = lastPointerRef.current;
    if (
      previous &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < POINTER_MOVE_THRESHOLD_PX
    ) {
      return;
    }
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const events = ["mousedown", "click", "touchstart", "keydown", "wheel"] as const;
    document.addEventListener("mousemove", handleMouseMove, { passive: true, capture: true });
    events.forEach((event) => document.addEventListener(event, resetIdleTimer, { passive: true, capture: true }));
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, { capture: true });
      events.forEach((event) => document.removeEventListener(event, resetIdleTimer, { capture: true }));
    };
  }, [handleMouseMove, resetIdleTimer]);

  return (
    <View style={styles.root} testID="idle-intro-shell" onTouchStart={resetIdleTimer}>
      <View pointerEvents="none" style={styles.baseBackground}>
        {background}
      </View>
      {isIdle && introAvailable && (
        <View
          pointerEvents="none"
          style={styles.mediaLayer}
          testID="idle-intro-background"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <VideoView
            key={`${hotel?.id ?? "hotel"}:${introSourceKey}`}
            player={player}
            style={styles.video}
            nativeControls={false}
            contentFit="cover"
            playsInline
          />
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
