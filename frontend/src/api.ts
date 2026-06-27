// Backend API client (Otel Akıllı Operasyon Merkezi)
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
const API = `${BASE}/api`;

const TOKEN_KEY = "hotel_ops_token";

export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
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
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.detail || res.statusText || "İstek başarısız";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export type Role = "guest" | "staff" | "admin";

export type User = {
  id: string; email: string; name: string; role: Role;
  department?: string | null; room_no?: string | null;
};

export type AuthOut = { token: string; user: User };

export type RequestItem = {
  id: string; guest_id: string; guest_name: string; room_no: string;
  departman: string; hizmet_turu: string; zaman: string; detay: string;
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
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  room_number: string;
  type: string;
  status: "available" | "occupied";
  created_at: string;
};

export type ChatResp = {
  session_id: string; reply: string; ready: boolean;
  request_id?: string | null; parsed?: Record<string, any> | null;
};

export const api = {
  login: (email: string, password: string) =>
    request<AuthOut>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (b: { email: string; password: string; name: string; role: Role; department?: string; room_no?: string }) =>
    request<AuthOut>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<User>("/auth/me"),
  chat: (message: string, session_id?: string) =>
    request<ChatResp>("/chat", { method: "POST", body: JSON.stringify({ message, session_id }) }),
  myRequests: () => request<RequestItem[]>("/requests/me"),
  deptQueue: () => request<RequestItem[]>("/requests/department"),
  activeJobs: () => request<RequestItem[]>("/requests/active"),
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
  createReservation: (b: { customer_name: string; customer_email: string; customer_phone: string; check_in_date: string; check_out_date: string; room_number?: string }) =>
    request<Reservation>("/reservations", { method: "POST", body: JSON.stringify(b) }),
  checkin: (b: { email: string; access_code: string; new_password: string }) =>
    request<AuthOut>("/checkin", { method: "POST", body: JSON.stringify(b) }),

  // Admin reservations
  listReservations: () => request<Reservation[]>("/admin/reservations"),
  adminCreateReservation: (b: { customer_name: string; customer_email: string; customer_phone: string; check_in_date: string; check_out_date: string; room_number?: string }) =>
    request<Reservation>("/admin/reservations", { method: "POST", body: JSON.stringify(b) }),
  assignRoom: (id: string, room_number: string) =>
    request<Reservation>(`/admin/reservations/${id}/assign-room`, { method: "POST", body: JSON.stringify({ room_number }) }),
  approveCheckin: (id: string) => request<Reservation>(`/admin/reservations/${id}/checkin`, { method: "POST" }),
  completeReservation: (id: string) => request<Reservation>(`/admin/reservations/${id}/complete`, { method: "POST" }),
  cancelReservation: (id: string) => request<Reservation>(`/admin/reservations/${id}/cancel`, { method: "POST" }),

  // Admin rooms
  listRooms: () => request<Room[]>("/admin/rooms"),
  createRoom: (b: { room_number: string; type?: string }) =>
    request<Room>("/admin/rooms", { method: "POST", body: JSON.stringify(b) }),
  deleteRoom: (id: string) => request<{ ok: boolean }>(`/admin/rooms/${id}`, { method: "DELETE" }),
};

export async function transcribeAudio(uri: string): Promise<string> {
  const form = new FormData();
  // @ts-expect-error react-native FormData file
  form.append("file", { uri, name: "audio.m4a", type: "audio/m4a" });
  const headers: Record<string, string> = { ...(await authHeaders()) };
  const res = await fetch(`${API}/voice/transcribe`, {
    method: "POST", body: form as any, headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Transkripsiyon başarısız");
  return data.text as string;
}
