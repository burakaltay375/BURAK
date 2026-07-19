export type AdminRequestType = "quotation" | "recruitment" | "inspection";

export type PanterRequest = {
  id: string;
  type: AdminRequestType;
  payload: Record<string, string>;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type DashboardStats = {
  today_inspections: number;
  pending_inspections: number;
  new_cvs: number;
  ai_conversations: number;
  new_quotation_requests: number;
  calendar_widgets?: {
    today_schedule: Appointment[];
    upcoming_events: Appointment[];
    upcoming_inspections: Appointment[];
    upcoming_meetings: Appointment[];
  };
  statistics: Record<string, number>;
};

export type PanterCv = {
  id: string;
  candidate_name: string;
  email?: string | null;
  phone?: string | null;
  file_name: string;
  mime_type: string;
  ai_score: number;
  status: string;
  notes?: string | null;
  interview_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  event_type?: string | null;
  priority?: string | null;
  status?: string | null;
  assigned_employee_id?: string | null;
  assigned_employee_name?: string | null;
  customer?: string | null;
  project?: string | null;
  address?: string | null;
  attachments?: Array<Record<string, string>>;
  view_type?: string | null;
  request_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type AiConversation = {
  session_id: string;
  message_count: number;
  updated_at?: string | null;
  messages: Array<{ id: string; role: string; content: string; created_at: string }>;
};

export type AiDocument = {
  id: string;
  title: string;
  content?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  created_at: string;
  updated_at: string;
};

export type Employee = {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  active_projects: number;
  status: string;
  contact: { email?: string | null; phone?: string | null };
};

export type ShiftEmployeeInput = {
  id?: string;
  name: string;
  position?: string;
  certificates: string[];
  armed: boolean;
  salary: number;
  overtime_cost: number;
  availability: string[];
  leave_days: string[];
  weekly_working_hours: number;
  maximum_working_hours: number;
  preferred_shift?: string;
  skills: string[];
  assigned_projects: string[];
};

export type ShiftPlanInput = {
  project: string;
  date_range: { start: string; end: string };
  working_hours?: string;
  shift_times: Array<{ name: string; start: string; end: string; required_number_of_employees?: number; required_armed_guards?: number; required_unarmed_guards?: number }>;
  required_number_of_employees: number;
  required_roles: string[];
  required_certificates: string[];
  required_armed_guards: number;
  required_unarmed_guards: number;
  labor_rules: Record<string, unknown>;
  employees: ShiftEmployeeInput[];
};

export type ShiftPlan = {
  id: string;
  project: string;
  input: ShiftPlanInput;
  options: Array<Record<string, any>>;
  recommended_option: string;
  schedule: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SecurityPostInput = {
  id?: string;
  post_name: string;
  required_personnel: number;
  armed_required: boolean;
  armed_requirement?: "Armed" | "Unarmed" | "Both";
  fixed_position: boolean;
  patrol_duty: boolean;
};

export type ProjectPersonnelRequirements = {
  total_required_personnel: number;
  required_armed_security_guards: number;
  required_unarmed_security_guards: number;
  required_shift_supervisors: number;
  required_reception_personnel: number;
  required_mobile_patrol_personnel: number;
};

export type ProjectShiftConfiguration = {
  number_of_shifts: number;
  morning_shift_start?: string;
  morning_shift_end?: string;
  evening_shift_start?: string;
  evening_shift_end?: string;
  night_shift_start?: string;
  night_shift_end?: string;
  shift_duration: "8 Hour" | "12 Hour" | "Custom Shift";
  custom_shift_hours?: number;
};

export type ProjectEmployeeInput = {
  id?: string;
  name: string;
  position: string;
  armed: boolean;
  duty?: string;
  certificates: string[];
  skills: string[];
  weekly_working_hours: number;
  maximum_working_hours: number;
  preferred_shift?: string;
};

export type ProjectInput = {
  project_name: string;
  customer_company_name: string;
  project_code?: string;
  project_start_date: string;
  project_end_date?: string;
  project_status: "Active" | "Passive";
  personnel_requirements: ProjectPersonnelRequirements;
  shift_configuration: ProjectShiftConfiguration;
  security_posts: SecurityPostInput[];
  employees: ProjectEmployeeInput[];
  labor_rules: Record<string, unknown>;
  company_policies: Record<string, unknown>;
};

export type PanterProject = ProjectInput & {
  id: string;
  project_code: string;
  validation_warnings: string[];
  ai_recommendations: Array<{ title: string; description: string; reason: string }>;
  created_at: string;
  updated_at: string;
};

export type SupportRequestInput = {
  destination_project_id: string;
  required_personnel: number;
  armed_requirement: "Armed" | "Unarmed" | "Any";
  required_position?: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
};

export type SupportRecommendation = {
  employee_id: string;
  employee_name: string;
  current_project_id?: string | null;
  current_project: string;
  position: string;
  qualification: string;
  reason_for_recommendation: string;
  expected_overtime_impact: number;
  staffing_impact_on_original_project: string;
  selected_explanation: string;
};

export type SupportAnalysis = {
  recommendations: SupportRecommendation[];
  rejected_candidates: Array<{ employee_id: string; employee_name: string; reasons: string[] }>;
  blocking_warnings: string[];
  analysis_summary: Record<string, number>;
};

export type SupportRequest = SupportRequestInput & {
  id: string;
  destination_project_name?: string;
  status: string;
  analysis?: SupportAnalysis;
  requested_by_name?: string;
  approved_employee_ids?: string[];
  created_at: string;
  updated_at: string;
};

export type SupportAssignment = {
  id: string;
  request_id: string;
  employee_id: string;
  employee_name: string;
  source_project?: string;
  destination_project?: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
  status: string;
  created_at: string;
};

export type SupportStats = {
  total_support_requests: number;
  total_support_assignments: number;
  most_requested_projects: Array<[string, number]>;
  most_transferred_employees: Array<[string, number]>;
  monthly_support_history: Array<[string, number]>;
};

const apiBase = (process.env.NEXT_PUBLIC_PANTER_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

async function request<T>(path: string, token: string | null, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail = typeof data === "object" && data && "detail" in data ? (data as { detail?: unknown }).detail : null;
    throw new Error(typeof detail === "string" ? detail : response.statusText || "İstek başarısız");
  }

  return data as T;
}

export const panterAdminApi = {
  login: (email: string, password: string) =>
    request<{ token: string }>("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  dashboard: (token: string) => request<DashboardStats>("/panter/admin/dashboard", token),
  cvs: (token: string, params = "") => request<PanterCv[]>(`/panter/admin/cvs${params}`, token),
  uploadCv: (token: string, payload: Record<string, string>) =>
    request<PanterCv>("/panter/admin/cvs", token, { method: "POST", body: JSON.stringify(payload) }),
  updateCv: (token: string, id: string, payload: Record<string, string | number>) =>
    request<PanterCv>(`/panter/admin/cvs/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  downloadCv: async (token: string, id: string, fileName: string) => {
    const response = await fetch(`${apiBase}/panter/admin/cvs/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("CV indirilemedi.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "cv";
    link.click();
    URL.revokeObjectURL(url);
  },
  cvAction: (token: string, id: string, action: "interview" | "reject" | "hire", payload: Record<string, string> = {}) =>
    request<PanterCv>(`/panter/admin/cvs/${id}/${action}`, token, { method: "POST", body: JSON.stringify(payload) }),
  appointments: (token: string, params = "") => request<Appointment[]>(`/panter/admin/appointments${params}`, token),
  createAppointment: (token: string, payload: Record<string, unknown>) =>
    request<Appointment>("/panter/admin/appointments", token, { method: "POST", body: JSON.stringify(payload) }),
  updateAppointment: (token: string, id: string, payload: Record<string, unknown>) =>
    request<Appointment>(`/panter/admin/appointments/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAppointment: (token: string, id: string) =>
    request<{ ok: boolean }>(`/panter/admin/appointments/${id}`, token, { method: "DELETE" }),
  inspections: (token: string) => request<PanterRequest[]>("/panter/admin/inspection-requests", token),
  createInspection: (token: string, payload: Record<string, string>) =>
    request<PanterRequest>("/panter/admin/inspection-requests", token, { method: "POST", body: JSON.stringify({ type: "inspection", payload, source: "admin-dashboard" }) }),
  updateInspectionStatus: (token: string, id: string, status: string, notes = "") =>
    request<PanterRequest>(`/panter/admin/inspection-requests/${id}/status`, token, { method: "PATCH", body: JSON.stringify({ status, notes }) }),
  assignInspector: (token: string, id: string, inspector_id: string) =>
    request<PanterRequest>(`/panter/admin/inspection-requests/${id}/assign`, token, { method: "POST", body: JSON.stringify({ inspector_id }) }),
  uploadInspectionReport: (token: string, id: string, payload: Record<string, string>) =>
    request<PanterRequest>(`/panter/admin/inspection-requests/${id}/report`, token, { method: "POST", body: JSON.stringify(payload) }),
  inspectionHistory: (token: string, id: string) => request<Array<Record<string, string>>>(`/panter/admin/inspection-requests/${id}/history`, token),
  quotations: (token: string) => request<PanterRequest[]>("/panter/admin/quotations", token),
  updateQuotation: (token: string, id: string, payload: Record<string, string>) =>
    request<PanterRequest>(`/panter/admin/quotations/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  aiConversations: (token: string) => request<AiConversation[]>("/panter/admin/ai/conversations", token),
  aiKnowledge: (token: string) => request<{ id: string; content: string }>("/panter/admin/ai/knowledge", token),
  saveAiKnowledge: (token: string, content: string) =>
    request<{ id: string; content: string }>("/panter/admin/ai/knowledge", token, { method: "PUT", body: JSON.stringify({ content }) }),
  aiDocuments: (token: string) => request<AiDocument[]>("/panter/admin/ai/documents", token),
  uploadAiDocument: (token: string, payload: Record<string, string>) =>
    request<AiDocument>("/panter/admin/ai/documents", token, { method: "POST", body: JSON.stringify(payload) }),
  trainAi: (token: string, instructions: string) =>
    request<Record<string, string>>("/panter/admin/ai/training", token, { method: "POST", body: JSON.stringify({ instructions }) }),
  aiFeedback: (token: string) => request<Array<Record<string, string>>>("/panter/admin/ai/feedback", token),
  employees: (token: string) => request<Employee[]>("/panter/admin/employees", token),
  projects: (token: string, params = "") => request<PanterProject[]>(`/panter/admin/projects${params}`, token),
  createProject: (token: string, payload: ProjectInput) =>
    request<PanterProject>("/panter/admin/projects", token, { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (token: string, id: string, payload: Partial<ProjectInput>) =>
    request<PanterProject>(`/panter/admin/projects/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteProject: (token: string, id: string) =>
    request<{ ok: boolean }>(`/panter/admin/projects/${id}`, token, { method: "DELETE" }),
  assistProject: (token: string, payload: ProjectInput) =>
    request<{ validation_warnings: string[]; ai_recommendations: PanterProject["ai_recommendations"]; suggested_posts: string[] }>("/panter/admin/projects/assist", token, { method: "POST", body: JSON.stringify(payload) }),
  supportRequests: (token: string) => request<SupportRequest[]>("/panter/admin/support-requests", token),
  createSupportRequest: (token: string, payload: SupportRequestInput) =>
    request<SupportRequest>("/panter/admin/support-requests", token, { method: "POST", body: JSON.stringify(payload) }),
  updateSupportRequest: (token: string, id: string, payload: Partial<SupportRequestInput> & { status?: string }) =>
    request<SupportRequest>(`/panter/admin/support-requests/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  analyzeSupportRequest: (token: string, id: string) =>
    request<SupportAnalysis>(`/panter/admin/support-requests/${id}/analyze`, token, { method: "POST" }),
  approveSupportRequest: (token: string, id: string, employee_ids: string[], notes = "") =>
    request<SupportRequest>(`/panter/admin/support-requests/${id}/approve`, token, { method: "POST", body: JSON.stringify({ employee_ids, notes }) }),
  rejectSupportRequest: (token: string, id: string, notes = "") =>
    request<SupportRequest>(`/panter/admin/support-requests/${id}/reject`, token, { method: "POST", body: JSON.stringify({ notes }) }),
  supportAssignments: (token: string) => request<SupportAssignment[]>("/panter/admin/support-assignments", token),
  supportAudit: (token: string, id: string) => request<Array<Record<string, unknown>>>(`/panter/admin/support-requests/${id}/audit`, token),
  supportStats: (token: string) => request<SupportStats>("/panter/admin/support-stats", token),
  generateShiftPlan: (token: string, payload: ShiftPlanInput) =>
    request<ShiftPlan>("/panter/admin/shift-plans/generate", token, { method: "POST", body: JSON.stringify(payload) }),
  shiftPlans: (token: string) => request<ShiftPlan[]>("/panter/admin/shift-plans", token),
  updateShiftPlan: (token: string, id: string, payload: Record<string, unknown>) =>
    request<ShiftPlan>(`/panter/admin/shift-plans/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  approveShiftPlan: (token: string, id: string) =>
    request<ShiftPlan>(`/panter/admin/shift-plans/${id}/approve`, token, { method: "POST" }),
  shiftPlanAudit: (token: string, id: string) => request<Array<Record<string, unknown>>>(`/panter/admin/shift-plans/${id}/audit`, token),
  exportShiftPlan: async (token: string, id: string, format: "excel" | "pdf" = "excel") => {
    const response = await fetch(`${apiBase}/panter/admin/shift-plans/${id}/export?format=${encodeURIComponent(format)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Vardiya planı indirilemedi.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shift-plan-${id}.${format === "pdf" ? "pdf" : "csv"}`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
