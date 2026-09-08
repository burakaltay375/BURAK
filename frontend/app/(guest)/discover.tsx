import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type HotelMapConfig } from "@/src/api";
import DiscoverMap from "@/src/components/DiscoverMap";
import type { DiscoverPlaceType } from "@/src/components/discover-map-types";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

const FILTERS: {
  key: DiscoverPlaceType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "restaurant", label: "Restoran", icon: "restaurant" },
  { key: "cafe", label: "Kafe", icon: "cafe" },
  { key: "historic", label: "Tarihi Yer", icon: "time" },
  { key: "museum", label: "Müze", icon: "business" },
  { key: "attraction", label: "Turistik Yer", icon: "camera" },
  { key: "park", label: "Park", icon: "leaf" },
  { key: "hospital", label: "Hastane", icon: "medkit" },
  { key: "shop", label: "Mağaza", icon: "storefront" },
  { key: "pharmacy", label: "Eczane", icon: "medical" },
];

export default function GuestDiscover() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [placeType, setPlaceType] = useState<DiscoverPlaceType>("restaurant");
  const [config, setConfig] = useState<HotelMapConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setVisible(true);
      setLoading(true);
      setError("");
      api.hotelMapConfig()
        .then((result) => {
          if (active) setConfig(result);
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message || "Otel konumu yüklenemedi.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const close = () => {
    setVisible(false);
    setTimeout(() => router.navigate("/(guest)/chat"), Platform.OS === "web" ? 0 : 180);
  };

  return (
    <View style={styles.page}>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={close}
      >
        <SafeAreaView style={styles.backdrop} edges={["top", "left", "right"]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Haritayı kapat"
            style={styles.dismissArea}
            onPress={close}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={styles.titleIcon}>
                  <Ionicons name="map" size={20} color={COLORS.onBrandPrimary} />
                </View>
                <View style={styles.titleText}>
                  <Text style={styles.eyebrow}>HOSPIRA KEŞFET</Text>
                  <Text style={styles.title}>Çevrede ne var?</Text>
                  <Text numberOfLines={1} style={styles.subtitle}>
                    {config?.hotel_name ?? "Otel çevresi"}
                    {config?.address ? ` · ${config.address}` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bu otel için rezervasyon yap"
                  onPress={() => { setVisible(false); router.navigate("/(guest)/reservations"); }}
                  style={styles.bookingButton}
                >
                  <Ionicons name="calendar" size={20} color={COLORS.onBrandPrimary} />
                </Pressable>
                <Pressable
                  testID="discover-close-button"
                  accessibilityRole="button"
                  accessibilityLabel="Haritayı kapat ve konsiyerje dön"
                  onPress={close}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={COLORS.onSurface} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              horizontal
              style={styles.filterScroller}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {FILTERS.map((filter) => {
                const selected = filter.key === placeType;
                return (
                  <Pressable
                    key={filter.key}
                    testID={`discover-filter-${filter.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setPlaceType(filter.key)}
                    style={[styles.filter, selected && styles.filterSelected]}
                  >
                    <Ionicons
                      name={filter.icon}
                      size={17}
                      color={selected ? COLORS.onBrandPrimary : COLORS.onSurfaceSecondary}
                    />
                    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.mapFrame}>
              {loading ? (
                <View style={styles.state}>
                  <ActivityIndicator color={COLORS.brand} size="large" />
                  <Text style={styles.stateText}>Otel konumu hazırlanıyor…</Text>
                </View>
              ) : error || !config ? (
                <View style={styles.state}>
                  <Ionicons name="location-outline" size={32} color={COLORS.error} />
                  <Text style={styles.stateText}>{error || "Otel konumu bulunamadı."}</Text>
                </View>
              ) : (
                <DiscoverMap
                  latitude={config.latitude}
                  longitude={config.longitude}
                  hotelName={config.hotel_name}
                  placeType={placeType}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.surface },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.58)",
    justifyContent: "flex-end",
  },
  dismissArea: { height: Platform.OS === "web" ? 24 : 54 },
  sheet: {
    flex: 1,
    maxHeight: Platform.OS === "web" ? "96%" : "94%",
    overflow: "hidden",
    backgroundColor: COLORS.surfaceSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: COLORS.borderStrong,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    marginTop: 9,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.borderStrong,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.md },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brand,
  },
  titleText: { flex: 1 },
  eyebrow: { color: COLORS.brand, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: COLORS.onSurface, fontSize: 20, fontFamily: TYPE.display, fontWeight: "700" },
  subtitle: { color: COLORS.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: SPACING.sm },
  bookingButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brand,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceTertiary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filters: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  filterScroller: { flexGrow: 0, maxHeight: 62 },
  filter: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceTertiary,
  },
  filterSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  filterText: { color: COLORS.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  filterTextSelected: { color: COLORS.onBrandPrimary },
  mapFrame: {
    flex: 1,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    overflow: "hidden",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surfaceTertiary,
  },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md, padding: 24 },
  stateText: { color: COLORS.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
});
