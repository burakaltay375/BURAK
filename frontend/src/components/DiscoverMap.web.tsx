import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { api } from "@/src/api";
import { COLORS } from "@/src/theme";
import type { DiscoverMapProps, NearbyPlace } from "./discover-map-types";

type MapCenter = { lat: number; lng: number };
type LocationStatus = "requesting" | "user" | "hotel";

const placeIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function labelIcon(label: string, background: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;background:${background};color:#fff;font:bold 14px sans-serif;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.35)">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function Recenter({ center }: { center: MapCenter }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

export default function DiscoverMap({
  latitude,
  longitude,
  hotelName,
  placeType,
}: DiscoverMapProps) {
  const hotelCenter = useMemo(() => ({ lat: latitude, lng: longitude }), [latitude, longitude]);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("requesting");
  const [searchCenter, setSearchCenter] = useState<MapCenter>(hotelCenter);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);

  useEffect(() => {
    let active = true;
    setLocationStatus("requesting");
    setSearchCenter(hotelCenter);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("hotel");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!active) return;
        if (Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
          setSearchCenter({ lat: coords.latitude, lng: coords.longitude });
          setLocationStatus("user");
        } else {
          setLocationStatus("hotel");
        }
      },
      () => {
        if (active) {
          setSearchCenter(hotelCenter);
          setLocationStatus("hotel");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return () => {
      active = false;
    };
  }, [hotelCenter]);

  useEffect(() => {
    if (locationStatus === "requesting") return;
    let active = true;
    setSearching(true);
    setPlacesError("");
    setSelectedPlace(null);
    api.nearbyPlaces(searchCenter.lat, searchCenter.lng, placeType)
      .then((results) => {
        if (active) setPlaces(results);
      })
      .catch((reason) => {
        if (!active) return;
        setPlaces([]);
        setPlacesError(reason instanceof Error ? reason.message : "Yakındaki işletmeler yüklenemedi.");
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [locationStatus, placeType, searchCenter.lat, searchCenter.lng]);

  if (locationStatus === "requesting") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} size="large" />
        <Text style={styles.message}>Konumunuz hazırlanıyor…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapContainer center={searchCenter} zoom={15} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={searchCenter} />
        <Marker position={hotelCenter} icon={labelIcon("H", "#b58a31")}>
          <Popup>{hotelName}</Popup>
        </Marker>
        {locationStatus === "user" && (
          <Marker position={searchCenter} icon={labelIcon("S", "#2563eb")}>
            <Popup>Konumunuz</Popup>
          </Marker>
        )}
        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.gps_coordinates.latitude, place.gps_coordinates.longitude]}
            icon={placeIcon}
            eventHandlers={{ click: () => setSelectedPlace(place) }}
          >
            <Popup>{place.title}</Popup>
          </Marker>
        ))}
      </MapContainer>

      <View style={styles.locationBadge} pointerEvents="none">
        <Text style={styles.locationBadgeText}>
          {locationStatus === "user" ? "Konumunuzun çevresi" : "Otel çevresi gösteriliyor"}
        </Text>
      </View>
      {searching && (
        <View style={styles.searchBadge} pointerEvents="none">
          <ActivityIndicator color={COLORS.brand} size="small" />
          <Text style={styles.searchBadgeText}>Yakındaki yerler yükleniyor…</Text>
        </View>
      )}
      {!!placesError && (
        <View style={styles.warningBadge} pointerEvents="none">
          <Text style={styles.warningText}>{placesError}</Text>
        </View>
      )}
      {!!selectedPlace && (
        <PlaceDetailCard
          origin={searchCenter}
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
        />
      )}
    </View>
  );
}

function PlaceDetailCard({
  origin,
  place,
  onClose,
}: {
  origin: MapCenter;
  place: NearbyPlace;
  onClose: () => void;
}) {
  const route = `${origin.lat},${origin.lng};${place.gps_coordinates.latitude},${place.gps_coordinates.longitude}`;
  const directionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
  const website = place.website && /^https?:\/\//i.test(place.website) ? place.website : null;
  const phone = place.phone?.trim() || null;
  const openExternal = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  return (
    <View style={styles.card}>
      <Pressable accessibilityLabel="İşletme detayını kapat" onPress={onClose} style={styles.cardClose}>
        <Text style={styles.cardCloseText}>×</Text>
      </Pressable>
      {!!place.thumbnail && (
        <Image source={{ uri: place.thumbnail }} resizeMode="cover" style={styles.thumbnail} />
      )}
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>{place.title}</Text>
        {(place.rating != null || place.reviews != null) && (
          <Text style={styles.rating}>
            ★ {place.rating ?? "—"}{place.reviews != null ? ` · ${place.reviews} değerlendirme` : ""}
          </Text>
        )}
        {!!place.address && <Text style={styles.detailText}>{place.address}</Text>}
        {!!phone && <Text style={styles.detailText}>{phone}</Text>}
        {!!place.open_state && <Text style={styles.openState}>{place.open_state}</Text>}
        <View style={styles.actions}>
          <Pressable onPress={() => openExternal(directionsUrl)} style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>Yol Tarifi Al</Text>
          </Pressable>
          {!!website && (
            <Pressable onPress={() => openExternal(website)} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Web Sitesi</Text>
            </Pressable>
          )}
          {!!phone && (
            <Pressable onPress={() => { window.location.href = `tel:${phone}`; }} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Ara</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden", backgroundColor: COLORS.surfaceTertiary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: COLORS.surfaceTertiary },
  message: { color: COLORS.onSurfaceSecondary, fontSize: 14 },
  locationBadge: {
    position: "absolute", left: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, backgroundColor: "rgba(15,15,17,0.88)", borderWidth: 1, borderColor: COLORS.borderStrong,
  },
  locationBadgeText: { color: COLORS.onSurface, fontSize: 12, fontWeight: "700" },
  searchBadge: {
    position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(15,15,17,0.9)",
  },
  searchBadgeText: { color: COLORS.onSurface, fontSize: 12 },
  warningBadge: {
    position: "absolute", top: 12, left: 12, right: 12, padding: 10,
    borderRadius: 12, backgroundColor: "rgba(120,32,32,0.94)",
  },
  warningText: { color: "#FFFFFF", fontSize: 12, textAlign: "center" },
  card: {
    position: "absolute", left: 12, right: 12, bottom: 52, maxHeight: "70%", overflow: "hidden",
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surfaceSecondary,
    shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  cardClose: {
    position: "absolute", top: 8, right: 8, zIndex: 2, width: 32, height: 32,
    alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "rgba(15,15,17,0.85)",
  },
  cardCloseText: { color: "#FFFFFF", fontSize: 24, lineHeight: 27 },
  thumbnail: { width: "100%", height: 130, backgroundColor: COLORS.surfaceTertiary },
  cardBody: { padding: 16, gap: 6 },
  cardTitle: { color: COLORS.onSurface, fontSize: 18, fontWeight: "800", paddingRight: 28 },
  rating: { color: "#F4B740", fontSize: 13, fontWeight: "700" },
  detailText: { color: COLORS.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  openState: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  primaryAction: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.brand },
  primaryActionText: { color: COLORS.onBrandPrimary, fontSize: 12, fontWeight: "800" },
  secondaryAction: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.borderStrong, backgroundColor: COLORS.surfaceTertiary,
  },
  secondaryActionText: { color: COLORS.onSurface, fontSize: 12, fontWeight: "700" },
});
