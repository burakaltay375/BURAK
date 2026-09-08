// Backend API client (Otel Akıllı Operasyon Merkezi)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { DiscoverPlaceType, NearbyPlace as MapNearbyPlace } from "./components/discover-map-types";
import { storage } from "./utils/storage";

const envBackend = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").trim();
const BASE = (
  envBackend ||
  (Platform.OS === "web" ? "" : "http://localhost:8000")
).replace(/\/$/, "");
const API = `${BASE}/api`;

const TOKEN_KEY = "hotel_ops_token";

export async function setToken(t: string | null) {
  if (t) {
    await storage.secureSet(TOKEN_KEY, t);
    if (Platform.OS !== "web") {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } else {
    await storage.secureRemove(TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export async function getToken(): Promise<string | null> {
  const secureToken = await storage.secureGet<string | null>(TOKEN_KEY, null);
  if (secureToken) return secureToken;
  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacyToken) await setToken(legacyToken);
  return legacyToken;
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!res.ok) {
    const msg = data?.detail || (typeof data === "string" ? data : null) || res.statusText || "İstek başarısız";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export type UploadAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: Blob | null;
  duration?: number | null;
};

function appendUpload(form: FormData, key: string, asset: UploadAsset) {
  if (Platform.OS === "web" && asset.file) {
    form.append(key, asset.file, asset.fileName || "upload");
    return;
  }
  form.append(key, {
    uri: asset.uri,
    name: asset.fileName || "upload",
    type: asset.mimeType || "application/octet-stream",
  } as any);
}

async function requestMultipart<T>(path: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: await authHeaders(),
    body: form,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    throw new Error(data?.detail || (typeof data === "string" ? data : null) || "Dosya yüklenemedi");
  }
  return data as T;
}

export function resolveApiUrl(path?: string | null): string | null {
  if (!path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = await authHeaders();
  if (Platform.OS === "web") {
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error((await res.text()) || "Dosya indirilemedi");
    const url = URL.createObjectURL(await res.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  if (!FileSystem.cacheDirectory) throw new Error("Geçici dosya dizini bulunamadı");
  const result = await FileSystem.downloadAsync(`${API}${path}`, `${FileSystem.cacheDirectory}${filename}`, { headers });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Dosya paylaşımı bu cihazda kullanılamıyor");
  await Sharing.shareAsync(result.uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: "Planlama Excel dosyasını kaydet",
    UTI: "org.openxmlformats.spreadsheetml.sheet",
  });
}

export type Role = "system_admin" | "hotel_manager" | "staff" | "guest";
export type GuestType = "standard" | "vip" | "casino";
export type HotelServices = Record<string, boolean>;

export type User = {
  id: string; email: string; name: string; role: Role;
  department?: string | null; position?: string | null; room_no?: string | null;
  gender?: string | null; birth_date?: string | null; age?: number | null;
  nationality?: string | null; country?: string | null; region_city?: string | null;
  hotel_id?: string | null; hotelId?: string | null; guest_type?: GuestType | null; active?: boolean;
};

export type AuthOut = { token: string; user: User };

export type DepartmentSchedule = {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  position?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  task: string;
  status: "Draft" | "Approved";
  approved_by?: string | null;
  approved_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DepartmentScheduleInput = {
  employee_id: string;
  department?: string;
  date: string;
  start_time: string;
  end_time: string;
  task: string;
};

export type RequestItem = {
  id: string; guest_id: string; guest_name: string; room_no: string;
  departman: string; service_key?: string | null; hizmet_turu: string; zaman: string; detay: string;
  oncelik: "DUSUK" | "ORTA" | "YUKSEK";
  status: "ALINDI" | "PERSONEL_GIDIYOR" | "TAMAMLANDI" | "REDDEDILDI";
  assigned_staff_id?: string | null; assigned_staff_name?: string | null;
  proof_photo?: string | null;
  completed_at?: string | null;
  created_at: string; updated_at: string;
};

export type Hotel = {
  id: string;
  hotel_name: string;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reservation_url?: string | null;
  active: boolean;
  manager_id?: string | null;
  services?: HotelServices;
  logo_url?: string | null;
  intro_video_url?: string | null;
  intro_video_duration?: number | null;
  created_at: string;
};

export type HotelInfoKnowledge = {
  hotel_name?: string | null;
  description?: string | null;
  general_information?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  star_rating?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  emergency_information?: string | null;
};

export type HotelServicesKnowledge = {
  wifi?: string | null;
  parking?: string | null;
  swimming_pool?: string | null;
  pool_rules?: string | null;
  spa?: string | null;
  sauna?: string | null;
  gym?: string | null;
  laundry?: string | null;
  airport_transfer?: string | null;
  room_service?: string | null;
  valet?: string | null;
  housekeeping?: string | null;
  vip_services?: string | null;
  pet_policy?: string | null;
};

export type RestaurantKnowledge = {
  restaurant_hours?: string | null;
  breakfast_hours?: string | null;
  breakfast_content?: string | null;
  lunch_hours?: string | null;
  dinner_hours?: string | null;
  restaurant_menu?: string | null;
  bar_menu?: string | null;
  room_service_hours?: string | null;
  room_service_fees?: string | null;
  room_service_rules?: string | null;
};

export type RoomKnowledge = {
  room_types?: string | null;
  room_features?: string | null;
  room_rules?: string | null;
  extra_bed_rules?: string | null;
  baby_bed_rules?: string | null;
  balcony?: string | null;
  sea_view?: string | null;
  air_conditioning?: string | null;
  mini_bar?: string | null;
  safe?: string | null;
  tv?: string | null;
  coffee_machine?: string | null;
};

export type PolicyKnowledge = {
  smoking_policy?: string | null;
  cancellation_policy?: string | null;
  refund_policy?: string | null;
  child_policy?: string | null;
  early_check_in?: string | null;
  late_check_out?: string | null;
  pet_rules?: string | null;
  payment_methods?: string | null;
  deposit_rules?: string | null;
  guest_request_rules?: string | null;
  special_rules?: string | null;
};

export type NearbyPlace = { id?: string | null; name: string; category: string; description: string; distance: string };
export type HotelEvent = { id?: string | null; name: string; time: string; description: string };
export type PaidHotelService = { id?: string | null; name: string; is_paid: boolean; price: string; description: string };
export type GeneralHotelKnowledge = { all_information?: string | null };
export type FaqItem = { id?: string | null; question: string; answer: string };
export type CustomKnowledgeEntry = { id?: string | null; title: string; content: string };

export type HotelAiKnowledge = {
  hotel_id: string;
  hotelId: string;
  hotel_info: HotelInfoKnowledge;
  services: HotelServicesKnowledge;
  restaurant: RestaurantKnowledge;
  rooms: RoomKnowledge;
  policies: PolicyKnowledge;
  general_info: GeneralHotelKnowledge;
  events: HotelEvent[];
  paid_services: PaidHotelService[];
  nearby_places: NearbyPlace[];
  faq: FaqItem[];
  custom_entries: CustomKnowledgeEntry[];
  updated_at?: string | null;
  updated_by?: string | null;
};

export type HotelAiKnowledgeInput = Omit<HotelAiKnowledge, "hotel_id" | "hotelId" | "updated_at" | "updated_by">;

export type RoomType = "Standard" | "Deluxe" | "Suite" | "Family" | "VIP";
export type RoomStatus = "available" | "reserved" | "occupied" | "cleaning" | "maintenance";
export type RoomOperationalStatus = "normal" | "cleaning" | "maintenance";

export type Room = {
  id: string;
  room_number: string;
  room_name?: string | null;
  room_type: RoomType;
  type: RoomType;
  floor?: string | null;
  capacity: number;
  price_per_night: number;
  status: RoomStatus;
  operational_status: RoomOperationalStatus;
  is_active: boolean;
  description?: string | null;
  current_guest_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomInput = {
  room_number: string;
  room_name?: string | null;
  room_type: RoomType;
  floor?: string | null;
  capacity: number;
  price_per_night: number;
  operational_status?: RoomOperationalStatus;
  is_active?: boolean;
  description?: string | null;
};

export type ReservationReferral = {
  id: string;
  hotel_id: string;
  hotel_name: string;
  guest_id: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  room_type: string;
  status: "pending_request";
  redirect_url: string;
  created_at: string;
};

export type ReservationReferralInput = {
  hotel_id?: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  room_type: string;
};

export type Announcement = {
  id: string;
  title: string;
  message: string;
  active: boolean;
  created_at: string;
};

export type ChatResp = {
  session_id: string; reply: string; ready: boolean;
  request_id?: string | null; parsed?: Record<string, any> | null;
};

export type HotelMapConfig = {
  hotel_id: string;
  hotel_name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
};

export type GeocodeResult = {
  display_name: string;
  latitude: number;
  longitude: number;
};

export type ReceptionChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ReceptionChatResp = {
  reply: string;
  model: string;
};

export const api = {
  login: (email: string, password: string, selected_hotel_id?: string | null) =>
    request<AuthOut>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, selected_hotel_id: selected_hotel_id || null }) }),
  activeHotels: () => request<Hotel[]>("/hotels/active"),
  register: (b: { email: string; password: string; name: string; role: "guest"; room_no?: string }) =>
    request<AuthOut>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<User>("/auth/me"),
  chat: (message: string, session_id?: string) =>
    request<ChatResp>("/chat", { method: "POST", body: JSON.stringify({ message, session_id }) }),
  receptionChat: (message: string, history: ReceptionChatMessage[] = []) =>
    request<ReceptionChatResp>("/reception-ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
  myRequests: () => request<RequestItem[]>("/requests/me"),
  myRoom: () => request<Room | null>("/rooms/me"),
  myHotelServices: () => request<{ hotel_id: string; services: HotelServices; labels: Record<string, string> }>("/hotel/services"),
  hotelMapConfig: () => request<HotelMapConfig>("/hotel/map-config"),
  nearbyPlaces: (latitude: number, longitude: number, type: DiscoverPlaceType) =>
    request<MapNearbyPlace[]>(
      `/hotel/nearby-places?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&type=${encodeURIComponent(type)}`,
    ),
  geocodeAddress: (query: string) =>
    request<GeocodeResult[]>(`/geocode?query=${encodeURIComponent(query)}`),
  announcements: () => request<Announcement[]>("/announcements"),
  deptQueue: () => request<RequestItem[]>("/requests/department"),
  activeJobs: () => request<RequestItem[]>("/requests/active"),
  staffRooms: () => request<Room[]>("/staff/rooms"),
  updateRoomStatus: (id: string, status: RoomOperationalStatus) =>
    request<Room>(`/staff/rooms/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  accept: (id: string) => request<RequestItem>(`/requests/${id}/accept`, { method: "POST" }),
  reject: (id: string) => request<RequestItem>(`/requests/${id}/reject`, { method: "POST" }),
  complete: (id: string, proof_photo: string) =>
    request<RequestItem>(`/requests/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ proof_photo }),
    }),
  adminAll: () => request<RequestItem[]>("/admin/requests"),
  adminStats: () => request<{
    total: number; active: number; completed: number; urgent: number;
    by_department: Record<string, { name: string; active: number }>;
  }>("/admin/stats"),
  departments: () => request<{ code: string; name: string }[]>("/meta/departments"),

  checkin: (b: { email: string; access_code: string; new_password: string }) =>
    request<AuthOut>("/checkin", { method: "POST", body: JSON.stringify(b) }),

  // Admin rooms
  listRooms: () => request<Room[]>("/admin/rooms"),
  createRoom: (b: RoomInput) =>
    request<Room>("/admin/rooms", { method: "POST", body: JSON.stringify(b) }),
  updateRoom: (id: string, b: Partial<RoomInput>) =>
    request<Room>(`/admin/rooms/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  roomStatus: (id: string) => request<Room>(`/admin/rooms/${id}/status`),
  deleteRoom: (id: string) => request<{ ok: boolean }>(`/admin/rooms/${id}`, { method: "DELETE" }),

  // Simple reservation referrals
  createReservationReferral: (body: ReservationReferralInput) =>
    request<ReservationReferral>("/reservation-referrals", { method: "POST", body: JSON.stringify(body) }),
  myReservationReferrals: () => request<ReservationReferral[]>("/reservation-referrals/me"),
  managerReservationReferrals: () => request<ReservationReferral[]>("/manager/reservation-referrals"),
  managerReservationReferralStats: () =>
    request<{ total_referrals: number; by_room_type: Record<string, number> }>("/manager/reservation-referrals/stats"),

  // System admin
  systemStats: () => request<{ hotels: number; active_hotels: number; managers: number; staff: number; guests: number; users: number; requests: number; ai_messages: number }>("/system/stats"),
  listHotels: () => request<Hotel[]>("/system/hotels"),
  createHotel: (b: { hotel_name: string; city: string; address?: string; latitude?: number; longitude?: number; reservation_url?: string; active?: boolean; logo: UploadAsset; intro_video?: UploadAsset | null }) => {
    const form = new FormData();
    form.append("hotel_name", b.hotel_name);
    form.append("city", b.city);
    if (b.address) form.append("address", b.address);
    if (b.latitude != null) form.append("latitude", String(b.latitude));
    if (b.longitude != null) form.append("longitude", String(b.longitude));
    if (b.reservation_url) form.append("reservation_url", b.reservation_url);
    form.append("active", String(b.active ?? true));
    appendUpload(form, "logo", b.logo);
    if (b.intro_video) appendUpload(form, "intro_video", b.intro_video);
    return requestMultipart<Hotel>("/system/hotels", form);
  },
  updateHotel: (id: string, b: Partial<Pick<Hotel, "hotel_name" | "city" | "address" | "latitude" | "longitude" | "reservation_url" | "active" | "services">>) =>
    request<Hotel>(`/system/hotels/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  updateHotelBranding: (id: string, assetType: "logo" | "intro", asset: UploadAsset) => {
    const form = new FormData();
    appendUpload(form, "file", asset);
    return requestMultipart<Hotel>(`/system/hotels/${id}/branding/${assetType}`, form, "PUT");
  },
  deleteHotelBranding: (id: string, assetType: "logo" | "intro") =>
    request<Hotel>(`/system/hotels/${id}/branding/${assetType}`, { method: "DELETE" }),
  setHotelActive: (id: string, active: boolean) =>
    request<Hotel>(`/system/hotels/${id}/activate`, { method: "POST", body: JSON.stringify({ active }) }),
  deleteHotel: (id: string) => request<{ ok: boolean }>(`/system/hotels/${id}`, { method: "DELETE" }),
  createManager: (b: { hotel_id: string; email: string; password: string; name: string }) =>
    request<User>("/system/managers", { method: "POST", body: JSON.stringify(b) }),
  listManagers: () => request<User[]>("/system/managers"),
  listUsers: () => request<User[]>("/system/users"),
  updateManager: (id: string, b: { name?: string; email?: string; hotel_id?: string; active?: boolean }) =>
    request<User>(`/system/managers/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteManager: (id: string) => request<{ ok: boolean }>(`/system/managers/${id}`, { method: "DELETE" }),
  resetManagerPassword: (id: string, new_password: string) =>
    request<{ ok: boolean }>(`/system/managers/${id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password }) }),
  setAccountActive: (id: string, active: boolean) =>
    request<User>(`/system/accounts/${id}/active`, { method: "POST", body: JSON.stringify({ active }) }),
  aiUsage: () => request<{ messages: number; sessions: number; generated_requests: number }>("/system/ai-usage"),
  platformSettings: () => request<Record<string, any>>("/system/settings"),
  savePlatformSettings: (b: Record<string, any>) =>
    request<Record<string, any>>("/system/settings", { method: "POST", body: JSON.stringify(b) }),
  listStaff: () => request<User[]>("/manager/staff"),
  createStaff: (b: { email: string; password: string; name: string; department: string; position?: string; gender?: string; birth_date?: string; nationality?: string; country?: string; region_city?: string }) =>
    request<User>("/manager/staff", { method: "POST", body: JSON.stringify(b) }),
  updateStaff: (id: string, b: { name?: string; department?: string; position?: string; gender?: string; birth_date?: string; nationality?: string; country?: string; region_city?: string; active?: boolean }) =>
    request<User>(`/manager/staff/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteStaff: (id: string) => request<{ ok: boolean }>(`/manager/staff/${id}`, { method: "DELETE" }),
  planningStaff: (department?: string) =>
    request<User[]>(`/planning/staff${department ? `?department=${encodeURIComponent(department)}` : ""}`),
  listSchedules: (filters: { department?: string; from_date?: string; to_date?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][]).toString();
    return request<DepartmentSchedule[]>(`/planning${query ? `?${query}` : ""}`);
  },
  createSchedule: (b: DepartmentScheduleInput) =>
    request<DepartmentSchedule>("/planning", { method: "POST", body: JSON.stringify(b) }),
  updateSchedule: (id: string, b: Partial<DepartmentScheduleInput>) =>
    request<DepartmentSchedule>(`/planning/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSchedule: (id: string) => request<{ ok: boolean }>(`/planning/${id}`, { method: "DELETE" }),
  approveSchedule: (id: string) =>
    request<DepartmentSchedule>(`/planning/${id}/approve`, { method: "POST" }),
  exportSchedules: (filters: { department?: string; from_date?: string; to_date?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][]).toString();
    return downloadFile(`/planning/export${query ? `?${query}` : ""}`, "departman-planlari.xlsx");
  },
  listGuests: () => request<User[]>("/manager/guests"),
  createGuest: (b: { email: string; password: string; name: string; room_no?: string; guest_type?: GuestType }) =>
    request<User>("/manager/guests", { method: "POST", body: JSON.stringify(b) }),
  updateGuest: (id: string, b: { name?: string; room_no?: string; guest_type?: GuestType; active?: boolean }) =>
    request<User>(`/manager/guests/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  checkoutGuest: (id: string) =>
    request<User>(`/manager/guests/${id}/checkout`, { method: "POST" }),
  managerReports: () => request<{ open_requests: number; staff: number; rooms: number; guests: number }>("/manager/reports"),
  managerHotel: () => request<Hotel>("/manager/hotel"),
  updateManagerHotel: (b: Partial<Pick<Hotel, "hotel_name" | "city" | "address" | "latitude" | "longitude" | "services" | "reservation_url">>) =>
    request<Hotel>("/manager/hotel", { method: "PATCH", body: JSON.stringify(b) }),
  updateManagerBranding: (assetType: "logo" | "intro", asset: UploadAsset) => {
    const form = new FormData();
    appendUpload(form, "file", asset);
    return requestMultipart<Hotel>(`/manager/hotel/branding/${assetType}`, form, "PUT");
  },
  deleteManagerBranding: (assetType: "logo" | "intro") =>
    request<Hotel>(`/manager/hotel/branding/${assetType}`, { method: "DELETE" }),
  managerAiKnowledge: () => request<HotelAiKnowledge>("/manager/ai-knowledge"),
  saveManagerAiKnowledge: (b: HotelAiKnowledgeInput) =>
    request<HotelAiKnowledge>("/manager/ai-knowledge", { method: "PUT", body: JSON.stringify(b) }),
  deleteManagerAiKnowledge: () => request<{ ok: boolean }>("/manager/ai-knowledge", { method: "DELETE" }),
  staffAiKnowledge: () => request<HotelAiKnowledge>("/staff/ai-knowledge"),
  systemAiKnowledge: (hotelId: string) =>
    request<HotelAiKnowledge>(`/system/ai-knowledge?hotel_id=${encodeURIComponent(hotelId)}`),
  assignTask: (requestId: string, staff_id: string) =>
    request<RequestItem>(`/manager/requests/${requestId}/assign`, { method: "POST", body: JSON.stringify({ staff_id }) }),
  listAnnouncements: () => request<Announcement[]>("/manager/announcements"),
  createAnnouncement: (b: { title: string; message: string; active?: boolean }) =>
    request<Announcement>("/manager/announcements", { method: "POST", body: JSON.stringify(b) }),
};

export async function transcribeAudio(uri: string): Promise<string> {
  const form = new FormData();
  // @ts-expect-error react-native FormData file
  form.append("file", { uri, name: "audio.m4a", type: "audio/m4a" });
  const headers: Record<string, string> = { ...(await authHeaders()) };
  const res = await fetch(`${API}/voice/transcribe`, {
    method: "POST", body: form as any, headers,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!res.ok) throw new Error(data?.detail || (typeof data === "string" ? data : null) || "Transkripsiyon başarısız");
  return data.text as string;
}
