import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

import { COLORS } from "@/src/theme";
import type { HotelMapProps } from "./hotel-map-types";

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function mapHtml({ latitude, longitude, hotelName, zoom = 15 }: HotelMapProps) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIINfQ3ynhToKH5VYNH7XvEOlF0K40Hj7B0=" crossorigin="" />
    <style>
      html,body,#map{width:100%;height:100%;margin:0;background:#26262a}
      .hotel-marker{width:36px;height:36px;border-radius:18px;display:flex;align-items:center;
        justify-content:center;background:#b58a31;color:#fff;font:bold 14px sans-serif;
        border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.35)}
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      const center=[${latitude},${longitude}];
      const map=L.map("map").setView(center,${zoom});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      const icon=L.divIcon({className:"",html:'<div class="hotel-marker">H</div>',iconSize:[36,36],iconAnchor:[18,18]});
      L.marker(center,{icon:icon}).addTo(map).bindPopup(${safeJson(hotelName)});
    </script>
  </body>
</html>`;
}

export default function HotelMap(props: HotelMapProps) {
  return (
    <WebView
      key={`${props.latitude}-${props.longitude}-${props.zoom ?? 15}`}
      originWhitelist={["*"]}
      source={{ html: mapHtml(props) }}
      javaScriptEnabled
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: COLORS.surfaceTertiary },
});
