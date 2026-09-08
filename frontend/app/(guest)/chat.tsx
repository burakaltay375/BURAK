import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth";
import { api, transcribeAudio, ChatResp, type HotelServices } from "@/src/api";
import { HospiraMark } from "@/src/components/HospiraBrand";
import { COLORS, SPACING, RADIUS, TYPE, DEPT_LABEL, SERVICE_LABELS } from "@/src/theme";

type Msg = { role: "user" | "assistant"; content: string; parsed?: any };

const SUGGESTIONS = [
  { text: "Oda servisi: 2 espresso ve tost", service: "room_service" },
  { text: "Kuru temizleme talebi", service: "laundry" },
  { text: "Klima çalışmıyor, yardım edin", service: null },
  { text: "Ek havlu lütfen", service: null },
];

export default function GuestChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: user?.role === "staff"
        ? `Merhaba, ${user?.name?.split(" ")[0] ?? "ekip arkadaşım"}. Ben Hospira AI Asistan. Personel sohbetleri not ve yardım içindir; operasyon talebi sadece misafir sohbetinden oluşturulur.`
        : `Hoş geldiniz, ${user?.name?.split(" ")[0] ?? "Misafirimiz"}. Ben Hospira AI Asistan. Mesajınızı yazabilir ya da mikrofona basılı tutarak söyleyebilirsiniz.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [services, setServices] = useState<HotelServices | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync().catch(() => {});
    api.myHotelServices().then((r) => setServices(r.services)).catch(() => setServices(null));
  }, []);

  const enabledServices = Object.entries(services ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => SERVICE_LABELS[key as keyof typeof SERVICE_LABELS])
    .filter(Boolean);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const r: ChatResp = await api.chat(msg, sessionId);
      setSessionId(r.session_id);
      setMessages((m) => [...m, { role: "assistant", content: r.reply, parsed: r.parsed }]);
      if (r.ready) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Üzgünüm, bir sorun oluştu: ${e.message}` }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const toggleRecord = async () => {
    try {
      if (!recording) {
        await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        await recorder.stop();
        setRecording(false);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const uri = recorder.uri;
        if (!uri) return;
        setTranscribing(true);
        try {
          const text = await transcribeAudio(uri);
          if (text?.trim()) await send(text.trim());
        } catch (e: any) {
          setMessages((m) => [...m, { role: "assistant", content: `Ses çevrimi başarısız: ${e.message}` }]);
        } finally {
          setTranscribing(false);
        }
      }
    } catch (e: any) {
      setRecording(false);
      setMessages((m) => [...m, { role: "assistant", content: `Mikrofon hatası: ${e.message}` }]);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]} testID="guest-chat-screen">
      <View style={s.header}>
        <HospiraMark size={48} />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Hospira Konsiyerj</Text>
          <Text style={s.headerSub}>
            {user?.role === "staff"
              ? `Personel AI · ${DEPT_LABEL[user.department ?? ""] ?? "Departman"}`
              : `Her zaman hizmetinizde · Oda ${user?.room_no ?? "—"}`}
          </Text>
        </View>
      </View>
      {!!enabledServices.length && (
        <View style={s.servicesRow}>
          <Text style={s.servicesLabel}>Aktif servisler:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.servicesChips}>
            {enabledServices.map((label) => (
              <Text key={label} style={s.serviceChip}>{label}</Text>
            ))}
          </ScrollView>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.thread} keyboardShouldPersistTaps="handled">
          {messages.map((m, i) => (
            <View key={i} style={[s.bubbleRow, m.role === "user" ? s.userRow : s.aiRow]} testID={`chat-message-${i}`}>
              <View style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}>
                <Text style={[s.bubbleText, m.role === "user" && { color: COLORS.onBrandTertiary }]}>{m.content}</Text>
                {m.parsed && (
                  <View style={s.parsedBox}>
                    <Text style={s.parsedTitle}>✓ Talep Kaydı</Text>
                    <Text style={s.parsedLine}>Departman: {DEPT_LABEL[m.parsed.departman] ?? m.parsed.departman}</Text>
                    <Text style={s.parsedLine}>Oda: {m.parsed.oda_no}</Text>
                    <Text style={s.parsedLine}>Saat: {m.parsed.zaman}</Text>
                    <Text style={s.parsedLine}>Öncelik: {m.parsed.oncelik}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
          {sending && (
            <View style={[s.bubbleRow, s.aiRow]}>
              <View style={[s.bubble, s.aiBubble]}><ActivityIndicator color={COLORS.brand} /></View>
            </View>
          )}
          {messages.length <= 1 && (
            <View style={s.suggestRow}>
              {SUGGESTIONS.filter((q) => !q.service || services?.[q.service] !== false).map((q) => (
                <Pressable key={q.text} testID={`suggestion-${q.text}`} onPress={() => send(q.text)} style={s.suggestChip}>
                  <Text style={s.suggestText}>{q.text}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={s.composer}>
          {transcribing && <Text style={s.recHint}>Ses yazıya dönüştürülüyor…</Text>}
          {recording && <Text style={s.recHint}>● Kayıt yapılıyor… (durdurmak için bas)</Text>}
          <View style={s.composerRow}>
            <TextInput
              testID="chat-input"
              value={input} onChangeText={setInput}
              placeholder="Talebinizi yazın…"
              placeholderTextColor={COLORS.onSurfaceTertiary}
              style={s.input}
              onSubmitEditing={() => send()}
              returnKeyType="send"
              multiline
            />
            <Pressable testID="chat-mic-button" onPress={toggleRecord} style={[s.iconBtn, recording && s.iconBtnRec]}>
              <Ionicons name={recording ? "stop" : "mic"} color={recording ? "#fff" : COLORS.brand} size={22} />
            </Pressable>
            <Pressable testID="chat-send-button" onPress={() => send()} style={s.sendBtn} disabled={!input.trim()}>
              <Ionicons name="send" color={COLORS.onBrandPrimary} size={20} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  headerTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: "700", fontFamily: TYPE.display },
  headerSub: { color: COLORS.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  servicesRow: { backgroundColor: COLORS.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.xs },
  servicesLabel: { color: COLORS.onSurfaceTertiary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  servicesChips: { gap: SPACING.sm },
  serviceChip: { color: COLORS.brand, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.pill, overflow: "hidden", paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, fontSize: 11, fontWeight: "700" },
  thread: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  bubbleRow: { flexDirection: "row" },
  userRow: { justifyContent: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "85%", padding: SPACING.md, borderRadius: RADIUS.lg },
  userBubble: { backgroundColor: COLORS.brandTertiary, borderTopRightRadius: 4 },
  aiBubble: { backgroundColor: COLORS.surfaceSecondary, borderTopLeftRadius: 4 },
  bubbleText: { color: COLORS.onSurface, fontSize: 15, lineHeight: 22 },
  parsedBox: { marginTop: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.brand, gap: 2 },
  parsedTitle: { color: COLORS.brand, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  parsedLine: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md },
  suggestChip: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  suggestText: { color: COLORS.onSurfaceSecondary, fontSize: 13 },
  composer: { padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm },
  input: { flex: 1, backgroundColor: COLORS.surface, color: COLORS.onSurface, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: COLORS.border },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.brand },
  iconBtnRec: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.brand },
  recHint: { color: COLORS.brand, fontSize: 12, textAlign: "center", marginBottom: SPACING.sm },
});
