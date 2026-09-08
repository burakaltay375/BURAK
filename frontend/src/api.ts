// Backend API client (Otel Akıllı Operasyon Merkezi)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
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

export type Role = "system_admin" | "hotel_manager" | "staff" | "guest";
export type GuestType = "standard" | "vip" | "casino";
export type PaymentStatus = "pending" | "paid" | "casino_guest" | "vip_guest" | "company_paid";
export type HotelServices = Record<string, boolean>;

export type User = {
  id: string; email: string; name: string; role: Role;
  department?: string | null; room_no?: string | null;
  gender?: string | null; birth_date?: string | null; age?: number | null;
  nationality?: string | null; country?: string | null; region_city?: string | null;
  hotel_id?: string | null; hotelId?: string | null; guest_type?: GuestType | null; identity_status?: string | null; active?: boolean;
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

export type IdentityAlert = {
  id: string;
  hotel_id: string;
  hotelId: string;
  reservation_id?: string | null;
  title: string;
  detail: string;
  severity: "success" | "warning" | "danger" | string;
  read?: boolean;
  created_at: string;
};

export type ReservationStatus = "pending" | "checked_in" | "completed" | "cancelled";

export type Reservation = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  capacity?: number | null;
  room_id?: string | null;
  room_number?: string | null;
  room_name?: string | null;
  price_per_night?: number | null;
  total_nights?: number | null;
  total_price?: number | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  status: ReservationStatus;
  access_code: string;
  user_id?: string | null;
  email_sent?: boolean;
  hotel_id?: string | null;
  payment_status: PaymentStatus;
  guest_type: GuestType;
  identity_verification_requested: boolean;
  identity_status: "not_required" | "waiting_for_verification" | "partially_verified" | "fully_verified" | "verification_failed" | "pending_review" | "verified_by_hotel" | "failed";
  identity_members: { id: string; name: string; relation: string; status: string; verification_id?: string | null }[];
  identity_failure_reason?: string | null;
  entry_code_expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReservationIdentityStartResult = {
  session_id: string;
  status: "waiting_for_verification" | "partially_verified" | "fully_verified" | "verification_failed" | "not_required" | "pending_review" | "verified_by_hotel" | "failed";
  identity_members: { id: string; name: string; relation: string; status: string; verification_id?: string | null }[];
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
  active_reservation_id?: string | null;
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

export type RoomPrice = {
  room_id: string;
  room_number: string;
  room_name?: string | null;
  room_type: RoomType;
  price_per_night: number;
  total_nights: number;
  total_price: number;
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

export type IdentitySubjectType = "guest" | "employee";
export type IdentityDocumentType = "id_front" | "id_back" | "passport" | "selfie" | "other";
export type IdentityStatus =
  | "unverified" | "pending" | "verified" | "rejected" | "expired"
  | "application_received" | "identity_required" | "in_review" | "approved" | "active_employee"
  | "not_started" | "pending_review" | "verified_by_hotel" | "needs_review" | "needs_new_documents" | "suspicious";
export type FraudRisk = "low" | "medium" | "high" | "unknown";
export type AnalysisStatus = "pending" | "completed" | "unavailable" | "failed";

export type IdentityDocument = {
  id: string;
  verification_id: string;
  document_type: IdentityDocumentType;
  file_name: string;
  mime_type: string;
  size: number;
  checksum: string;
  perceptual_hash?: string | null;
  quality?: Record<string, any>;
  uploaded_by: string;
  created_at: string;
};

export type OcrResult = {
  id: string;
  verification_id: string;
  status: AnalysisStatus;
  extracted: Record<string, any>;
  mismatches: string[];
  confidence: number;
  provider: string;
  created_at: string;
};

export type FaceComparisonResult = {
  id: string;
  verification_id: string;
  status: AnalysisStatus;
  face_present: boolean;
  document_face_present: boolean;
  similarity_score: number;
  liveness_score: number;
  completed_actions: string[];
  provider: string;
  created_at: string;
};

export type FraudAnalysis = {
  id: string;
  verification_id: string;
  status: AnalysisStatus;
  fraud_risk: FraudRisk;
  confidence_score: number;
  signals: string[];
  duplicate_hits: string[];
  recommended_status: IdentityStatus;
  provider: string;
  created_at: string;
};

export type LivenessChallenge = {
  id: string;
  actions: string[];
  expires_at: string;
};

export type VerificationHistory = {
  id: string;
  verification_id: string;
  from_status?: string | null;
  to_status: string;
  note?: string | null;
  actor_id: string;
  actor_role: string;
  created_at: string;
};

export type IdentityVerification = {
  id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  hotel_id: string;
  hotelId: string;
  role: Role;
  subject_type: IdentitySubjectType;
  status: IdentityStatus;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  document_type?: string | null;
  masked_document_number?: string | null;
  document_expiry_date?: string | null;
  employee_role?: string | null;
  employment_start_date?: string | null;
  manager_approved?: boolean | null;
  internal_notes?: string | null;
  documents: IdentityDocument[];
  latest_ocr?: OcrResult | null;
  latest_face?: FaceComparisonResult | null;
  latest_fraud?: FraudAnalysis | null;
  confidence_score?: number | null;
  fraud_risk?: FraudRisk | null;
  created_by: string;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type IdentityProfileInput = {
  first_name: string;
  last_name: string;
  birth_date: string;
  nationality: string;
  document_type: string;
  document_number: string;
  document_expiry_date?: string | null;
  employee_role?: string | null;
  employment_start_date?: string | null;
  manager_approved?: boolean | null;
  internal_notes?: string | null;
};

export type IdentityDocumentUpload = {
  document_type: IdentityDocumentType;
  file_name: string;
  mime_type: string;
  data_uri: string;
};

export type IdentitySelfieUpload = {
  file_name?: string;
  mime_type?: string;
  data_uri: string;
  completed_actions: string[];
  challenge_id?: string | null;
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
  startIdentity: (b: { user_id?: string; subject_type?: IdentitySubjectType } = {}) =>
    request<IdentityVerification>("/identity/start", { method: "POST", body: JSON.stringify(b) }),
  myIdentity: () => request<IdentityVerification>("/identity/me"),
  saveMyIdentity: (b: IdentityProfileInput) =>
    request<IdentityVerification>("/identity/me", { method: "PUT", body: JSON.stringify(b) }),
  uploadIdentityDocument: (verificationId: string, b: IdentityDocumentUpload) =>
    request<IdentityDocument>(`/identity/${verificationId}/documents`, { method: "POST", body: JSON.stringify(b) }),
  livenessChallenge: () => request<LivenessChallenge>("/identity/liveness-challenge"),
  uploadIdentitySelfie: (verificationId: string, b: IdentitySelfieUpload) =>
    request<FaceComparisonResult>(`/identity/${verificationId}/selfie`, { method: "POST", body: JSON.stringify(b) }),
  runIdentityOcr: (verificationId: string) =>
    request<OcrResult>(`/identity/${verificationId}/run-ocr`, { method: "POST" }),
  runIdentityFaceComparison: (verificationId: string) =>
    request<FaceComparisonResult>(`/identity/${verificationId}/run-face-comparison`, { method: "POST" }),
  runIdentityFraudAnalysis: (verificationId: string) =>
    request<FraudAnalysis>(`/identity/${verificationId}/run-fraud-analysis`, { method: "POST" }),
  identityHistory: (verificationId: string) => request<VerificationHistory[]>(`/identity/${verificationId}/history`),
  approveIdentity: (verificationId: string, note?: string) =>
    request<IdentityVerification>(`/identity/${verificationId}/approve`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
  rejectIdentity: (verificationId: string, note?: string) =>
    request<IdentityVerification>(`/identity/${verificationId}/reject`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
  requestIdentityDocuments: (verificationId: string, note?: string) =>
    request<IdentityVerification>(`/identity/${verificationId}/request-documents`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
  activateEmployeeIdentity: (verificationId: string, note?: string) =>
    request<IdentityVerification>(`/identity/${verificationId}/activate-employee`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
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

  // Public reservation (no auth required)
  availableRooms: (b: { check_in_date: string; check_out_date: string; capacity: number }) =>
    request<Room[]>(`/rooms/available?check_in_date=${encodeURIComponent(b.check_in_date)}&check_out_date=${encodeURIComponent(b.check_out_date)}&capacity=${encodeURIComponent(String(b.capacity))}`),
  roomPrice: (roomId: string, b: { check_in_date: string; check_out_date: string }) =>
    request<RoomPrice>(`/rooms/${encodeURIComponent(roomId)}/price?check_in_date=${encodeURIComponent(b.check_in_date)}&check_out_date=${encodeURIComponent(b.check_out_date)}`),
  startReservationIdentity: (b: { customer_name: string; customer_email: string; capacity: number; identity_members: { name: string; relation: string }[] }) =>
    request<ReservationIdentityStartResult>("/reservations/identity/start", { method: "POST", body: JSON.stringify(b) }),
  createReservation: (b: { customer_name: string; customer_email: string; customer_phone: string; check_in_date: string; check_out_date: string; capacity?: number; room_id?: string; room_number?: string; payment_status?: PaymentStatus; guest_type?: GuestType; identity_verification_requested?: boolean; identity_members?: { name: string; relation: string }[]; identity_session_id?: string }) =>
    request<Reservation>("/reservations", { method: "POST", body: JSON.stringify(b) }),
  checkin: (b: { email: string; access_code: string; new_password: string }) =>
    request<AuthOut>("/checkin", { method: "POST", body: JSON.stringify(b) }),

  // Admin reservations
  listReservations: () => request<Reservation[]>("/admin/reservations"),
  adminCreateReservation: (b: { customer_name: string; customer_email: string; customer_phone: string; check_in_date: string; check_out_date: string; capacity?: number; room_id?: string; room_number?: string; payment_status?: PaymentStatus; guest_type?: GuestType; identity_verification_requested?: boolean; identity_members?: { name: string; relation: string }[] }) =>
    request<Reservation>("/admin/reservations", { method: "POST", body: JSON.stringify(b) }),
  assignRoom: (id: string, room_number: string, room_id?: string) =>
    request<Reservation>(`/admin/reservations/${id}/assign-room`, { method: "POST", body: JSON.stringify({ room_number, room_id }) }),
  updateReservation: (id: string, b: Partial<Pick<Reservation, "customer_name" | "customer_phone" | "check_in_date" | "check_out_date" | "capacity" | "room_id" | "room_number" | "status" | "payment_status" | "guest_type">>) =>
    request<Reservation>(`/admin/reservations/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  approveCheckin: (id: string) => request<Reservation>(`/admin/reservations/${id}/checkin`, { method: "POST" }),
  approveReservationIdentity: (id: string) => request<Reservation>(`/admin/reservations/${id}/identity/approve`, { method: "POST" }),
  rejectReservationIdentity: (id: string, note?: string) =>
    request<Reservation>(`/admin/reservations/${id}/identity/reject`, { method: "POST", body: JSON.stringify({ note: note || null }) }),
  completeReservation: (id: string) => request<Reservation>(`/admin/reservations/${id}/complete`, { method: "POST" }),
  cancelReservation: (id: string) => request<Reservation>(`/admin/reservations/${id}/cancel`, { method: "POST" }),

  // Admin rooms
  listRooms: () => request<Room[]>("/admin/rooms"),
  adminAvailableRooms: (b: { check_in_date: string; check_out_date: string; capacity: number }) =>
    request<Room[]>(`/admin/rooms/available?check_in_date=${encodeURIComponent(b.check_in_date)}&check_out_date=${encodeURIComponent(b.check_out_date)}&capacity=${encodeURIComponent(String(b.capacity))}`),
  createRoom: (b: RoomInput) =>
    request<Room>("/admin/rooms", { method: "POST", body: JSON.stringify(b) }),
  updateRoom: (id: string, b: Partial<RoomInput>) =>
    request<Room>(`/admin/rooms/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  roomStatus: (id: string) => request<Room>(`/admin/rooms/${id}/status`),
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
  createStaff: (b: { email: string; password: string; name: string; department: string; gender: string; birth_date: string; nationality: string; country: string; region_city: string; start_identity_verification?: boolean }) =>
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
  managerAiKnowledge: () => request<HotelAiKnowledge>("/manager/ai-knowledge"),
  saveManagerAiKnowledge: (b: HotelAiKnowledgeInput) =>
    request<HotelAiKnowledge>("/manager/ai-knowledge", { method: "PUT", body: JSON.stringify(b) }),
  deleteManagerAiKnowledge: () => request<{ ok: boolean }>("/manager/ai-knowledge", { method: "DELETE" }),
  staffAiKnowledge: () => request<HotelAiKnowledge>("/staff/ai-knowledge"),
  systemAiKnowledge: (hotelId: string) =>
    request<HotelAiKnowledge>(`/system/ai-knowledge?hotel_id=${encodeURIComponent(hotelId)}`),
  managerIdentity: () => request<IdentityVerification[]>("/manager/identity"),
  managerIdentityAlerts: () => request<IdentityAlert[]>("/manager/identity-alerts"),
  systemIdentity: (hotelId?: string) =>
    request<IdentityVerification[]>(`/system/identity${hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : ""}`),
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

export async function fetchIdentityDocumentUri(verificationId: string, documentId: string): Promise<string> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  const res = await fetch(`${API}/identity/${encodeURIComponent(verificationId)}/documents/${encodeURIComponent(documentId)}`, { headers });
  if (!res.ok) throw new Error("Belge görüntülenemedi");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
