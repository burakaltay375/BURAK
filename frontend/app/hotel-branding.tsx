import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { api, resolveApiUrl, type Hotel } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

export default function HotelBranding() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hotelId?: string; next?: string }>();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [phase, setPhase] = useState<"loading" | "logo" | "video">("loading");
  const introUrl = resolveApiUrl(hotel?.intro_video_url);
  const player = useVideoPlayer(introUrl, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  const finish = useCallback(() => {
    const target = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/";
    router.replace(target as any);
  }, [params.next, router]);

  useEffect(() => {
    let alive = true;
    api.activeHotels()
      .then((rows) => {
        if (!alive) return;
        const selected = rows.find((item) => item.id === params.hotelId);
        if (!selected) {
          finish();
          return;
        }
        setHotel(selected);
        setPhase("logo");
      })
      .catch(finish);
    return () => { alive = false; };
  }, [finish, params.hotelId]);

  useEffect(() => {
    if (phase !== "logo" || !hotel) return;
    const timer = setTimeout(() => {
      if (hotel.intro_video_url) {
        setPhase("video");
        player.play();
      } else {
        finish();
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [finish, hotel, phase, player]);

  useEffect(() => {
    if (phase !== "video") return;
    const subscription = player.addListener("playToEnd", finish);
    const fallbackSeconds = Math.min(Math.max(hotel?.intro_video_duration ?? 300, 1) + 2, 302);
    const fallback = setTimeout(finish, fallbackSeconds * 1000);
    return () => {
      subscription.remove();
      clearTimeout(fallback);
    };
  }, [finish, hotel?.intro_video_duration, phase, player]);

  if (!hotel || phase === "loading") {
    return <View style={s.root}><ActivityIndicator color={COLORS.brand} /></View>;
  }

  const logoUrl = resolveApiUrl(hotel.logo_url);
  return (
    <View style={s.root}>
      {phase === "logo" ? (
        <>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={s.logo} contentFit="contain" /> : <Text style={s.hotelName}>{hotel.hotel_name}</Text>}
          <Text style={s.welcome}>Hoş geldiniz</Text>
        </>
      ) : (
        <>
          <VideoView player={player} style={s.video} nativeControls={false} contentFit="contain" />
          {logoUrl && <Image source={{ uri: logoUrl }} style={s.cornerLogo} contentFit="contain" />}
          <Pressable onPress={finish} style={s.skip}><Text style={s.skipText}>Atla</Text></Pressable>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, padding: SPACING.xl },
  logo: { width: "78%", height: 220 },
  hotelName: { color: COLORS.onSurface, fontSize: 32, fontWeight: "700", fontFamily: TYPE.display },
  welcome: { color: COLORS.onSurfaceTertiary, fontSize: 15, marginTop: SPACING.md },
  video: { width: "100%", maxWidth: 900, aspectRatio: 16 / 9, borderRadius: RADIUS.lg, backgroundColor: "#000" },
  cornerLogo: { position: "absolute", left: SPACING.lg, top: SPACING.lg, width: 120, height: 70 },
  skip: { position: "absolute", right: SPACING.lg, top: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  skipText: { color: COLORS.onSurface, fontWeight: "700" },
});
