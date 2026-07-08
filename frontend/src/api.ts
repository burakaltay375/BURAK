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
export type PaymentStatus = "pending" | "paid" | "casino_guest" | "vip_guest" | "company_paid";
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

export type ReservationStatus = "pending" | "checked_in" | "completed" | "cancelled";

export type Reservation = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  room_number?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  status: ReservationStatus;
  access_code: string;
  user_id?: string | null;
  email_sent?: boolean;
  hotel_id?: string | null;
  payment_status: PaymentStatus;
  guest_type: GuestType;
  created_at: string;
  updated_at: string;
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

export type Room = {
  id: string;
  room_number: string;
  type: string;
  status: "available" | "occupied" | "cleaning" | "maintenance" | "out_of_service";
  created_at: string;
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
  myReservations: () => request<Reservation[]>("/reservations/me"),
  myRoom: () => request<Room | null>("/rooms/me"),
  myHotelServices: () => request<{ hotel_id: string; services: HotelServices; labels: Record<string, string> }>("/hotel/services"),
  announcements: () => request<Announcement[]>("/announcements"),
  deptQueue: () => request<RequestItem[]>("/requests/department"),
  activeJobs: () => request<RequestItem[]>("/requests/active"),
  staffRooms: () => request<Room[]>("/staff/rooms"),
  updateRoomStatus: (id: string, status: Room["status"]) =>
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

  // Public reservation (no auth required)
  createReservation: (b: { customer_name: string; customer_email: string; customer_phone: string; check_in_date: string; check_out_date: string; room_number?: string; payment_status?: PaymentStatus; guest_type?: GuestType }) =>
    request<Reservation>("/reservations", { method: "POST", body: JSON.stringify(b) }),
  checkin: (b: { email: string; access_code: string; new_password: string }) =>
    request<AuthOut>("/checkin", { method: "POST", body: JSON.stringify(b) }),

  // Admin reservations
  listReservations: () => request<Reservation[]>("/admin/reservations"),
  adminCreateReservation: (b: { customer_name: string; customer_email: string; customer_phone: string; check_in_date: string; check_out_date: string; room_number?: string; payment_status?: PaymentStatus; guest_type?: GuestType }) =>
    request<Reservation>("/admin/reservations", { method: "POST", body: JSON.stringify(b) }),
  assignRoom: (id: string, room_number: string) =>
    request<Reservation>(`/admin/reservations/${id}/assign-room`, { method: "POST", body: JSON.stringify({ room_number }) }),
  updateReservation: (id: string, b: Partial<Pick<Reservation, "customer_name" | "customer_phone" | "check_in_date" | "check_out_date" | "room_number" | "status" | "payment_status" | "guest_type">>) =>
    request<Reservation>(`/admin/reservations/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  approveCheckin: (id: string) => request<Reservation>(`/admin/reservations/${id}/checkin`, { method: "POST" }),
  completeReservation: (id: string) => request<Reservation>(`/admin/reservations/${id}/complete`, { method: "POST" }),
  cancelReservation: (id: string) => request<Reservation>(`/admin/reservations/${id}/cancel`, { method: "POST" }),

  // Admin rooms
  listRooms: () => request<Room[]>("/admin/rooms"),
  createRoom: (b: { room_number: string; type?: string }) =>
    request<Room>("/admin/rooms", { method: "POST", body: JSON.stringify(b) }),
  deleteRoom: (id: string) => request<{ ok: boolean }>(`/admin/rooms/${id}`, { method: "DELETE" }),

  // System admin
  systemStats: () => request<{ hotels: number; active_hotels: number; managers: number; staff: number; guests: number; users: number; reservations: number; requests: number; ai_messages: number }>("/system/stats"),
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
  managerReports: () => request<{ reservations: number; open_requests: number; staff: number; rooms: number }>("/manager/reports"),
  managerHotel: () => request<Hotel>("/manager/hotel"),
  updateManagerHotel: (b: Partial<Pick<Hotel, "hotel_name" | "city" | "address" | "services">>) =>
    request<Hotel>("/manager/hotel", { method: "PATCH", body: JSON.stringify(b) }),
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
