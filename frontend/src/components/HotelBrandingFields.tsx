import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";

import { resolveApiUrl, type UploadAsset } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Props = {
  logo: UploadAsset | null;
  intro: UploadAsset | null;
  existingLogoUrl?: string | null;
  existingIntroUrl?: string | null;
  logoRequired?: boolean;
  disabled?: boolean;
  onLogoChange: (asset: UploadAsset | null) => void;
  onIntroChange: (asset: UploadAsset | null) => void;
  onDeleteExistingLogo?: () => Promise<void>;
  onDeleteExistingIntro?: () => Promise<void>;
  onError?: (message: string) => void;
};

export default function HotelBrandingFields({
  logo,
  intro,
  existingLogoUrl,
  existingIntroUrl,
  logoRequired,
  disabled,
  onLogoChange,
  onIntroChange,
  onDeleteExistingLogo,
  onDeleteExistingIntro,
  onError,
}: Props) {
  const [deleting, setDeleting] = useState<"logo" | "intro" | null>(null);
  const logoUri = logo?.uri || resolveApiUrl(existingLogoUrl);
  const introUri = intro?.uri || resolveApiUrl(existingIntroUrl);
  const player = useVideoPlayer(introUri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  useEffect(() => {
    if (introUri) player.play();
    else player.pause();
  }, [introUri, player]);

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = (asset.mimeType || "").toLowerCase().replace("image/jpg", "image/jpeg");
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      onError?.("Logo PNG, JPG veya WEBP olmalıdır.");
      return;
    }
    onLogoChange({ ...asset, mimeType: mime });
  };

  const pickIntro = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      videoMaxDuration: 300,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = (asset.mimeType || "").toLowerCase();
    if (!["video/mp4", "video/webm"].includes(mime)) {
      onError?.("Jenerik MP4 veya WEBM olmalıdır.");
      return;
    }
    if (asset.duration != null && asset.duration > 300_000) {
      onError?.("Jenerik en fazla 5 dakika olabilir.");
      return;
    }
    onIntroChange(asset);
  };

  const remove = async (type: "logo" | "intro") => {
    const local = type === "logo" ? logo : intro;
    const callback = type === "logo" ? onDeleteExistingLogo : onDeleteExistingIntro;
    if (local) {
      if (type === "logo") onLogoChange(null);
      else onIntroChange(null);
      return;
    }
    if (!callback) return;
    setDeleting(type);
    try {
      await callback();
    } catch (error: any) {
      onError?.(error.message || "Branding dosyası silinemedi.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <View style={s.section}>
      <Text style={s.title}>Otel Branding</Text>
      <Text style={s.label}>Logo {logoRequired ? "· Zorunlu" : ""}</Text>
      {logoUri ? <Image source={{ uri: logoUri }} style={s.logo} contentFit="contain" /> : <Text style={s.empty}>Logo seçilmedi</Text>}
      <View style={s.actions}>
        <Pressable disabled={disabled} onPress={pickLogo} style={s.button}>
          <Ionicons name="image-outline" size={17} color={COLORS.brand} />
          <Text style={s.buttonText}>{logoUri ? "Logoyu Değiştir" : "Logo Seç"}</Text>
        </Pressable>
        {logoUri && (
          <Pressable disabled={disabled || deleting === "logo"} onPress={() => remove("logo")} style={s.button}>
            {deleting === "logo" ? <ActivityIndicator color={COLORS.error} /> : <Ionicons name="trash-outline" size={17} color={COLORS.error} />}
            <Text style={[s.buttonText, { color: COLORS.error }]}>Sil</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.label}>Jenerik · Opsiyonel · En fazla 5 dakika</Text>
      {introUri ? <VideoView player={player} style={s.video} nativeControls contentFit="contain" /> : <Text style={s.empty}>Jenerik seçilmedi</Text>}
      <View style={s.actions}>
        <Pressable disabled={disabled} onPress={pickIntro} style={s.button}>
          <Ionicons name="videocam-outline" size={17} color={COLORS.brand} />
          <Text style={s.buttonText}>{introUri ? "Jeneriği Değiştir" : "Jenerik Seç"}</Text>
        </Pressable>
        {introUri && (
          <Pressable disabled={disabled || deleting === "intro"} onPress={() => remove("intro")} style={s.button}>
            {deleting === "intro" ? <ActivityIndicator color={COLORS.error} /> : <Ionicons name="trash-outline" size={17} color={COLORS.error} />}
            <Text style={[s.buttonText, { color: COLORS.error }]}>Sil</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
  title: { color: COLORS.onSurface, fontSize: 17, fontWeight: "700" },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  logo: { width: "100%", height: 130, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  video: { width: "100%", height: 190, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  empty: { color: COLORS.onSurfaceTertiary, padding: SPACING.md, textAlign: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  button: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  buttonText: { color: COLORS.brand, fontSize: 12, fontWeight: "700" },
});
