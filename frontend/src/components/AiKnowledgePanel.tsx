import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { HotelAiKnowledgeInput } from "@/src/api";
import { COLORS, RADIUS, SPACING, TYPE } from "@/src/theme";

type SectionKey = "hotel_info" | "rooms" | "restaurant" | "services" | "policies" | "general_info";
type ListKey = "events" | "nearby_places" | "paid_services" | "custom_entries";

type Props = {
  value: HotelAiKnowledgeInput;
  editable?: boolean;
  onChange?: (next: HotelAiKnowledgeInput) => void;
};

const SECTIONS: { key: SectionKey; title: string; fields: { key: string; label: string; multiline?: boolean }[] }[] = [
  {
    key: "hotel_info",
    title: "Genel Otel Bilgileri",
    fields: [
      { key: "hotel_name", label: "Otel adı" },
      { key: "general_information", label: "Genel otel bilgileri", multiline: true },
      { key: "description", label: "Otel açıklaması", multiline: true },
      { key: "address", label: "Adres" },
      { key: "phone", label: "Telefon" },
      { key: "email", label: "E-posta" },
      { key: "website", label: "Web sitesi" },
      { key: "star_rating", label: "Yıldız bilgisi" },
      { key: "check_in_time", label: "Check-in saati" },
      { key: "check_out_time", label: "Check-out saati" },
      { key: "emergency_information", label: "Acil durum bilgileri", multiline: true },
    ],
  },
  {
    key: "rooms",
    title: "Oda Bilgileri ve Kuralları",
    fields: [
      { key: "room_types", label: "Oda tipleri", multiline: true },
      { key: "room_features", label: "Oda özellikleri", multiline: true },
      { key: "room_rules", label: "Oda kuralları", multiline: true },
      { key: "extra_bed_rules", label: "Ekstra yatak kuralları", multiline: true },
      { key: "baby_bed_rules", label: "Bebek yatağı kuralları", multiline: true },
      { key: "balcony", label: "Balkon bilgisi" },
      { key: "sea_view", label: "Manzara bilgisi" },
      { key: "air_conditioning", label: "Klima bilgisi" },
      { key: "mini_bar", label: "Mini bar bilgisi" },
      { key: "safe", label: "Kasa bilgisi" },
      { key: "tv", label: "TV bilgisi" },
      { key: "coffee_machine", label: "Kahve makinesi bilgisi" },
    ],
  },
  {
    key: "restaurant",
    title: "Restoran, Bar ve Oda Servisi",
    fields: [
      { key: "restaurant_hours", label: "Restoran çalışma saatleri" },
      { key: "breakfast_hours", label: "Kahvaltı saatleri" },
      { key: "breakfast_content", label: "Kahvaltı içeriği", multiline: true },
      { key: "lunch_hours", label: "Öğle yemeği saatleri" },
      { key: "dinner_hours", label: "Akşam yemeği saatleri" },
      { key: "restaurant_menu", label: "Restoran menüsü ve fiyatları", multiline: true },
      { key: "bar_menu", label: "Bar menüsü ve fiyatları", multiline: true },
      { key: "room_service_hours", label: "Oda servisi saatleri" },
      { key: "room_service_fees", label: "Oda servisi ücretleri", multiline: true },
      { key: "room_service_rules", label: "Oda servisi kuralları", multiline: true },
    ],
  },
  {
    key: "services",
    title: "Otel Hizmetleri",
    fields: [
      { key: "wifi", label: "Wi-Fi bilgileri", multiline: true },
      { key: "parking", label: "Otopark bilgileri", multiline: true },
      { key: "swimming_pool", label: "Havuz çalışma saatleri" },
      { key: "pool_rules", label: "Havuz kuralları", multiline: true },
      { key: "spa", label: "Spa kuralları ve saatleri", multiline: true },
      { key: "sauna", label: "Sauna kuralları ve saatleri", multiline: true },
      { key: "gym", label: "Spor salonu kuralları ve saatleri", multiline: true },
      { key: "valet", label: "Vale hizmeti ve ücretleri", multiline: true },
      { key: "housekeeping", label: "Housekeeping saatleri ve kuralları", multiline: true },
      { key: "vip_services", label: "VIP hizmetleri", multiline: true },
      { key: "laundry", label: "Çamaşırhane bilgileri", multiline: true },
      { key: "airport_transfer", label: "Havalimanı transferi", multiline: true },
    ],
  },
  {
    key: "policies",
    title: "Otel Politikaları",
    fields: [
      { key: "early_check_in", label: "Erken giriş kuralları", multiline: true },
      { key: "late_check_out", label: "Geç çıkış kuralları", multiline: true },
      { key: "pet_rules", label: "Evcil hayvan kuralları", multiline: true },
      { key: "smoking_policy", label: "Sigara içme kuralları", multiline: true },
      { key: "child_policy", label: "Çocuk politikası", multiline: true },
      { key: "payment_methods", label: "Ödeme yöntemleri", multiline: true },
      { key: "cancellation_policy", label: "İptal politikası", multiline: true },
      { key: "refund_policy", label: "İade politikası", multiline: true },
      { key: "deposit_rules", label: "Depozito kuralları", multiline: true },
      { key: "guest_request_rules", label: "Misafir talepleriyle ilgili kurallar", multiline: true },
      { key: "special_rules", label: "Otelin özel kuralları", multiline: true },
    ],
  },
  {
    key: "general_info",
    title: "Serbest Metin Bilgiler",
    fields: [
      { key: "all_information", label: "Manager'ın eklemek istediği diğer bilgiler", multiline: true },
    ],
  },
];

