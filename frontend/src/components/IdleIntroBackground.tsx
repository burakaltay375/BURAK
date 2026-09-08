import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useVideoPlayer, VideoView } from "expo-video";

import { resolveApiUrl, type Hotel } from "@/src/api";
import { COLORS } from "@/src/theme";

const DEFAULT_IDLE_DELAY_MS = 7_000;
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introUrl = resolveApiUrl(hotel?.intro_video_url);

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
    timerRef.current = setTimeout(() => setIsIdle(Boolean(introUrl)), IDLE_DELAY_MS);
  }, [clearIdleTimer, introUrl, stopIntro]);

  useEffect(() => {
    player.pause();
    player.currentTime = 0;
    player.replace(introUrl);
    resetIdleTimer();
    return clearIdleTimer;
  }, [clearIdleTimer, introUrl, player, resetIdleTimer]);

  useEffect(() => {
    if (!isIdle || !introUrl) {
      player.pause();
      return;
    }
    player.currentTime = 0;
    player.muted = true;
    player.loop = true;
    player.play();
  }, [introUrl, isIdle, player]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const events = ["mousemove", "mousedown", "click", "touchstart", "keydown", "wheel"] as const;
    events.forEach((event) => document.addEventListener(event, resetIdleTimer, { passive: true, capture: true }));
    return () => {
      events.forEach((event) => document.removeEventListener(event, resetIdleTimer, { capture: true }));
    };
  }, [resetIdleTimer]);

  return (
    <View style={styles.root} testID="idle-intro-shell" onTouchStart={resetIdleTimer}>
      <View pointerEvents="none" style={styles.baseBackground}>
        {background}
      </View>
      {isIdle && introUrl && (
        <View
          pointerEvents="none"
          style={styles.mediaLayer}
          testID="idle-intro-background"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <VideoView
            key={`${hotel?.id ?? "hotel"}:${introUrl}`}
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
