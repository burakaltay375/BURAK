import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { COLORS } from "@/src/theme";
import type { HotelMapProps } from "./hotel-map-types";

const hotelIcon = L.divIcon({
  className: "",
  html: '<div style="width:36px;height:36px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:#b58a31;color:#fff;font:bold 14px sans-serif;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.35)">H</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function Recenter({ latitude, longitude, zoom }: Required<Pick<HotelMapProps, "latitude" | "longitude" | "zoom">>) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], zoom);
  }, [latitude, longitude, map, zoom]);
  return null;
}

export default function HotelMap({ latitude, longitude, hotelName, zoom = 15 }: HotelMapProps) {
  const center = useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude]);
  return (
    <View style={styles.root}>
      <MapContainer center={center} zoom={zoom} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter latitude={latitude} longitude={longitude} zoom={zoom} />
        <Marker position={center} icon={hotelIcon}>
          <Popup>{hotelName}</Popup>
        </Marker>
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden", backgroundColor: COLORS.surfaceTertiary },
});
