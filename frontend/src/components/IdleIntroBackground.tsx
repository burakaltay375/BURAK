import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { usePathname } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { api, resolveApiUrl, type Hotel } from "@/src/api";
import { useAuth } from "@/src/auth";
import { COLORS } from "@/src/theme";

const DEFAULT_IDLE_DELAY_MS = 15_000;
const IDLE_DELAY_MS = Math.max(
  Number(process.env.EXPO_PUBLIC_INTRO_IDLE_MS) || DEFAULT_IDLE_DELAY_MS,
  1_000,
);

type Props = {
  children: ReactNode;
  homePath: string;
};

export default function IdleIntroBackground({ children, homePath }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const showIntroRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedSinceInteractionRef = useRef(false);
  const isHome = pathname === homePath;
  const hotelId = user?.hotel_id || user?.hotelId || null;
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
    if (!introUrl || !isHome || playedSinceInteractionRef.current) return;
    playedSinceInteractionRef.current = true;
    showIntroRef.current = true;
    setShowIntro(true);
    player.currentTime = 0;
    player.muted = true;
    player.play();
  }, [introUrl, isHome, player]);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (!introUrl || !isHome || playedSinceInteractionRef.current) return;
    timerRef.current = setTimeout(startIntro, IDLE_DELAY_MS);
  }, [clearIdleTimer, introUrl, isHome, startIntro]);

  const handleInteraction = useCallback(() => {
    clearIdleTimer();
    if (showIntroRef.current) hideIntro();
    playedSinceInteractionRef.current = false;
    armIdleTimer();
  }, [armIdleTimer, clearIdleTimer, hideIntro]);

  useEffect(() => {
    let alive = true;
    if (!hotelId) {
      setHotel(null);
      return;
    }
    api.activeHotels()
      .then((hotels) => {
        if (alive) setHotel(hotels.find((item) => item.id === hotelId) ?? null);
      })
      .catch(() => {
        if (alive) setHotel(null);
      });
    return () => {
      alive = false;
    };
  }, [hotelId]);

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
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const events = ["mousemove", "mousedown", "click", "touchstart", "pointerdown", "scroll", "keydown", "wheel"] as const;
    events.forEach((event) => document.addEventListener(event, handleInteraction, { passive: true, capture: true }));
    return () => {
      events.forEach((event) => document.removeEventListener(event, handleInteraction, { capture: true }));
    };
  }, [handleInteraction]);

  return (
    <View style={styles.root}>
      <View style={styles.baseBackground} />
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
