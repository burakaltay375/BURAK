import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { api } from "@/src/api";
import { COLORS } from "@/src/theme";
import type { DiscoverMapProps, NearbyPlace } from "./discover-map-types";

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function mapHtml(props: DiscoverMapProps, places: NearbyPlace[]): string {
  const center = safeJson({ lat: props.latitude, lng: props.longitude });
  const hotelName = safeJson(props.hotelName);
  const localPlaces = safeJson(places);

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIINfQ3ynhToKH5VYNH7XvEOlF0K40Hj7B0=" crossorigin="" />
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; background: #26262a; }
      #status {
        position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center;
        justify-content: center; padding: 24px; box-sizing: border-box;
        color: #f5f5f5; background: rgba(15,15,17,.78);
        font: 14px -apple-system, BlinkMacSystemFont, sans-serif; text-align: center;
      }
      #card {
        position: fixed; z-index: 1200; left: 12px; right: 12px; bottom: 12px;
        display: none; overflow: hidden; border: 1px solid #45454b; border-radius: 20px;
        color: #f5f5f5; background: #1d1d20; box-shadow: 0 10px 30px rgba(0,0,0,.45);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #photo { display: none; width: 100%; height: 130px; object-fit: cover; background: #29292d; }
      .body { padding: 16px; }
      #close {
        position: absolute; z-index: 2; top: 8px; right: 8px; width: 32px; height: 32px;
        border: 0; border-radius: 16px; color: white; background: rgba(15,15,17,.86); font-size: 22px;
      }
      h2 { margin: 0 34px 6px 0; font-size: 18px; line-height: 22px; }
      p { margin: 5px 0; color: #c8c8ce; font-size: 13px; line-height: 18px; }
      #rating { color: #f4b740; font-weight: 700; }
      #open-state { color: #d6b15e; font-weight: 700; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .action {
        padding: 10px 13px; border: 1px solid #45454b; border-radius: 12px;
        color: #f5f5f5; background: #29292d; font-weight: 700;
      }
      .primary { border-color: #d6b15e; color: #111; background: #d6b15e; }
      .label-marker {
        width: 34px; height: 34px; border-radius: 17px; display: flex; align-items: center;
        justify-content: center; color: white; background: #b58a31; font: bold 14px sans-serif;
        border: 3px solid white; box-shadow: 0 3px 12px rgba(0,0,0,.35);
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="status">Yakındaki yerler hazırlanıyor…</div>
    <section id="card">
      <button id="close" aria-label="Kapat">×</button>
      <img id="photo" alt="" />
      <div class="body">
        <h2 id="title"></h2>
        <p id="rating"></p>
        <p id="address"></p>
        <p id="phone"></p>
        <p id="open-state"></p>
        <div class="actions">
          <button class="action primary" data-action="directions">Yol Tarifi Al</button>
          <button id="website-action" class="action" data-action="website">Web Sitesi</button>
          <button id="phone-action" class="action" data-action="phone">Ara</button>
        </div>
      </div>
    </section>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      const center = ${center};
      const places = ${localPlaces};
      let selectedIndex = -1;

      function setText(id, value) {
        const node = document.getElementById(id);
        node.textContent = value || "";
        node.style.display = value ? "block" : "none";
      }
      function showPlace(index) {
        selectedIndex = index;
        const place = places[index];
        setText("title", place.title);
        setText("rating", place.rating != null
          ? "★ " + place.rating + (place.reviews != null ? " · " + place.reviews + " değerlendirme" : "")
          : "");
        setText("address", place.address);
        setText("phone", place.phone);
        setText("open-state", place.open_state);
        const photo = document.getElementById("photo");
        photo.style.display = place.thumbnail ? "block" : "none";
        if (place.thumbnail) photo.src = place.thumbnail;
        document.getElementById("website-action").style.display = place.website ? "block" : "none";
        document.getElementById("phone-action").style.display = place.phone ? "block" : "none";
        document.getElementById("card").style.display = "block";
      }
      function sendAction(action) {
        if (selectedIndex < 0) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ action: action, index: selectedIndex }));
      }

      const map = L.map("map", { zoomControl: true }).setView([center.lat, center.lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      const hotelIcon = L.divIcon({
        className: "",
        html: '<div class="label-marker">H</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      L.marker([center.lat, center.lng], { icon: hotelIcon })
        .addTo(map)
        .bindPopup(${hotelName});

      places.forEach(function(place, index) {
        L.marker([place.gps_coordinates.latitude, place.gps_coordinates.longitude])
          .addTo(map)
          .bindTooltip(place.title)
          .on("click", function(event) {
            map.panTo(event.latlng);
            showPlace(index);
          });
      });
      document.getElementById("status").style.display = "none";
      document.getElementById("close").addEventListener("click", function() {
        document.getElementById("card").style.display = "none";
      });
      document.querySelectorAll("[data-action]").forEach(function(button) {
        button.addEventListener("click", function() { sendAction(button.dataset.action); });
      });
    </script>
  </body>
</html>`;
}

export default function DiscoverMap(props: DiscoverMapProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.nearbyPlaces(props.latitude, props.longitude, props.placeType)
      .then((results) => {
        if (active) setPlaces(results);
      })
      .catch((reason) => {
        if (active) {
          setPlaces([]);
          setError(reason instanceof Error ? reason.message : "Yakındaki işletmeler yüklenemedi.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.latitude, props.longitude, props.placeType]);

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={COLORS.brand} size="large" />
        <Text style={styles.message}>Yakındaki yerler yükleniyor…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.empty}>
        <Text style={styles.message}>{error}</Text>
      </View>
    );
  }

  const handleMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        action?: "directions" | "website" | "phone";
        index?: number;
      };
      if (!Number.isInteger(message.index) || message.index == null) return;
      const place = places[message.index];
      if (!place) return;

      let url: string | null = null;
      if (message.action === "directions") {
        const route = `${props.latitude},${props.longitude};${place.gps_coordinates.latitude},${place.gps_coordinates.longitude}`;
        url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
      } else if (message.action === "website" && place.website && /^https?:\/\//i.test(place.website)) {
        url = place.website;
      } else if (message.action === "phone" && place.phone) {
        const dialable = place.phone.replace(/[^\d+]/g, "");
        if (dialable) url = `tel:${dialable}`;
      }
      if (url) await Linking.openURL(url);
    } catch {
      // Ignore malformed WebView messages.
    }
  };

  return (
    <WebView
      key={`${props.latitude}-${props.longitude}-${props.placeType}`}
      originWhitelist={["*"]}
      source={{ html: mapHtml(props, places) }}
      javaScriptEnabled
      domStorageEnabled
      onMessage={handleMessage}
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: COLORS.surfaceTertiary },
  empty: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12,
    padding: 24, backgroundColor: COLORS.surfaceTertiary,
  },
  message: { color: COLORS.onSurface, textAlign: "center", lineHeight: 21 },
});