const LISTS: { key: ListKey; title: string; empty: string; fields: { key: string; label: string; multiline?: boolean }[] }[] = [
  {
    key: "events",
    title: "Otel İçi Etkinlikler ve Saatleri",
    empty: "Henüz etkinlik yok",
    fields: [
      { key: "name", label: "Etkinlik adı" },
      { key: "time", label: "Saat / gün" },
      { key: "description", label: "Açıklama", multiline: true },
    ],
  },
  {
    key: "nearby_places",
    title: "Otel Yakınındaki Yerler",
    empty: "Henüz yakındaki yer yok",
    fields: [
      { key: "name", label: "Ad" },
      { key: "category", label: "Kategori" },
      { key: "distance", label: "Mesafe (en yakından uzağa sıralanır)" },
      { key: "description", label: "Açıklama", multiline: true },
    ],
  },
  {
    key: "paid_services",
    title: "Otel İçi Hizmetler ve Ücretleri",
    empty: "Henüz hizmet bilgisi yok",
    fields: [
      { key: "name", label: "Hizmet adı" },
      { key: "is_paid", label: "Ücretli mi? (evet/hayır)" },
      { key: "price", label: "Ücret / fiyat" },
      { key: "description", label: "Açıklama", multiline: true },
    ],
  },
  {
    key: "custom_entries",
    title: "Özel Bilgi / Kural Ekle",
    empty: "Henüz özel bilgi veya kural eklenmedi",
    fields: [
      { key: "title", label: "Başlık" },
      { key: "content", label: "Bilgi / kural", multiline: true },
    ],
  },
];

export const emptyAiKnowledgeInput: HotelAiKnowledgeInput = {
  hotel_info: {},
  services: {},
  restaurant: {},
  rooms: {},
  policies: {},
  general_info: {},
  events: [],
  paid_services: [],
  nearby_places: [],
  faq: [],
  custom_entries: [],
};

export function toAiKnowledgeInput(value: HotelAiKnowledgeInput): HotelAiKnowledgeInput {
  return {
    hotel_info: value.hotel_info ?? {},
    services: value.services ?? {},
    restaurant: value.restaurant ?? {},
    rooms: value.rooms ?? {},
    policies: value.policies ?? {},
    general_info: value.general_info ?? {},
    events: value.events ?? [],
    paid_services: value.paid_services ?? [],
    nearby_places: value.nearby_places ?? [],
    faq: value.faq ?? [],
    custom_entries: value.custom_entries ?? [],
  };
}

