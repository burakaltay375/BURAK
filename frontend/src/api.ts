// Backend API client (Otel Akıllı Operasyon Merkezi)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { storage } from "./utils/storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
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

export type Role = "system_admin" | "hotel_manager" | "staff" | "guest";
export type GuestType = "standard" | "vip" | "casino";
export type HotelServices = Record<string, boolean>;

export type User = {
  id: string; email: string; name: string; role: Role;
  department?: string | null; room_no?: string | null;
  gender?: string | null; birth_date?: string | null; age?: number | null;
  nationality?: string | null; country?: string | null; region_city?: string | null;
  hotel_id?: string | null; hotelId?: string | null; guest_type?: GuestType | null; active?: boolean;
};

export type AuthOut = { token: string; user: User };

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
  active: boolean;
  manager_id?: string | null;
  services?: HotelServices;
  created_at: string;
};

export type HotelInfoKnowledge = {
  hotel_name?: string | null;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  star_rating?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
};

export type HotelServicesKnowledge = {
  wifi?: string | null;
  parking?: string | null;
  swimming_pool?: string | null;
  spa?: string | null;
  sauna?: string | null;
  gym?: string | null;
  laundry?: string | null;
  airport_transfer?: string | null;
  room_service?: string | null;
  pet_policy?: string | null;
};

export type RestaurantKnowledge = {
  breakfast_hours?: string | null;
  lunch_hours?: string | null;
  dinner_hours?: string | null;
  restaurant_menu?: string | null;
  room_service_hours?: string | null;
};

export type RoomKnowledge = {
  room_types?: string | null;
  room_features?: string | null;
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
  child_policy?: string | null;
  early_check_in?: string | null;
  late_check_out?: string | null;
  pet_rules?: string | null;
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

export const api = {
  login: (email: string, password: string, selected_hotel_id?: string | null) =>
    request<AuthOut>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, selected_hotel_id: selected_hotel_id || null }) }),
  activeHotels: () => request<Hotel[]>("/hotels/active"),
  register: (b: { email: string; password: string; name: string; role: "guest"; room_no?: string }) =>
    request<AuthOut>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<User>("/auth/me"),
  chat: (message: string, session_id?: string) =>
    request<ChatResp>("/chat", { method: "POST", body: JSON.stringify({ message, session_id }) }),
  myRequests: () => request<RequestItem[]>("/requests/me"),
  myRoom: () => request<Room | null>("/rooms/me"),
  myHotelServices: () => request<{ hotel_id: string; services: HotelServices; labels: Record<string, string> }>("/hotel/services"),
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

  // System admin
  systemStats: () => request<{ hotels: number; active_hotels: number; managers: number; staff: number; guests: number; users: number; requests: number; ai_messages: number }>("/system/stats"),
  listHotels: () => request<Hotel[]>("/system/hotels"),
  createHotel: (b: { hotel_name: string; city: string; address?: string; active?: boolean }) =>
    request<Hotel>("/system/hotels", { method: "POST", body: JSON.stringify(b) }),
  updateHotel: (id: string, b: Partial<Pick<Hotel, "hotel_name" | "city" | "address" | "active" | "services">>) =>
    request<Hotel>(`/system/hotels/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
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
  createStaff: (b: { email: string; password: string; name: string; department: string; gender: string; birth_date: string; nationality: string; country: string; region_city: string }) =>
    request<User>("/manager/staff", { method: "POST", body: JSON.stringify(b) }),
  updateStaff: (id: string, b: { name?: string; department?: string; gender?: string; birth_date?: string; nationality?: string; country?: string; region_city?: string; active?: boolean }) =>
    request<User>(`/manager/staff/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteStaff: (id: string) => request<{ ok: boolean }>(`/manager/staff/${id}`, { method: "DELETE" }),
  listGuests: () => request<User[]>("/manager/guests"),
  createGuest: (b: { email: string; password: string; name: string; room_no?: string; guest_type?: GuestType }) =>
    request<User>("/manager/guests", { method: "POST", body: JSON.stringify(b) }),
  updateGuest: (id: string, b: { name?: string; room_no?: string; guest_type?: GuestType; active?: boolean }) =>
    request<User>(`/manager/guests/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  checkoutGuest: (id: string) =>
    request<User>(`/manager/guests/${id}/checkout`, { method: "POST" }),
  managerReports: () => request<{ open_requests: number; staff: number; rooms: number; guests: number }>("/manager/reports"),
  managerHotel: () => request<Hotel>("/manager/hotel"),
  updateManagerHotel: (b: Partial<Pick<Hotel, "hotel_name" | "city" | "address" | "services">>) =>
    request<Hotel>("/manager/hotel", { method: "PATCH", body: JSON.stringify(b) }),
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