export function AiKnowledgePanel({ value, editable = false, onChange }: Props) {
  const setSectionField = (section: SectionKey, key: string, text: string) => {
    onChange?.({ ...value, [section]: { ...(value as any)[section], [key]: text } });
  };

  const addListItem = (listKey: ListKey) => {
    const next = [...((value as any)[listKey] ?? []), { id: `${Date.now()}` }];
    onChange?.({ ...value, [listKey]: next });
  };

  const setListField = (listKey: ListKey, index: number, key: string, text: string) => {
    const next = [...((value as any)[listKey] ?? [])];
    next[index] = { ...next[index], [key]: key === "is_paid" ? ["evet", "ücretli", "ucretli", "true"].includes(text.toLowerCase().trim()) : text };
    onChange?.({ ...value, [listKey]: next });
  };

  const removeListItem = (listKey: ListKey, index: number) => {
    const next = [...((value as any)[listKey] ?? [])];
    next.splice(index, 1);
    onChange?.({ ...value, [listKey]: next });
  };

  return (
    <View style={s.wrap}>
      {SECTIONS.map((section) => (
        <View key={section.key} style={s.card}>
          <Text style={s.cardTitle}>{section.title}</Text>
          {section.fields.map((field) => (
            <KnowledgeField
              key={field.key}
              label={field.label}
              value={(value as any)[section.key]?.[field.key] ?? ""}
              editable={editable}
              multiline={field.multiline}
              onChangeText={(text) => setSectionField(section.key, field.key, text)}
            />
          ))}
        </View>
      ))}

      {LISTS.map((list) => {
        const items = ((value as any)[list.key] ?? []) as Record<string, string>[];
        return (
          <View key={list.key} style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>{list.title}</Text>
              {editable && (
                <Pressable onPress={() => addListItem(list.key)} style={s.addBtn}>
                  <Ionicons name="add" size={16} color={COLORS.onBrandPrimary} />
                  <Text style={s.addText}>Ekle</Text>
                </Pressable>
              )}
            </View>
            {items.length === 0 && <Text style={s.empty}>{list.empty}</Text>}
            {items.map((item, index) => (
              <View key={item.id || index} style={s.listItem}>
                <View style={s.rowBetween}>
                  <Text style={s.itemTitle}>{`${list.title} #${index + 1}`}</Text>
                  {editable && (
                    <Pressable onPress={() => removeListItem(list.key, index)}>
                      <Ionicons name="trash" size={17} color={COLORS.error} />
                    </Pressable>
                  )}
                </View>
                {list.fields.map((field) => (
                  <KnowledgeField
                    key={field.key}
                    label={field.label}
                    value={field.key === "is_paid" ? ((item as any)[field.key] ? "evet" : "hayır") : ((item as any)[field.key] ?? "")}
                    editable={editable}
                    multiline={field.multiline}
                    onChangeText={(text) => setListField(list.key, index, field.key, text)}
                  />
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function KnowledgeField(props: { label: string; value: string; editable: boolean; multiline?: boolean; onChangeText: (text: string) => void }) {
  const { label, value, editable, multiline, onChangeText } = props;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {editable ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={`${label} girin`}
          placeholderTextColor={COLORS.onSurfaceTertiary}
          style={[s.input, multiline && s.inputMulti]}
          multiline={multiline}
        />
      ) : (
        <Text style={[s.value, !value && s.muted]}>{value || "Bilgi yok"}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: SPACING.lg },
  card: { backgroundColor: COLORS.surfaceSecondary, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  cardTitle: { color: COLORS.brand, fontFamily: TYPE.display, fontSize: 20, fontWeight: "800" },
  field: { gap: SPACING.xs },
  label: { color: COLORS.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: RADIUS.md, padding: SPACING.md, color: COLORS.onSurface, backgroundColor: COLORS.surfaceTertiary, minHeight: 44 },
  inputMulti: { minHeight: 88, textAlignVertical: "top" },
  value: { color: COLORS.onSurfaceSecondary, lineHeight: 21 },
  muted: { color: COLORS.onSurfaceTertiary, fontStyle: "italic" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md },
  addBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, backgroundColor: COLORS.brand, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  addText: { color: COLORS.onBrandPrimary, fontWeight: "800" },
  empty: { color: COLORS.onSurfaceTertiary },
  listItem: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.md, backgroundColor: COLORS.surface },
  itemTitle: { color: COLORS.onSurfaceSecondary, fontWeight: "800" },
});
