"use client";

import { FormEvent, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useAdminResource } from "@/hooks/useAdminResource";
import { panterAdminApi, type Appointment, type PanterProject, type PanterRequest, type ProjectInput, type ShiftEmployeeInput, type ShiftPlan, type ShiftPlanInput, type SupportRequestInput } from "@/lib/panterAdminApi";

const inspectionStatuses = [
  "Pending Inspection",
  "Scheduled",
  "Inspector Assigned",
  "Inspection In Progress",
  "Inspection Completed",
  "Report Uploaded",
  "Cancelled",
];

const quotationStatuses = ["New Quotation", "Contacted", "Preparing Offer", "Offer Sent", "Won", "Lost"];
const cvStatuses = ["New", "HR Review", "Interview", "Rejected", "Hired"];
const calendarViews = ["daily", "weekly", "monthly"];
const eventTypes = ["Security Inspection", "Customer Meeting", "Site Survey", "Employee Training", "Internal Meeting", "Equipment Maintenance", "Reminder", "Other"];
const eventStatuses = ["Pending", "Scheduled", "Confirmed", "In Progress", "Completed", "Cancelled"];
const eventPriorities = ["Low", "Medium", "High", "Urgent"];

const labelMap: Record<string, string> = {
  "Pending Inspection": "İnceleme Bekliyor",
  Scheduled: "Planlandı",
  "Inspector Assigned": "Denetçi Atandı",
  "Inspection In Progress": "İnceleme Devam Ediyor",
  "Inspection Completed": "İnceleme Tamamlandı",
  "Report Uploaded": "Rapor Yüklendi",
  Cancelled: "İptal Edildi",
  "New Quotation": "Yeni Teklif",
  Contacted: "İletişime Geçildi",
  "Preparing Offer": "Teklif Hazırlanıyor",
  "Offer Sent": "Teklif Gönderildi",
  Won: "Kazanıldı",
  Lost: "Kaybedildi",
  New: "Yeni",
  "HR Review": "İK İncelemesi",
  Interview: "Mülakat",
  Rejected: "Reddedildi",
  Hired: "İşe Alındı",
  daily: "Günlük",
  weekly: "Haftalık",
  monthly: "Aylık",
  "Security Inspection": "Güvenlik İncelemesi",
  "Customer Meeting": "Müşteri Toplantısı",
  "Site Survey": "Saha Keşfi",
  "Employee Training": "Personel Eğitimi",
  "Internal Meeting": "İç Toplantı",
  "Equipment Maintenance": "Ekipman Bakımı",
  Reminder: "Hatırlatma",
  Other: "Diğer",
  Pending: "Bekliyor",
  Confirmed: "Onaylandı",
  "In Progress": "Devam Ediyor",
  Completed: "Tamamlandı",
  Low: "Düşük",
  Medium: "Orta",
  High: "Yüksek",
  Urgent: "Acil",
  quotation: "Teklif",
  recruitment: "İşe Başvuru",
  inspection: "İnceleme",
  Draft: "Taslak",
  Approved: "Onaylandı",
  "Option A": "Seçenek A",
  "Option B": "Seçenek B",
  "Option C": "Seçenek C",
  active: "Aktif",
  inactive: "Pasif",
  Active: "Aktif",
  Passive: "Pasif",
  Day: "Gündüz",
  Evening: "Akşam",
  Night: "Gece",
  "8 Hour": "8 Saat",
  "12 Hour": "12 Saat",
  "Custom Shift": "Özel Vardiya",
  Armed: "Silahlı",
  Unarmed: "Silahsız",
  Any: "Fark Etmez",
};

const fieldLabelMap: Record<string, string> = {
  total_requests: "Toplam Talep",
  total_cvs: "Toplam CV",
  hired_candidates: "İşe Alınan Aday",
  rejected_candidates: "Reddedilen Aday",
  appointments: "Takvim Etkinliği",
  employees: "Personel",
  projects: "Proje",
  active_projects: "Aktif Proje",
  company: "Şirket",
  name: "Ad Soyad",
  phone: "Telefon",
  email: "E-posta",
  city: "Şehir",
  service: "Hizmet",
  notes: "Notlar",
  projectName: "Proje Adı",
  projectAddress: "Proje Adresi",
  status: "Durum",
  inspectionType: "İnceleme Türü",
  preferredDate: "Tercih Edilen Tarih",
  preferredTime: "Tercih Edilen Saat",
  event_type: "Etkinlik Türü",
  start_time: "Başlangıç Saati",
  end_time: "Bitiş Saati",
  assigned_employee_name: "Atanan Personel",
  customer: "Müşteri",
  project: "Proje",
  address: "Adres",
  priority: "Öncelik",
};

function label(value?: string | null) {
  return value ? labelMap[value] || value : "-";
}

function fieldLabel(value: string) {
  return fieldLabelMap[value] || value.replaceAll("_", " ");
}

function optionReason(value?: string) {
  if (!value) return "";
  if (value.includes("lowest labor cost")) return "En düşük işçilik maliyetini önceliklendiren plan.";
  if (value.includes("overtime minimization")) return "Fazla mesaiyi en aza indirmeyi önceliklendiren plan.";
  if (value.includes("balanced workload")) return "İş yükünü personeller arasında en dengeli dağıtan plan.";
  return value;
}

const emptyEvent = {
  title: "",
  description: "",
  date: "",
  start_time: "",
  end_time: "",
  event_type: "Security Inspection",
  priority: "Medium",
  status: "Scheduled",
  assigned_employee_id: "",
  customer: "",
  project: "",
  address: "",
  notes: "",
};

const emptyShiftEmployee: ShiftEmployeeInput = {
  name: "",
  position: "Güvenlik Görevlisi",
  certificates: [],
  armed: false,
  salary: 0,
  overtime_cost: 0,
  availability: [],
  leave_days: [],
  weekly_working_hours: 0,
  maximum_working_hours: 45,
  preferred_shift: "",
  skills: [],
  assigned_projects: [],
};

const defaultShiftPlan: ShiftPlanInput = {
  project: "",
  date_range: { start: "", end: "" },
  working_hours: "24/7",
  shift_times: [
    { name: "Gündüz", start: "08:00", end: "16:00", required_number_of_employees: 2, required_armed_guards: 0, required_unarmed_guards: 2 },
    { name: "Akşam", start: "16:00", end: "00:00", required_number_of_employees: 2, required_armed_guards: 0, required_unarmed_guards: 2 },
    { name: "Gece", start: "00:00", end: "08:00", required_number_of_employees: 2, required_armed_guards: 0, required_unarmed_guards: 2 },
  ],
  required_number_of_employees: 2,
  required_roles: ["Güvenlik Görevlisi"],
  required_certificates: [],
  required_armed_guards: 0,
  required_unarmed_guards: 2,
  labor_rules: { minimum_rest_hours: 8 },
  employees: [{ ...emptyShiftEmployee }],
};

const defaultProjectInput: ProjectInput = {
  project_name: "",
  customer_company_name: "",
  project_code: "",
  project_start_date: "",
  project_end_date: "",
  project_status: "Active",
  personnel_requirements: {
    total_required_personnel: 0,
    required_armed_security_guards: 0,
    required_unarmed_security_guards: 0,
    required_shift_supervisors: 0,
    required_reception_personnel: 0,
    required_mobile_patrol_personnel: 0,
  },
  shift_configuration: {
    number_of_shifts: 3,
    morning_shift_start: "08:00",
    morning_shift_end: "16:00",
    evening_shift_start: "16:00",
    evening_shift_end: "00:00",
    night_shift_start: "00:00",
    night_shift_end: "08:00",
    shift_duration: "8 Hour",
    custom_shift_hours: 8,
  },
  security_posts: [],
  employees: [],
  labor_rules: {
    minimum_rest_hours: 8,
    weekly_hour_limit: 45,
  },
  company_policies: {
    overtime_requires_approval: true,
  },
};

const defaultSupportRequest: SupportRequestInput = {
  destination_project_id: "",
  required_personnel: 1,
  armed_requirement: "Any",
  required_position: "",
  date: "",
  start_time: "08:00",
  end_time: "16:00",
  reason: "",
  priority: "Medium",
};

function projectPersonnelUsed(project: ProjectInput) {
  const req = project.personnel_requirements;
  return req.required_armed_security_guards
    + req.required_unarmed_security_guards
    + req.required_shift_supervisors
    + req.required_reception_personnel
    + req.required_mobile_patrol_personnel;
}

function projectPostPersonnel(project: ProjectInput) {
  return project.security_posts.reduce((total, post) => total + (Number(post.required_personnel) || 0), 0);
}

function localProjectWarnings(project: ProjectInput) {
  const warnings: string[] = [];
  const req = project.personnel_requirements;
  const used = projectPersonnelUsed(project);
  const postTotal = projectPostPersonnel(project);
  if (used > req.total_required_personnel) warnings.push("Silahlı + silahsız + diğer personel toplamı toplam personeli geçemez.");
  if (req.required_armed_security_guards > req.total_required_personnel) warnings.push("Silahlı personel sayısı toplam personeli geçemez.");
  if (postTotal > req.total_required_personnel) warnings.push("Postlara atanan personel toplamı kullanılabilir personeli geçiyor.");
  if (!project.project_name.trim()) warnings.push("Proje adı gerekli.");
  if (!project.customer_company_name.trim()) warnings.push("Müşteri / şirket adı gerekli.");
  if (!project.project_start_date.trim()) warnings.push("Proje başlangıç tarihi gerekli.");
  if (project.shift_configuration.number_of_shifts < 1) warnings.push("Vardiya sayısı en az 1 olmalı.");
  if (project.shift_configuration.shift_duration === "Custom Shift" && !project.shift_configuration.custom_shift_hours) warnings.push("Özel vardiya için vardiya süresi girilmeli.");
  return warnings;
}

function projectAiRecommendations(project: ProjectInput) {
  const recommendations = [
    {
      title: "Önerilen postlar",
      description: project.security_posts.length ? "Tanımlı postlar vardiya planlamaya aktarılmaya hazır." : "Ana giriş, resepsiyon, mobil devriye ve kontrol odası postlarını ekleyebilirsiniz.",
      reason: "Postlar görev alanını netleştirir ve AI vardiya planlayıcının doğru personeli doğru noktaya atamasını sağlar.",
    },
    {
      title: "Personel dağılımı",
      description: `Toplam ${project.personnel_requirements.total_required_personnel} personelin ${projectPersonnelUsed(project)} tanesi rol bazında dağıtıldı.`,
      reason: "Toplam personel ile rol dağılımı tutarlı olursa vardiya planında eksik kapsama riski azalır.",
    },
  ];
  if (project.personnel_requirements.total_required_personnel >= 8 && project.personnel_requirements.required_shift_supervisors === 0) {
    recommendations.push({
      title: "Vardiya amiri önerisi",
      description: "Bu büyüklükteki projede en az bir vardiya amiri tanımlayın.",
      reason: "Operasyon takibi, raporlama ve acil durum koordinasyonu için yönetici rolü gerekir.",
    });
  }
  return recommendations;
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function readFileAsDataUri(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

function exportEvents(events: Appointment[]) {
  const headers = ["Başlık", "Tür", "Tarih", "Başlangıç", "Bitiş", "Öncelik", "Durum", "Personel", "Müşteri", "Proje", "Adres", "Notlar"];
  const rows = events.map((event) => [
    event.title,
    event.event_type || "",
    event.date,
    event.start_time || "",
    event.end_time || "",
    event.priority || "",
    event.status || "",
    event.assigned_employee_name || "",
    event.customer || "",
    event.project || "",
    event.address || "",
    event.notes || "",
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "panter-operasyon-takvimi.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string | null) {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthDays(activeDate: Date) {
  const first = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function weekDays(activeDate: Date) {
  const mondayOffset = (activeDate.getDay() + 6) % 7;
  const start = addDays(activeDate, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function calendarTitle(date: Date, view: string) {
  if (view === "daily") return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  if (view === "weekly") {
    const days = weekDays(date);
    return `${days[0].toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} - ${days[6].toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

function eventColor(eventType?: string | null) {
  const colors: Record<string, string> = {
    "Security Inspection": "bg-red-600 text-white border-red-700",
    "Customer Meeting": "bg-blue-600 text-white border-blue-700",
    "Site Survey": "bg-amber-500 text-zinc-950 border-amber-600",
    "Employee Training": "bg-emerald-600 text-white border-emerald-700",
    "Internal Meeting": "bg-violet-600 text-white border-violet-700",
    "Equipment Maintenance": "bg-zinc-700 text-white border-zinc-800",
    Reminder: "bg-cyan-500 text-zinc-950 border-cyan-600",
    Other: "bg-zinc-200 text-zinc-900 border-zinc-300",
  };
  return colors[eventType || "Other"] || colors.Other;
}

function eventsByDate(events: Appointment[]) {
  return events.reduce<Record<string, Appointment[]>>((acc, event) => {
    const key = event.date || isoDate(new Date());
    acc[key] = [...(acc[key] || []), event];
    return acc;
  }, {});
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cvSearch, setCvSearch] = useState("");
  const [cvStatus, setCvStatus] = useState("");
  const [cvUpload, setCvUpload] = useState({ candidate_name: "", email: "", phone: "", notes: "" });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [appointment, setAppointment] = useState(emptyEvent);
  const [appointmentAttachment, setAppointmentAttachment] = useState<File | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState("");
  const [calendarView, setCalendarView] = useState("monthly");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(isoDate(new Date()));
  const [calendarSearch, setCalendarSearch] = useState("");
  const [calendarFilters, setCalendarFilters] = useState({ event_type: "", status: "", priority: "" });
  const [newInspection, setNewInspection] = useState({ company: "", name: "", phone: "", city: "", projectAddress: "", reason: "" });
  const [reportFiles, setReportFiles] = useState<Record<string, File | null>>({});
  const [knowledge, setKnowledge] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [trainingInstructions, setTrainingInstructions] = useState("");
  const [histories, setHistories] = useState<Record<string, Array<Record<string, string>>>>({});
  const [projectWizardStep, setProjectWizardStep] = useState(1);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState("");
  const [projectDraft, setProjectDraft] = useState<ProjectInput>(defaultProjectInput);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [projectAssistance, setProjectAssistance] = useState<{ validation_warnings: string[]; ai_recommendations: PanterProject["ai_recommendations"]; suggested_posts: string[] } | null>(null);
  const [supportDraft, setSupportDraft] = useState<SupportRequestInput>(defaultSupportRequest);
  const [editingSupportId, setEditingSupportId] = useState("");
  const [selectedSupportEmployees, setSelectedSupportEmployees] = useState<Record<string, string[]>>({});
  const [supportAudit, setSupportAudit] = useState<Array<Record<string, unknown>>>([]);
  const [shiftInput, setShiftInput] = useState(defaultShiftPlan);
  const [selectedShiftPlan, setSelectedShiftPlan] = useState<ShiftPlan | null>(null);
  const [shiftAudit, setShiftAudit] = useState<Array<Record<string, unknown>>>([]);

  const enabled = Boolean(token);
  const dashboard = useAdminResource(enabled, useCallback(() => panterAdminApi.dashboard(token), [token]));
  const cvs = useAdminResource(enabled, useCallback(() => panterAdminApi.cvs(token, `?search=${encodeURIComponent(cvSearch)}&status=${encodeURIComponent(cvStatus)}`), [token, cvSearch, cvStatus]));
  const appointments = useAdminResource(
    enabled,
    useCallback(() => {
      const params = new URLSearchParams();
      if (calendarSearch) params.set("search", calendarSearch);
      if (calendarFilters.event_type) params.set("event_type", calendarFilters.event_type);
      if (calendarFilters.status) params.set("status", calendarFilters.status);
      if (calendarFilters.priority) params.set("priority", calendarFilters.priority);
      return panterAdminApi.appointments(token, `?${params.toString()}`);
    }, [token, calendarSearch, calendarFilters]),
  );
  const inspections = useAdminResource(enabled, useCallback(() => panterAdminApi.inspections(token), [token]));
  const quotations = useAdminResource(enabled, useCallback(() => panterAdminApi.quotations(token), [token]));
  const conversations = useAdminResource(enabled, useCallback(() => panterAdminApi.aiConversations(token), [token]));
  const aiKnowledge = useAdminResource(enabled, useCallback(() => panterAdminApi.aiKnowledge(token), [token]));
  const aiDocuments = useAdminResource(enabled, useCallback(() => panterAdminApi.aiDocuments(token), [token]));
  const aiFeedback = useAdminResource(enabled, useCallback(() => panterAdminApi.aiFeedback(token), [token]));
  const employees = useAdminResource(enabled, useCallback(() => panterAdminApi.employees(token), [token]));
  const projects = useAdminResource(
    enabled,
    useCallback(() => {
      const params = new URLSearchParams();
      if (projectSearch) params.set("search", projectSearch);
      if (projectStatusFilter) params.set("status", projectStatusFilter);
      return panterAdminApi.projects(token, `?${params.toString()}`);
    }, [token, projectSearch, projectStatusFilter]),
  );
  const supportRequests = useAdminResource(enabled, useCallback(() => panterAdminApi.supportRequests(token), [token]));
  const supportAssignments = useAdminResource(enabled, useCallback(() => panterAdminApi.supportAssignments(token), [token]));
  const supportStats = useAdminResource(enabled, useCallback(() => panterAdminApi.supportStats(token), [token]));
  const shiftPlans = useAdminResource(enabled, useCallback(() => panterAdminApi.shiftPlans(token), [token]));

  const refreshAll = async () => {
    await Promise.all([
      dashboard.reload(),
      cvs.reload(),
      appointments.reload(),
      inspections.reload(),
      quotations.reload(),
      conversations.reload(),
      aiKnowledge.reload(),
      aiDocuments.reload(),
      aiFeedback.reload(),
      employees.reload(),
      projects.reload(),
      supportRequests.reload(),
      supportAssignments.reload(),
      supportStats.reload(),
      shiftPlans.reload(),
    ]);
  };

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await panterAdminApi.login(email, password);
      setToken(data.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>, reload?: () => Promise<void>) => {
    setLoading(true);
    setMessage("");
    try {
      await action();
      await (reload ? reload() : refreshAll());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const uploadCv = async () => {
    if (!cvFile) {
      setMessage("CV dosyası seçin.");
      return;
    }
    const data_uri = await readFileAsDataUri(cvFile);
    await runAction(
      () => panterAdminApi.uploadCv(token, { ...cvUpload, file_name: cvFile.name, mime_type: cvFile.type || "application/pdf", data_uri }),
      cvs.reload,
    );
    setCvUpload({ candidate_name: "", email: "", phone: "", notes: "" });
    setCvFile(null);
  };

  const createAppointment = async () => {
    const payload: Record<string, unknown> = { ...appointment };
    if (appointmentAttachment) {
      payload.attachments = [{
        file_name: appointmentAttachment.name,
        mime_type: appointmentAttachment.type || "application/octet-stream",
        data_uri: await readFileAsDataUri(appointmentAttachment),
      }];
    }
    if (editingAppointmentId) {
      await runAction(() => panterAdminApi.updateAppointment(token, editingAppointmentId, payload), appointments.reload);
    } else {
      await runAction(() => panterAdminApi.createAppointment(token, payload), appointments.reload);
    }
    setAppointment(emptyEvent);
    setAppointmentAttachment(null);
    setEditingAppointmentId("");
  };

  const updateInspectionStatus = async (requestId: string, status: string) => {
    await runAction(() => panterAdminApi.updateInspectionStatus(token, requestId, status), inspections.reload);
  };

  const showHistory = async (requestId: string) => {
    await runAction(async () => {
      const rows = await panterAdminApi.inspectionHistory(token, requestId);
      setHistories((current) => ({ ...current, [requestId]: rows }));
    });
  };

  const createInspection = async () => {
    await runAction(() => panterAdminApi.createInspection(token, newInspection), inspections.reload);
    setNewInspection({ company: "", name: "", phone: "", city: "", projectAddress: "", reason: "" });
  };

  const uploadInspectionReport = async (requestId: string) => {
    const file = reportFiles[requestId];
    if (!file) {
      setMessage("Rapor dosyası seçin.");
      return;
    }
    await runAction(
      async () => panterAdminApi.uploadInspectionReport(token, requestId, {
        file_name: file.name,
        mime_type: file.type || "application/pdf",
        data_uri: await readFileAsDataUri(file),
      }),
      inspections.reload,
    );
    setReportFiles((current) => ({ ...current, [requestId]: null }));
  };

  const uploadAiDocument = async () => {
    const payload: Record<string, string> = { title: documentTitle };
    if (documentFile) {
      payload.file_name = documentFile.name;
      payload.mime_type = documentFile.type || "application/octet-stream";
      payload.data_uri = await readFileAsDataUri(documentFile);
    }
    await runAction(() => panterAdminApi.uploadAiDocument(token, payload), aiDocuments.reload);
    setDocumentTitle("");
    setDocumentFile(null);
  };

  const saveProject = async () => {
    const warnings = localProjectWarnings(projectDraft);
    if (warnings.some((warning) => warning.includes("gerekli") || warning.includes("geçemez"))) {
      setMessage(warnings.join(" "));
      return;
    }
    await runAction(
      () => editingProjectId ? panterAdminApi.updateProject(token, editingProjectId, projectDraft) : panterAdminApi.createProject(token, projectDraft),
      projects.reload,
    );
    setProjectDraft(defaultProjectInput);
    setEditingProjectId("");
    setProjectWizardStep(1);
    setProjectAssistance(null);
  };

  const loadProjectForEdit = (project: PanterProject) => {
    setEditingProjectId(project.id);
    setProjectWizardStep(1);
    setProjectDraft({
      project_name: project.project_name,
      customer_company_name: project.customer_company_name,
      project_code: project.project_code || "",
      project_start_date: project.project_start_date,
      project_end_date: project.project_end_date || "",
      project_status: project.project_status,
      personnel_requirements: project.personnel_requirements,
      shift_configuration: project.shift_configuration,
      security_posts: project.security_posts || [],
      employees: project.employees || [],
      labor_rules: project.labor_rules || {},
      company_policies: project.company_policies || {},
    });
    setProjectAssistance({
      validation_warnings: project.validation_warnings || [],
      ai_recommendations: project.ai_recommendations || [],
      suggested_posts: [],
    });
  };

  const requestProjectAssistance = async () => {
    await runAction(async () => {
      setProjectAssistance(await panterAdminApi.assistProject(token, projectDraft));
    });
  };

  const generateShiftFromProject = async () => {
    if (!projectDraft.project_name || !projectDraft.project_start_date || !projectDraft.employees.length) {
      setMessage("AI vardiya için proje adı, başlangıç tarihi ve en az bir çalışan gerekli.");
      return;
    }
    const shiftTimes = [
      { name: "Gündüz", start: projectDraft.shift_configuration.morning_shift_start || "08:00", end: projectDraft.shift_configuration.morning_shift_end || "16:00" },
      { name: "Akşam", start: projectDraft.shift_configuration.evening_shift_start || "16:00", end: projectDraft.shift_configuration.evening_shift_end || "00:00" },
      { name: "Gece", start: projectDraft.shift_configuration.night_shift_start || "00:00", end: projectDraft.shift_configuration.night_shift_end || "08:00" },
    ].slice(0, projectDraft.shift_configuration.number_of_shifts).map((shift) => ({
      ...shift,
      required_number_of_employees: Math.max(1, Math.ceil(projectDraft.personnel_requirements.total_required_personnel / Math.max(1, projectDraft.shift_configuration.number_of_shifts))),
      required_armed_guards: projectDraft.personnel_requirements.required_armed_security_guards,
      required_unarmed_guards: projectDraft.personnel_requirements.required_unarmed_security_guards,
    }));
    await runAction(async () => {
      const plan = await panterAdminApi.generateShiftPlan(token, {
        project: projectDraft.project_name,
        date_range: { start: projectDraft.project_start_date, end: projectDraft.project_end_date || projectDraft.project_start_date },
        working_hours: projectDraft.shift_configuration.shift_duration,
        shift_times: shiftTimes,
        required_number_of_employees: projectDraft.personnel_requirements.total_required_personnel,
        required_roles: [...new Set(projectDraft.employees.map((employee) => employee.position).filter(Boolean))],
        required_certificates: [],
        required_armed_guards: projectDraft.personnel_requirements.required_armed_security_guards,
        required_unarmed_guards: projectDraft.personnel_requirements.required_unarmed_security_guards,
        labor_rules: projectDraft.labor_rules,
        employees: projectDraft.employees.map((employee) => ({
          id: employee.id,
          name: employee.name,
          position: employee.position || employee.duty || "Güvenlik Görevlisi",
          certificates: employee.certificates || [],
          armed: employee.armed,
          salary: 0,
          overtime_cost: 0,
          availability: [],
          leave_days: [],
          weekly_working_hours: employee.weekly_working_hours || 0,
          maximum_working_hours: employee.maximum_working_hours || 45,
          preferred_shift: employee.preferred_shift || "",
          skills: employee.skills || [],
          assigned_projects: [projectDraft.project_name],
        })),
      });
      setSelectedShiftPlan(plan);
    }, shiftPlans.reload);
  };

  const saveSupportRequest = async () => {
    if (!supportDraft.destination_project_id || !supportDraft.date || !supportDraft.reason.trim()) {
      setMessage("Destek talebi için proje, tarih ve talep nedeni gerekli.");
      return;
    }
    await runAction(
      () => editingSupportId ? panterAdminApi.updateSupportRequest(token, editingSupportId, supportDraft) : panterAdminApi.createSupportRequest(token, supportDraft),
      async () => {
        await supportRequests.reload();
        await supportStats.reload();
      },
    );
    setSupportDraft(defaultSupportRequest);
    setEditingSupportId("");
  };

  const approveSupport = async (requestId: string) => {
    const employeeIds = selectedSupportEmployees[requestId] || [];
    if (!employeeIds.length) {
      setMessage("Onaylamak için en az bir önerilen personel seçin.");
      return;
    }
    await runAction(
      () => panterAdminApi.approveSupportRequest(token, requestId, employeeIds),
      async () => {
        await supportRequests.reload();
        await supportAssignments.reload();
        await supportStats.reload();
      },
    );
  };

  const loadSupportAudit = async (requestId: string) => {
    await runAction(async () => {
      setSupportAudit(await panterAdminApi.supportAudit(token, requestId));
    });
  };

  const generateShiftPlan = async () => {
    await runAction(async () => {
      const plan = await panterAdminApi.generateShiftPlan(token, shiftInput);
      setSelectedShiftPlan(plan);
    }, shiftPlans.reload);
  };

  const applyShiftOption = async (plan: ShiftPlan, option: Record<string, any>) => {
    await runAction(async () => {
      const updated = await panterAdminApi.updateShiftPlan(token, plan.id, {
        schedule: option,
        status: "Draft",
        notes: `Applied ${option.name}`,
      });
      setSelectedShiftPlan(updated);
    }, shiftPlans.reload);
  };

  const approveShiftPlan = async (planId: string) => {
    await runAction(async () => {
      const approved = await panterAdminApi.approveShiftPlan(token, planId);
      setSelectedShiftPlan(approved);
    }, shiftPlans.reload);
  };

  const loadShiftAudit = async (planId: string) => {
    await runAction(async () => {
      setShiftAudit(await panterAdminApi.shiftPlanAudit(token, planId));
    });
  };

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">Panter Admin</p>
            <h1 className="mt-2 text-4xl font-extrabold">Yönetim Paneli</h1>
            <p className="mt-3 max-w-2xl text-zinc-600">
              Panter AI, operasyon takvimi, vardiya planlama, teklifler, başvurular ve çalışan kayıtları burada yönetilir.
            </p>
          </div>
          {token && (
            <button
              type="button"
              onClick={refreshAll}
              className="bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Yenile
            </button>
          )}
        </div>

        {!token ? (
          <form onSubmit={login} className="max-w-md rounded-2xl bg-white p-6 shadow-xl shadow-zinc-200">
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Admin e-posta
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-red-600"
                placeholder="admin@ornek.com"
                type="email"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-zinc-700">
              Şifre
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-red-600"
                placeholder="••••••••"
                type="password"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Bağlanıyor..." : "Admin Paneline Bağlan"}
            </button>
          </form>
        ) : (
          <div className="grid gap-6">
            <Section title="Genel Bakış" error={dashboard.error}>
              <div className="grid gap-3 md:grid-cols-3">
                {dashboard.data ? (
                  <>
                    <Metric label="Bugünkü İncelemeler" value={dashboard.data.today_inspections} />
                    <Metric label="Bekleyen İncelemeler" value={dashboard.data.pending_inspections} />
                    <Metric label="Yeni CV" value={dashboard.data.new_cvs} />
                    <Metric label="AI Görüşmeleri" value={dashboard.data.ai_conversations} />
                    <Metric label="Yeni Teklif" value={dashboard.data.new_quotation_requests} />
                    {Object.entries(dashboard.data.statistics).map(([key, value]) => <Metric key={key} label={key} value={value} />)}
                  </>
                ) : (
                  <Empty loading={dashboard.loading} text="Genel bakış verisi yok." />
                )}
              </div>
            </Section>

            <Section title="Proje Oluşturma" error={projects.error}>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-200/70">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Project Creation Wizard</p>
                      <h3 className="mt-1 text-2xl font-extrabold">{editingProjectId ? "Projeyi Düzenle" : "Yeni Güvenlik Projesi"}</h3>
                      <p className="mt-1 text-sm text-zinc-500">Proje bilgileri AI vardiya planlayıcı tarafından kullanılacak şekilde kaydedilir.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 6].map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setProjectWizardStep(step)}
                          className={projectWizardStep === step ? "btn" : "btn-secondary"}
                        >
                          Adım {step}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    {projectWizardStep === 1 && (
                      <div>
                        <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">1. Proje Bilgileri</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Proje Adı
                            <input value={projectDraft.project_name} onChange={(event) => setProjectDraft((v) => ({ ...v, project_name: event.target.value }))} className="input" placeholder="Örn: AVM Güvenlik Projesi" />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Müşteri / Şirket Adı
                            <input value={projectDraft.customer_company_name} onChange={(event) => setProjectDraft((v) => ({ ...v, customer_company_name: event.target.value }))} className="input" placeholder="Örn: Panter Plaza A.Ş." />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Proje Kodu
                            <input value={projectDraft.project_code || ""} onChange={(event) => setProjectDraft((v) => ({ ...v, project_code: event.target.value }))} className="input" placeholder="Boş kalırsa otomatik oluşturulur" />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Proje Durumu
                            <select value={projectDraft.project_status} onChange={(event) => setProjectDraft((v) => ({ ...v, project_status: event.target.value as ProjectInput["project_status"] }))} className="input">
                              <option value="Active">Aktif</option>
                              <option value="Passive">Pasif</option>
                            </select>
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Başlangıç Tarihi
                            <input value={projectDraft.project_start_date} onChange={(event) => setProjectDraft((v) => ({ ...v, project_start_date: event.target.value }))} className="input" placeholder="YYYY-MM-DD" />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Bitiş Tarihi
                            <input value={projectDraft.project_end_date || ""} onChange={(event) => setProjectDraft((v) => ({ ...v, project_end_date: event.target.value }))} className="input" placeholder="Opsiyonel" />
                          </label>
                        </div>
                      </div>
                    )}

                    {projectWizardStep === 2 && (
                      <div>
                        <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">2. Personel İhtiyacı</p>
                        <div className="grid gap-3 md:grid-cols-3">
                          {[
                            ["total_required_personnel", "Toplam Gerekli Personel"],
                            ["required_armed_security_guards", "Silahlı Güvenlik"],
                            ["required_unarmed_security_guards", "Silahsız Güvenlik"],
                            ["required_shift_supervisors", "Vardiya Amiri"],
                            ["required_reception_personnel", "Resepsiyon Personeli"],
                            ["required_mobile_patrol_personnel", "Mobil Devriye"],
                          ].map(([key, text]) => (
                            <label key={key} className="grid gap-2 text-sm font-bold text-zinc-700">
                              {text}
                              <input
                                value={Number(projectDraft.personnel_requirements[key as keyof ProjectInput["personnel_requirements"]])}
                                onChange={(event) => setProjectDraft((v) => ({
                                  ...v,
                                  personnel_requirements: { ...v.personnel_requirements, [key]: Number(event.target.value) || 0 },
                                }))}
                                className="input"
                                type="number"
                                min={0}
                              />
                            </label>
                          ))}
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <Metric label="Dağıtılan Personel" value={projectPersonnelUsed(projectDraft)} />
                          <Metric label="Toplam Personel" value={projectDraft.personnel_requirements.total_required_personnel} />
                          <Metric label="Kalan Kapasite" value={Math.max(0, projectDraft.personnel_requirements.total_required_personnel - projectPersonnelUsed(projectDraft))} />
                        </div>
                      </div>
                    )}

                    {projectWizardStep === 3 && (
                      <div>
                        <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">3. Vardiya ve Politika Ayarları</p>
                        <div className="grid gap-3 md:grid-cols-4">
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Vardiya Sayısı
                            <input value={projectDraft.shift_configuration.number_of_shifts} onChange={(event) => setProjectDraft((v) => ({ ...v, shift_configuration: { ...v.shift_configuration, number_of_shifts: Number(event.target.value) || 1 } }))} className="input" type="number" min={1} max={3} />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Vardiya Süresi
                            <select value={projectDraft.shift_configuration.shift_duration} onChange={(event) => setProjectDraft((v) => ({ ...v, shift_configuration: { ...v.shift_configuration, shift_duration: event.target.value as ProjectInput["shift_configuration"]["shift_duration"] } }))} className="input">
                              <option value="8 Hour">8 Saat</option>
                              <option value="12 Hour">12 Saat</option>
                              <option value="Custom Shift">Özel Vardiya</option>
                            </select>
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Özel Saat
                            <input value={projectDraft.shift_configuration.custom_shift_hours || ""} onChange={(event) => setProjectDraft((v) => ({ ...v, shift_configuration: { ...v.shift_configuration, custom_shift_hours: Number(event.target.value) || undefined } }))} className="input" placeholder="Örn: 10" type="number" />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700">
                            Minimum Dinlenme
                            <input value={String(projectDraft.labor_rules.minimum_rest_hours || "")} onChange={(event) => setProjectDraft((v) => ({ ...v, labor_rules: { ...v.labor_rules, minimum_rest_hours: Number(event.target.value) || 0 } }))} className="input" placeholder="Yönetici belirler" type="number" />
                          </label>
                          {[
                            ["morning_shift_start", "Sabah Başlangıç"],
                            ["morning_shift_end", "Sabah Bitiş"],
                            ["evening_shift_start", "Akşam Başlangıç"],
                            ["evening_shift_end", "Akşam Bitiş"],
                            ["night_shift_start", "Gece Başlangıç"],
                            ["night_shift_end", "Gece Bitiş"],
                          ].map(([key, text]) => (
                            <label key={key} className="grid gap-2 text-sm font-bold text-zinc-700">
                              {text}
                              <input
                                value={String(projectDraft.shift_configuration[key as keyof ProjectInput["shift_configuration"]] || "")}
                                onChange={(event) => setProjectDraft((v) => ({
                                  ...v,
                                  shift_configuration: { ...v.shift_configuration, [key]: event.target.value },
                                }))}
                                className="input"
                                placeholder="HH:MM"
                              />
                            </label>
                          ))}
                          <label className="grid gap-2 text-sm font-bold text-zinc-700 md:col-span-2">
                            Haftalık Saat Limiti
                            <input value={String(projectDraft.labor_rules.weekly_hour_limit || "")} onChange={(event) => setProjectDraft((v) => ({ ...v, labor_rules: { ...v.labor_rules, weekly_hour_limit: Number(event.target.value) || 0 } }))} className="input" placeholder="Hardcode değil, yönetici belirler" type="number" />
                          </label>
                          <label className="grid gap-2 text-sm font-bold text-zinc-700 md:col-span-2">
                            Şirket Politikası Notu
                            <input value={String(projectDraft.company_policies.notes || "")} onChange={(event) => setProjectDraft((v) => ({ ...v, company_policies: { ...v.company_policies, notes: event.target.value } }))} className="input" placeholder="Örn: Fazla mesai operasyon müdürü onayı gerektirir" />
                          </label>
                        </div>
                      </div>
                    )}

                    {projectWizardStep === 4 && (
                      <div>
                        <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">4. Proje Özeti ve Kontrol</p>
                        <div className="grid gap-3 md:grid-cols-3">
                          <Metric label="Toplam Gerekli Personel" value={projectDraft.personnel_requirements.total_required_personnel} />
                          <Metric label="Rol Bazında Dağıtılan" value={projectPersonnelUsed(projectDraft)} />
                          <Metric label="Görev Noktası Personeli" value={projectPostPersonnel(projectDraft)} />
                        </div>
                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                          <h4 className="font-extrabold">Panter AI ön kontrol</h4>
                          <p className="mt-2 text-sm text-zinc-600">
                            Bu adımda proje personel dağılımı, vardiya ayarları ve görev noktası toplamı kontrol edilir.
                            Görev noktalarını tek tek girmek için 5. adıma geçin.
                          </p>
                          <div className="mt-3 grid gap-2">
                            {projectAiRecommendations(projectDraft).map((item) => (
                              <p key={item.title} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                                <strong>{item.title}:</strong> {item.description}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {projectWizardStep === 5 && (
                      <div>
                        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                          <div>
                            <p className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">5. Görev Noktaları</p>
                            <p className="mt-1 text-sm text-zinc-500">Her güvenlik noktasını tek tek yazın: çalışan sayısı, silahlı/silahsız durumu ve devriye bilgisi burada tutulur.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProjectDraft((v) => ({ ...v, security_posts: [...v.security_posts, { post_name: "", required_personnel: 1, armed_required: false, armed_requirement: "Unarmed", fixed_position: true, patrol_duty: false }] }))}
                            className="btn-secondary"
                          >
                            Görev Noktası Ekle
                          </button>
                        </div>
                        <div className="grid gap-3">
                          {projectDraft.security_posts.map((post, index) => (
                            <div key={post.id || index} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-6">
                              <input value={post.post_name} onChange={(event) => setProjectDraft((v) => ({ ...v, security_posts: v.security_posts.map((item, i) => i === index ? { ...item, post_name: event.target.value } : item) }))} className="input md:col-span-2" placeholder="Görev noktası adı (Örn: Ana giriş)" />
                              <input value={post.required_personnel} onChange={(event) => setProjectDraft((v) => ({ ...v, security_posts: v.security_posts.map((item, i) => i === index ? { ...item, required_personnel: Number(event.target.value) || 0 } : item) }))} className="input" placeholder="Çalışan sayısı" type="number" min={0} />
                              <select
                                value={post.armed_requirement || (post.armed_required ? "Armed" : "Unarmed")}
                                onChange={(event) => setProjectDraft((v) => ({
                                  ...v,
                                  security_posts: v.security_posts.map((item, i) => i === index ? {
                                    ...item,
                                    armed_requirement: event.target.value as "Armed" | "Unarmed" | "Both",
                                    armed_required: event.target.value === "Armed" || event.target.value === "Both",
                                  } : item),
                                }))}
                                className="input"
                              >
                                <option value="Unarmed">Silahsız</option>
                                <option value="Armed">Silahlı</option>
                                <option value="Both">Her ikisi de</option>
                              </select>
                              <select value={post.fixed_position ? "yes" : "no"} onChange={(event) => setProjectDraft((v) => ({ ...v, security_posts: v.security_posts.map((item, i) => i === index ? { ...item, fixed_position: event.target.value === "yes" } : item) }))} className="input">
                                <option value="yes">Sabit nokta</option>
                                <option value="no">Sabit değil</option>
                              </select>
                              <div className="flex gap-2">
                                <select value={post.patrol_duty ? "yes" : "no"} onChange={(event) => setProjectDraft((v) => ({ ...v, security_posts: v.security_posts.map((item, i) => i === index ? { ...item, patrol_duty: event.target.value === "yes" } : item) }))} className="input">
                                  <option value="no">Devriye yok</option>
                                  <option value="yes">Devriye var</option>
                                </select>
                                <button type="button" onClick={() => setProjectDraft((v) => ({ ...v, security_posts: v.security_posts.filter((_, i) => i !== index) }))} className="btn-secondary">Sil</button>
                              </div>
                            </div>
                          ))}
                          {!projectDraft.security_posts.length && <Empty text="Henüz görev noktası eklenmedi. Ana giriş, resepsiyon, otopark, devriye rotası gibi noktaları tek tek ekleyebilirsiniz." />}
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Metric label="Görev Noktalarına Atanan Personel" value={projectPostPersonnel(projectDraft)} />
                          <Metric label="Kullanılabilir Toplam" value={projectDraft.personnel_requirements.total_required_personnel} />
                        </div>
                      </div>
                    )}

                    {projectWizardStep === 6 && (
                      <div>
                        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                          <div>
                            <p className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">6. Çalışanlar</p>
                            <p className="mt-1 text-sm text-zinc-500">Çalışan adı soyadı, silah durumu ve görevi girildiğinde Panter AI bu bilgilerle vardiya planı oluşturabilir.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProjectDraft((v) => ({
                              ...v,
                              employees: [...v.employees, { name: "", position: "Güvenlik Görevlisi", armed: false, duty: "", certificates: [], skills: [], weekly_working_hours: 0, maximum_working_hours: 45, preferred_shift: "" }],
                            }))}
                            className="btn-secondary"
                          >
                            Çalışan Ekle
                          </button>
                        </div>
                        <div className="grid gap-3">
                          {projectDraft.employees.map((employee, index) => (
                            <div key={employee.id || index} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-6">
                              <input value={employee.name} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, name: event.target.value } : item) }))} className="input md:col-span-2" placeholder="Ad Soyad" />
                              <input value={employee.position} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, position: event.target.value } : item) }))} className="input" placeholder="Görevi / Pozisyon" />
                              <select value={employee.armed ? "armed" : "unarmed"} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, armed: event.target.value === "armed" } : item) }))} className="input">
                                <option value="unarmed">Silahsız</option>
                                <option value="armed">Silahlı</option>
                              </select>
                              <input value={employee.duty || ""} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, duty: event.target.value } : item) }))} className="input" placeholder="Görev noktası / görev" />
                              <button type="button" onClick={() => setProjectDraft((v) => ({ ...v, employees: v.employees.filter((_, i) => i !== index) }))} className="btn-secondary">Sil</button>
                              <input value={(employee.certificates || []).join(", ")} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, certificates: splitList(event.target.value) } : item) }))} className="input md:col-span-2" placeholder="Sertifikalar (virgülle)" />
                              <input value={(employee.skills || []).join(", ")} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, skills: splitList(event.target.value) } : item) }))} className="input md:col-span-2" placeholder="Yetenekler (virgülle)" />
                              <input value={employee.maximum_working_hours} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, maximum_working_hours: Number(event.target.value) || 45 } : item) }))} className="input" placeholder="Maks. saat" type="number" />
                              <input value={employee.preferred_shift || ""} onChange={(event) => setProjectDraft((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, preferred_shift: event.target.value } : item) }))} className="input" placeholder="Tercih vardiya" />
                            </div>
                          ))}
                          {!projectDraft.employees.length && <Empty text="Henüz çalışan eklenmedi. Çalışanları ekledikten sonra Panter AI vardiya oluşturabilir." />}
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <Metric label="Girilen Çalışan" value={projectDraft.employees.length} />
                          <Metric label="Silahlı Çalışan" value={projectDraft.employees.filter((employee) => employee.armed).length} />
                          <Metric label="Silahsız Çalışan" value={projectDraft.employees.filter((employee) => !employee.armed).length} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={generateShiftFromProject} className="btn">Panter AI Vardiya Oluştur</button>
                          <button type="button" onClick={saveProject} className="btn-secondary">Projeyi Çalışanlarla Kaydet</button>
                        </div>
                      </div>
                    )}

                    <div className="mt-5 grid gap-3">
                      {[...localProjectWarnings(projectDraft), ...(projectAssistance?.validation_warnings || [])].filter((value, index, array) => array.indexOf(value) === index).map((warning) => (
                        <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{warning}</p>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setProjectWizardStep((step) => Math.max(1, step - 1))} className="btn-secondary">Önceki Adım</button>
                      <button type="button" onClick={() => setProjectWizardStep((step) => Math.min(6, step + 1))} className="btn-secondary">Sonraki Adım</button>
                      <button type="button" onClick={requestProjectAssistance} className="btn-secondary">Panter AI Öneri Al</button>
                      <button type="button" onClick={saveProject} className="btn">{editingProjectId ? "Projeyi Güncelle" : "Projeyi Kaydet"}</button>
                      {editingProjectId && <button type="button" onClick={() => { setEditingProjectId(""); setProjectDraft(defaultProjectInput); setProjectWizardStep(1); setProjectAssistance(null); }} className="btn-secondary">Düzenlemeyi İptal Et</button>}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-950 p-5 text-white shadow-xl shadow-zinc-200/70">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Panter AI Assistance</p>
                    <h3 className="mt-2 text-xl font-extrabold">Akıllı Proje Kontrolü</h3>
                    <div className="mt-4 grid gap-3">
                      {(projectAssistance?.ai_recommendations || projectAiRecommendations(projectDraft)).map((item) => (
                        <div key={item.title} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                          <h4 className="font-bold">{item.title}</h4>
                          <p className="mt-1 text-sm text-zinc-200">{item.description}</p>
                          <p className="mt-2 text-xs font-semibold text-red-200">Neden: {item.reason}</p>
                        </div>
                      ))}
                    </div>
                    {projectAssistance?.suggested_posts?.length ? (
                      <div className="mt-4">
                        <p className="text-sm font-bold">Önerilen post adları</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {projectAssistance.suggested_posts.map((postName) => (
                            <button
                              key={postName}
                              type="button"
                              onClick={() => setProjectDraft((v) => ({ ...v, security_posts: [...v.security_posts, { post_name: postName, required_personnel: 1, armed_required: false, armed_requirement: "Unarmed", fixed_position: true, patrol_duty: postName.toLocaleLowerCase("tr-TR").includes("devriye") }] }))}
                              className="rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/10"
                            >
                              + {postName}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-200/70">
                    <div className="grid gap-3 md:grid-cols-2">
                      <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} className="input" placeholder="Projelerde ara" />
                      <select value={projectStatusFilter} onChange={(event) => setProjectStatusFilter(event.target.value)} className="input">
                        <option value="">Tüm projeler</option>
                        <option value="Active">Aktif</option>
                        <option value="Passive">Pasif</option>
                      </select>
                    </div>
                    <List loading={projects.loading} empty={!projects.data?.length}>
                      {projects.data?.map((project) => (
                        <article key={project.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">{project.project_code}</p>
                              <h4 className="font-extrabold">{project.project_name}</h4>
                              <p className="text-sm text-zinc-500">{project.customer_company_name} · {label(project.project_status)}</p>
                            </div>
                            <span className="badge">{project.personnel_requirements.total_required_personnel} Personel</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => loadProjectForEdit(project)} className="btn-secondary">Düzenle</button>
                            <button type="button" onClick={() => runAction(() => panterAdminApi.deleteProject(token, project.id), projects.reload)} className="btn-secondary">Sil</button>
                          </div>
                        </article>
                      ))}
                    </List>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Support Personnel Management" error={supportRequests.error || supportAssignments.error || supportStats.error}>
              <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-200/70">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Destek Personel Talebi</p>
                  <h3 className="mt-1 text-2xl font-extrabold">{editingSupportId ? "Destek Talebini Düzenle" : "Yeni Destek Talebi"}</h3>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-bold text-zinc-700">
                      Hedef Proje
                      <select value={supportDraft.destination_project_id} onChange={(event) => setSupportDraft((v) => ({ ...v, destination_project_id: event.target.value }))} className="input">
                        <option value="">Proje seçin</option>
                        {projects.data?.filter((project) => project.project_status === "Active").map((project) => (
                          <option key={project.id} value={project.id}>{project.project_name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-zinc-700">
                      Gerekli Personel
                      <input value={supportDraft.required_personnel} onChange={(event) => setSupportDraft((v) => ({ ...v, required_personnel: Number(event.target.value) || 1 }))} className="input" type="number" min={1} />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-zinc-700">
                      Silah Gereksinimi
                      <select value={supportDraft.armed_requirement} onChange={(event) => setSupportDraft((v) => ({ ...v, armed_requirement: event.target.value as SupportRequestInput["armed_requirement"] }))} className="input">
                        <option value="Any">Fark Etmez</option>
                        <option value="Armed">Silahlı</option>
                        <option value="Unarmed">Silahsız</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-zinc-700">
                      Gerekli Pozisyon
                      <input value={supportDraft.required_position || ""} onChange={(event) => setSupportDraft((v) => ({ ...v, required_position: event.target.value }))} className="input" placeholder="Örn: Güvenlik Görevlisi" />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-zinc-700">
                      Tarih
                      <input value={supportDraft.date} onChange={(event) => setSupportDraft((v) => ({ ...v, date: event.target.value }))} className="input" placeholder="YYYY-MM-DD" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-2 text-sm font-bold text-zinc-700">
                        Başlangıç
                        <input value={supportDraft.start_time} onChange={(event) => setSupportDraft((v) => ({ ...v, start_time: event.target.value }))} className="input" placeholder="HH:MM" />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-zinc-700">
                        Bitiş
                        <input value={supportDraft.end_time} onChange={(event) => setSupportDraft((v) => ({ ...v, end_time: event.target.value }))} className="input" placeholder="HH:MM" />
                      </label>
                    </div>
                    <label className="grid gap-2 text-sm font-bold text-zinc-700">
                      Öncelik
                      <select value={supportDraft.priority} onChange={(event) => setSupportDraft((v) => ({ ...v, priority: event.target.value as SupportRequestInput["priority"] }))} className="input">
                        {eventPriorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-zinc-700 md:col-span-2">
                      Talep Nedeni
                      <textarea value={supportDraft.reason} onChange={(event) => setSupportDraft((v) => ({ ...v, reason: event.target.value }))} className="input min-h-24" placeholder="Neden geçici destek gerekiyor?" />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={saveSupportRequest} className="btn">{editingSupportId ? "Talebi Güncelle" : "Talep Oluştur ve AI Analiz Et"}</button>
                    {editingSupportId && <button type="button" onClick={() => { setEditingSupportId(""); setSupportDraft(defaultSupportRequest); }} className="btn-secondary">İptal</button>}
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <Metric label="Toplam Destek Talebi" value={supportStats.data?.total_support_requests || 0} />
                    <Metric label="Toplam Transfer" value={supportStats.data?.total_support_assignments || 0} />
                  </div>
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <h4 className="font-bold">Raporlama</h4>
                    <p className="mt-2 text-sm text-zinc-600">En çok talep edilen projeler: {(supportStats.data?.most_requested_projects || []).map(([name, count]) => `${name} (${count})`).join(", ") || "-"}</p>
                    <p className="mt-2 text-sm text-zinc-600">En çok transfer edilen personel: {(supportStats.data?.most_transferred_employees || []).map(([name, count]) => `${name} (${count})`).join(", ") || "-"}</p>
                    <p className="mt-2 text-sm text-zinc-600">Aylık geçmiş: {(supportStats.data?.monthly_support_history || []).map(([month, count]) => `${month}: ${count}`).join(", ") || "-"}</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <List loading={supportRequests.loading} empty={!supportRequests.data?.length}>
                    {supportRequests.data?.map((request) => (
                      <article key={request.id} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-200/70">
                        <div className="flex flex-col justify-between gap-3 md:flex-row">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">{label(request.priority)} · {label(request.status)}</p>
                            <h3 className="mt-1 text-xl font-extrabold">{request.destination_project_name || "Destek Talebi"}</h3>
                            <p className="text-sm text-zinc-500">{request.date} · {request.start_time} - {request.end_time} · {label(request.armed_requirement)}</p>
                          </div>
                          <span className="badge">{request.required_personnel} Personel</span>
                        </div>

                        {(request.analysis?.blocking_warnings || []).map((warning) => (
                          <p key={warning} className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{warning}</p>
                        ))}

                        <div className="mt-4 grid gap-3">
                          {(request.analysis?.recommendations || []).map((recommendation) => {
                            const selected = (selectedSupportEmployees[request.id] || []).includes(recommendation.employee_id);
                            return (
                              <label key={recommendation.employee_id} className={`rounded-2xl border p-4 ${selected ? "border-red-500 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}>
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(event) => setSelectedSupportEmployees((current) => {
                                      const existing = current[request.id] || [];
                                      return {
                                        ...current,
                                        [request.id]: event.target.checked ? [...existing, recommendation.employee_id] : existing.filter((id) => id !== recommendation.employee_id),
                                      };
                                    })}
                                    className="mt-1"
                                  />
                                  <div>
                                    <h4 className="font-extrabold">{recommendation.employee_name}</h4>
                                    <p className="text-sm text-zinc-600">{recommendation.current_project} · {recommendation.position} · {recommendation.qualification}</p>
                                    <p className="mt-2 text-sm text-zinc-700">{recommendation.reason_for_recommendation}</p>
                                    <p className="mt-2 text-xs font-semibold text-zinc-500">Fazla mesai etkisi: {recommendation.expected_overtime_impact} saat · Kaynak proje etkisi: {recommendation.staffing_impact_on_original_project}</p>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                          {!(request.analysis?.recommendations || []).length && <Empty text="Panter AI uygun personel bulamadı veya analiz bekleniyor." />}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => approveSupport(request.id)} className="btn-secondary">Seçili Personeli Onayla</button>
                          <button type="button" onClick={() => runAction(() => panterAdminApi.analyzeSupportRequest(token, request.id), supportRequests.reload)} className="btn-secondary">AI Yeniden Analiz</button>
                          <button type="button" onClick={() => {
                            setEditingSupportId(request.id);
                            setSupportDraft({
                              destination_project_id: request.destination_project_id,
                              required_personnel: request.required_personnel,
                              armed_requirement: request.armed_requirement,
                              required_position: request.required_position || "",
                              date: request.date,
                              start_time: request.start_time,
                              end_time: request.end_time,
                              reason: request.reason,
                              priority: request.priority,
                            });
                          }} className="btn-secondary">Düzenle</button>
                          <button type="button" onClick={() => runAction(() => panterAdminApi.rejectSupportRequest(token, request.id, "Yönetici tarafından reddedildi."), supportRequests.reload)} className="btn-secondary">Reddet</button>
                          <button type="button" onClick={() => loadSupportAudit(request.id)} className="btn-secondary">Audit</button>
                        </div>
                      </article>
                    ))}
                  </List>

                  <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-200/70">
                    <h3 className="text-xl font-extrabold">Destek Atama Geçmişi</h3>
                    <List loading={supportAssignments.loading} empty={!supportAssignments.data?.length}>
                      {supportAssignments.data?.slice(0, 8).map((assignment) => (
                        <p key={assignment.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                          <strong>{assignment.employee_name}</strong> · {assignment.source_project || "-"} → {assignment.destination_project || "-"} · {assignment.date} {assignment.start_time}-{assignment.end_time}
                        </p>
                      ))}
                    </List>
                    {supportAudit.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <h4 className="font-bold">Audit Log</h4>
                        {supportAudit.map((row) => <p key={String(row.id)} className="mt-2 text-sm text-zinc-600">{String(row.created_at)} · {String(row.action)} · {String(row.actor_name || "")}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="CV Yönetimi" error={cvs.error}>
              <div className="grid gap-3 md:grid-cols-5">
                <input value={cvSearch} onChange={(event) => setCvSearch(event.target.value)} className="input" placeholder="Ara" />
                <select value={cvStatus} onChange={(event) => setCvStatus(event.target.value)} className="input">
                  <option value="">Tüm durumlar</option>
                  {cvStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                </select>
                <input value={cvUpload.candidate_name} onChange={(event) => setCvUpload((v) => ({ ...v, candidate_name: event.target.value }))} className="input" placeholder="Aday adı" />
                <input type="file" onChange={(event) => setCvFile(event.target.files?.[0] || null)} className="input" />
                <button type="button" onClick={uploadCv} className="btn">CV Yükle</button>
              </div>
              <List loading={cvs.loading} empty={!cvs.data?.length}>
                {cvs.data?.map((cv) => (
                  <article key={cv.id} className="card">
                    <div className="flex flex-col justify-between gap-3 md:flex-row">
                      <div>
                        <h3 className="font-bold">{cv.candidate_name}</h3>
                        <p className="text-sm text-zinc-500">{cv.email || "-"} · {cv.phone || "-"}</p>
                      </div>
                      <span className="badge">AI Puanı: {cv.ai_score}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select value={cv.status} onChange={(event) => runAction(() => panterAdminApi.updateCv(token, cv.id, { status: event.target.value }), cvs.reload)} className="input max-w-xs">
                        {cvStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                      </select>
                      <button className="btn-secondary" type="button" onClick={() => runAction(() => panterAdminApi.downloadCv(token, cv.id, cv.file_name))}>CV İndir</button>
                      <button className="btn-secondary" type="button" onClick={() => runAction(() => panterAdminApi.cvAction(token, cv.id, "interview"), cvs.reload)}>Mülakat</button>
                      <button className="btn-secondary" type="button" onClick={() => runAction(() => panterAdminApi.cvAction(token, cv.id, "reject"), cvs.reload)}>Reddet</button>
                      <button className="btn-secondary" type="button" onClick={() => runAction(() => panterAdminApi.cvAction(token, cv.id, "hire"), cvs.reload)}>İşe Al</button>
                    </div>
                    <textarea className="input mt-3 w-full" defaultValue={cv.notes || ""} placeholder="Notlar" onBlur={(event) => runAction(() => panterAdminApi.updateCv(token, cv.id, { notes: event.target.value }), cvs.reload)} />
                  </article>
                ))}
              </List>
            </Section>

            <Section title="Operasyon Takvimi" error={appointments.error}>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Bugünkü Program" value={dashboard.data?.calendar_widgets?.today_schedule?.length || 0} />
                <Metric label="Yaklaşan Etkinlikler" value={dashboard.data?.calendar_widgets?.upcoming_events?.length || 0} />
                <Metric label="Yaklaşan İncelemeler" value={dashboard.data?.calendar_widgets?.upcoming_inspections?.length || 0} />
                <Metric label="Yaklaşan Toplantılar" value={dashboard.data?.calendar_widgets?.upcoming_meetings?.length || 0} />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {calendarViews.map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => {
                      setCalendarView(view);
                      setSelectedCalendarDate(isoDate(calendarDate));
                    }}
                    className={calendarView === view ? "btn" : "btn-secondary"}
                  >
                    {label(view)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const next = calendarView === "monthly" ? new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1) : addDays(calendarDate, calendarView === "weekly" ? -7 : -1);
                    setCalendarDate(next);
                    setSelectedCalendarDate(isoDate(next));
                  }}
                  className="btn-secondary"
                >
                  Önceki
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setCalendarDate(today);
                    setSelectedCalendarDate(isoDate(today));
                  }}
                  className="btn-secondary"
                >
                  Bugün
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = calendarView === "monthly" ? new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1) : addDays(calendarDate, calendarView === "weekly" ? 7 : 1);
                    setCalendarDate(next);
                    setSelectedCalendarDate(isoDate(next));
                  }}
                  className="btn-secondary"
                >
                  Sonraki
                </button>
                <button type="button" onClick={() => window.print()} className="btn-secondary">Yazdır</button>
                <button type="button" onClick={() => exportEvents(appointments.data || [])} className="btn-secondary">Dışa Aktar</button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <input value={calendarSearch} onChange={(event) => setCalendarSearch(event.target.value)} className="input" placeholder="Takvimde ara" />
                <select value={calendarFilters.event_type} onChange={(event) => setCalendarFilters((v) => ({ ...v, event_type: event.target.value }))} className="input">
                  <option value="">Tüm Etkinlik Türleri</option>
                  {eventTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}
                </select>
                <select value={calendarFilters.status} onChange={(event) => setCalendarFilters((v) => ({ ...v, status: event.target.value }))} className="input">
                  <option value="">Tüm Durumlar</option>
                  {eventStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                </select>
                <select value={calendarFilters.priority} onChange={(event) => setCalendarFilters((v) => ({ ...v, priority: event.target.value }))} className="input">
                  <option value="">Tüm Öncelikler</option>
                  {eventPriorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
                </select>
              </div>

              <div className="mt-5 rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/70">
                <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Operasyon Planı</p>
                    <h3 className="mt-1 text-2xl font-extrabold capitalize">{calendarTitle(calendarDate, calendarView)}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {eventTypes.map((type) => (
                      <span key={type} className={`rounded-full border px-3 py-1 text-xs font-bold ${eventColor(type)}`}>
                        {label(type)}
                      </span>
                    ))}
                  </div>
                </div>

                <CalendarBoard
                  view={calendarView}
                  activeDate={calendarDate}
                  selectedDate={selectedCalendarDate}
                  events={appointments.data || []}
                  onSelectDate={setSelectedCalendarDate}
                  onMoveEvent={(eventId, date) => runAction(() => panterAdminApi.updateAppointment(token, eventId, { date }), appointments.reload)}
                  onEdit={(item) => {
                    setEditingAppointmentId(item.id);
                    setAppointment({
                      title: item.title || "",
                      description: item.description || "",
                      date: item.date || "",
                      start_time: item.start_time || "",
                      end_time: item.end_time || "",
                      event_type: item.event_type || "Other",
                      priority: item.priority || "Medium",
                      status: item.status || "Scheduled",
                      assigned_employee_id: item.assigned_employee_id || "",
                      customer: item.customer || "",
                      project: item.project || "",
                      address: item.address || "",
                      notes: item.notes || "",
                    });
                  }}
                />

                <div className="border-t border-zinc-200 bg-zinc-50 p-5">
                  <h4 className="text-lg font-extrabold">
                    {parseDate(selectedCalendarDate).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} Etkinlikleri
                  </h4>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(eventsByDate(appointments.data || [])[selectedCalendarDate] || []).map((item) => (
                      <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${eventColor(item.event_type)}`}>{label(item.event_type || "Other")}</p>
                            <h5 className="mt-2 font-extrabold">{item.title}</h5>
                            <p className="text-sm text-zinc-500">{item.start_time || "-"} - {item.end_time || "-"}</p>
                          </div>
                          <span className="badge">{label(item.status || "Scheduled")}</span>
                        </div>
                        <p className="mt-3 text-sm text-zinc-700">{item.description || item.notes || "Açıklama yok."}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => {
                            setEditingAppointmentId(item.id);
                            setAppointment({
                              title: item.title || "",
                              description: item.description || "",
                              date: item.date || "",
                              start_time: item.start_time || "",
                              end_time: item.end_time || "",
                              event_type: item.event_type || "Other",
                              priority: item.priority || "Medium",
                              status: item.status || "Scheduled",
                              assigned_employee_id: item.assigned_employee_id || "",
                              customer: item.customer || "",
                              project: item.project || "",
                              address: item.address || "",
                              notes: item.notes || "",
                            });
                          }} className="btn-secondary">Düzenle</button>
                          <button type="button" onClick={() => runAction(() => panterAdminApi.deleteAppointment(token, item.id), appointments.reload)} className="btn-secondary">Sil</button>
                        </div>
                      </article>
                    ))}
                    {!(eventsByDate(appointments.data || [])[selectedCalendarDate] || []).length && (
                      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500 md:col-span-2">
                        Bu gün için etkinlik yok. Bir gün seçerek veya formu kullanarak yeni etkinlik oluşturabilirsiniz.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">
                  {editingAppointmentId ? "Operasyon Etkinliğini Düzenle" : "Operasyon Etkinliği Oluştur"}
                </p>
                <div className="grid gap-3 md:grid-cols-4">
                  <input value={appointment.title} onChange={(event) => setAppointment((v) => ({ ...v, title: event.target.value }))} className="input" placeholder="Başlık" />
                  <input value={appointment.date} onChange={(event) => setAppointment((v) => ({ ...v, date: event.target.value }))} className="input" placeholder="YYYY-MM-DD" />
                  <input value={appointment.start_time} onChange={(event) => setAppointment((v) => ({ ...v, start_time: event.target.value }))} className="input" placeholder="Başlangıç Saati" />
                  <input value={appointment.end_time} onChange={(event) => setAppointment((v) => ({ ...v, end_time: event.target.value }))} className="input" placeholder="Bitiş Saati" />
                  <select value={appointment.event_type} onChange={(event) => setAppointment((v) => ({ ...v, event_type: event.target.value }))} className="input">
                    {eventTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}
                  </select>
                  <select value={appointment.priority} onChange={(event) => setAppointment((v) => ({ ...v, priority: event.target.value }))} className="input">
                    {eventPriorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
                  </select>
                  <select value={appointment.status} onChange={(event) => setAppointment((v) => ({ ...v, status: event.target.value }))} className="input">
                    {eventStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                  <select value={appointment.assigned_employee_id} onChange={(event) => setAppointment((v) => ({ ...v, assigned_employee_id: event.target.value }))} className="input">
                    <option value="">Atanacak Personel</option>
                    {employees.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                  <input value={appointment.customer} onChange={(event) => setAppointment((v) => ({ ...v, customer: event.target.value }))} className="input" placeholder="Müşteri" />
                  <input value={appointment.project} onChange={(event) => setAppointment((v) => ({ ...v, project: event.target.value }))} className="input" placeholder="Proje" />
                  <input value={appointment.address} onChange={(event) => setAppointment((v) => ({ ...v, address: event.target.value }))} className="input" placeholder="Adres" />
                  <input value={appointment.notes} onChange={(event) => setAppointment((v) => ({ ...v, notes: event.target.value }))} className="input" placeholder="Notlar" />
                  <input type="file" onChange={(event) => setAppointmentAttachment(event.target.files?.[0] || null)} className="input" />
                </div>
                <textarea value={appointment.description} onChange={(event) => setAppointment((v) => ({ ...v, description: event.target.value }))} className="input mt-3 min-h-24 w-full" placeholder="Açıklama" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={createAppointment} className="btn">{editingAppointmentId ? "Etkinliği Güncelle" : "Etkinlik Oluştur"}</button>
                  {editingAppointmentId && <button type="button" onClick={() => { setAppointment(emptyEvent); setAppointmentAttachment(null); setEditingAppointmentId(""); }} className="btn-secondary">Düzenlemeyi İptal Et</button>}
                </div>
              </div>

              {appointments.loading && <Empty loading text="Takvim yükleniyor..." />}
            </Section>

            <Section title="AI Güvenlik Vardiya Planlama" error={shiftPlans.error}>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">Planlama Girdileri</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Proje Adı
                    <input value={shiftInput.project} onChange={(event) => setShiftInput((v) => ({ ...v, project: event.target.value }))} className="input normal-case tracking-normal" placeholder="Örn: AVM Güvenlik Projesi" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Başlangıç Tarihi
                    <input value={shiftInput.date_range.start} onChange={(event) => setShiftInput((v) => ({ ...v, date_range: { ...v.date_range, start: event.target.value } }))} className="input normal-case tracking-normal" placeholder="YYYY-MM-DD" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Bitiş Tarihi
                    <input value={shiftInput.date_range.end} onChange={(event) => setShiftInput((v) => ({ ...v, date_range: { ...v.date_range, end: event.target.value } }))} className="input normal-case tracking-normal" placeholder="YYYY-MM-DD" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Çalışma Düzeni
                    <input value={shiftInput.working_hours} onChange={(event) => setShiftInput((v) => ({ ...v, working_hours: event.target.value }))} className="input normal-case tracking-normal" placeholder="Örn: 24/7 veya 08:00-18:00" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Toplam Gerekli Personel
                    <input
                      value={shiftInput.required_number_of_employees}
                      onChange={(event) => {
                        const total = Number(event.target.value) || 0;
                        setShiftInput((v) => {
                          const type = v.required_armed_guards > 0 && v.required_unarmed_guards > 0 ? "both" : v.required_armed_guards > 0 ? "armed" : "unarmed";
                          if (type === "armed") return { ...v, required_number_of_employees: total, required_armed_guards: total, required_unarmed_guards: 0 };
                          if (type === "both") return { ...v, required_number_of_employees: total, required_armed_guards: Math.ceil(total / 2), required_unarmed_guards: Math.floor(total / 2) };
                          return { ...v, required_number_of_employees: total, required_armed_guards: 0, required_unarmed_guards: total };
                        });
                      }}
                      className="input normal-case tracking-normal"
                      placeholder="Örn: 4"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Personel Silah Durumu
                    <select
                      value={shiftInput.required_armed_guards > 0 && shiftInput.required_unarmed_guards > 0 ? "both" : shiftInput.required_armed_guards > 0 ? "armed" : "unarmed"}
                      onChange={(event) => {
                        const type = event.target.value;
                        setShiftInput((v) => {
                          const total = Number(v.required_number_of_employees) || 0;
                          if (type === "armed") return { ...v, required_armed_guards: total, required_unarmed_guards: 0 };
                          if (type === "unarmed") return { ...v, required_armed_guards: 0, required_unarmed_guards: total };
                          return { ...v, required_armed_guards: Math.ceil(total / 2), required_unarmed_guards: Math.floor(total / 2) };
                        });
                      }}
                      className="input normal-case tracking-normal"
                    >
                      <option value="unarmed">Sadece silahsız</option>
                      <option value="armed">Sadece silahlı</option>
                      <option value="both">Her ikisi de</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Silahlı Personel Sayısı
                    <input value={shiftInput.required_armed_guards} onChange={(event) => setShiftInput((v) => ({ ...v, required_armed_guards: Number(event.target.value) || 0 }))} className="input normal-case tracking-normal" placeholder="Silahlı gerekiyorsa sayı girin" type="number" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Silahsız Personel Sayısı
                    <input value={shiftInput.required_unarmed_guards} onChange={(event) => setShiftInput((v) => ({ ...v, required_unarmed_guards: Number(event.target.value) || 0 }))} className="input normal-case tracking-normal" placeholder="Silahsız gerekiyorsa sayı girin" type="number" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Minimum Dinlenme Saati
                    <input value={shiftInput.labor_rules.minimum_rest_hours as number} onChange={(event) => setShiftInput((v) => ({ ...v, labor_rules: { ...v.labor_rules, minimum_rest_hours: Number(event.target.value) || 8 } }))} className="input normal-case tracking-normal" placeholder="Örn: 8" type="number" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Gerekli Roller
                    <input value={shiftInput.required_roles.join(", ")} onChange={(event) => setShiftInput((v) => ({ ...v, required_roles: splitList(event.target.value) }))} className="input normal-case tracking-normal" placeholder="Örn: Güvenlik Görevlisi, Amir" />
                  </label>
                  <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Gerekli Sertifikalar
                    <input value={shiftInput.required_certificates.join(", ")} onChange={(event) => setShiftInput((v) => ({ ...v, required_certificates: splitList(event.target.value) }))} className="input normal-case tracking-normal" placeholder="Örn: ÖGG, İlk Yardım" />
                  </label>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">Personeller</p>
                    <button type="button" onClick={() => setShiftInput((v) => ({ ...v, employees: [...v.employees, { ...emptyShiftEmployee }] }))} className="btn-secondary">Personel Ekle</button>
                  </div>
                  <div className="grid gap-3">
                    {shiftInput.employees.map((employee, index) => (
                      <div key={index} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-6">
                        <input value={employee.name} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, name: event.target.value } : item) }))} className="input" placeholder="Ad Soyad" />
                        <input value={employee.position || ""} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, position: event.target.value } : item) }))} className="input" placeholder="Pozisyon" />
                        <input value={employee.certificates.join(", ")} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, certificates: splitList(event.target.value) } : item) }))} className="input" placeholder="Sertifikalar" />
                        <select value={employee.armed ? "armed" : "unarmed"} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, armed: event.target.value === "armed" } : item) }))} className="input">
                          <option value="unarmed">Silahsız</option>
                          <option value="armed">Silahlı</option>
                        </select>
                        <input value={employee.salary} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, salary: Number(event.target.value) || 0 } : item) }))} className="input" placeholder="Saatlik Ücret" type="number" />
                        <input value={employee.overtime_cost} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, overtime_cost: Number(event.target.value) || 0 } : item) }))} className="input" placeholder="Fazla Mesai Ücreti" type="number" />
                        <input value={employee.availability.join(", ")} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, availability: splitList(event.target.value) } : item) }))} className="input" placeholder="Uygun Tarihler" />
                        <input value={employee.leave_days.join(", ")} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, leave_days: splitList(event.target.value) } : item) }))} className="input" placeholder="İzin Günleri" />
                        <input value={employee.weekly_working_hours} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, weekly_working_hours: Number(event.target.value) || 0 } : item) }))} className="input" placeholder="Haftalık Saat" type="number" />
                        <input value={employee.maximum_working_hours} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, maximum_working_hours: Number(event.target.value) || 45 } : item) }))} className="input" placeholder="Maksimum Saat" type="number" />
                        <input value={employee.preferred_shift || ""} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, preferred_shift: event.target.value } : item) }))} className="input" placeholder="Tercih Edilen Vardiya" />
                        <input value={employee.skills.join(", ")} onChange={(event) => setShiftInput((v) => ({ ...v, employees: v.employees.map((item, i) => i === index ? { ...item, skills: splitList(event.target.value) } : item) }))} className="input" placeholder="Yetenekler" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={generateShiftPlan} className="btn">Optimize Vardiya Planı Oluştur</button>
                  <button type="button" onClick={() => window.print()} className="btn-secondary">Yazdır</button>
                </div>
              </div>

              <List loading={shiftPlans.loading} empty={!shiftPlans.data?.length && !selectedShiftPlan}>
                {(selectedShiftPlan ? [selectedShiftPlan, ...(shiftPlans.data || []).filter((plan) => plan.id !== selectedShiftPlan.id)] : shiftPlans.data || []).map((plan) => (
                  <article key={plan.id} className="card">
                    <div className="flex flex-col justify-between gap-3 md:flex-row">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">{plan.status}</p>
                        <h3 className="text-xl font-extrabold">{plan.project}</h3>
                        <p className="text-sm text-zinc-500">Önerilen: {label(plan.recommended_option)} · {new Date(plan.created_at).toLocaleString("tr-TR")}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => approveShiftPlan(plan.id)} className="btn-secondary">Onayla</button>
                        <button type="button" onClick={() => panterAdminApi.exportShiftPlan(token, plan.id, "excel")} className="btn-secondary">Excel</button>
                        <button type="button" onClick={() => panterAdminApi.exportShiftPlan(token, plan.id, "pdf")} className="btn-secondary">PDF</button>
                        <button type="button" onClick={() => loadShiftAudit(plan.id)} className="btn-secondary">İşlem Geçmişi</button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Metric label="Toplam Personel" value={plan.schedule?.analysis?.total_employees || 0} />
                      <Metric label="Toplam Çalışma Saati" value={plan.schedule?.analysis?.total_working_hours || 0} />
                      <Metric label="Fazla Mesai Saati" value={plan.schedule?.analysis?.overtime_hours || 0} />
                      <Metric label="Optimizasyon Puanı" value={plan.schedule?.analysis?.optimization_score || 0} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Metric label="İşçilik Maliyeti" value={plan.schedule?.analysis?.estimated_labor_cost || 0} />
                      <Metric label="Fazla Mesai Maliyeti" value={plan.schedule?.analysis?.estimated_overtime_cost || 0} />
                      <Metric label="Kapsama %" value={plan.schedule?.analysis?.coverage_percentage || 0} />
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {plan.options?.map((option) => (
                        <div key={option.name} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                          <h4 className="font-extrabold">{label(option.name)}</h4>
                          <p className="mt-1 text-sm text-zinc-600">{optionReason(option.reason)}</p>
                          <p className="mt-3 text-sm font-bold text-red-600">Puan: {option.analysis?.optimization_score || 0}</p>
                          <button type="button" onClick={() => applyShiftOption(plan, option)} className="btn-secondary mt-3">Bu Seçeneği Kullan</button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-200 p-4">
                        <h4 className="font-bold">Kural İhlalleri</h4>
                        {(plan.schedule?.analysis?.rule_violations || []).length ? plan.schedule.analysis.rule_violations.map((item: string) => <p key={item} className="mt-2 text-sm text-red-700">{item}</p>) : <p className="mt-2 text-sm text-zinc-500">İhlal yok.</p>}
                      </div>
                      <div className="rounded-xl border border-zinc-200 p-4">
                        <h4 className="font-bold">Uyarılar</h4>
                        {(plan.schedule?.analysis?.warnings || []).slice(0, 8).map((item: string) => <p key={item} className="mt-2 text-sm text-amber-700">{item}</p>)}
                        {!(plan.schedule?.analysis?.warnings || []).length && <p className="mt-2 text-sm text-zinc-500">Uyarı yok.</p>}
                      </div>
                    </div>

                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                          <tr><th className="p-3">Tarih</th><th className="p-3">Vardiya</th><th className="p-3">Saat</th><th className="p-3">Gerekli</th><th className="p-3">Atanan</th></tr>
                        </thead>
                        <tbody>
                          {(plan.schedule?.daily_shift_assignment || []).slice(0, 20).map((row: Record<string, any>, index: number) => (
                            <tr key={`${row.date}-${row.shift}-${index}`} className="border-b border-zinc-100">
                              <td className="p-3">{row.date}</td>
                              <td className="p-3">{label(row.shift)}</td>
                              <td className="p-3">{row.start_time} - {row.end_time}</td>
                              <td className="p-3">{row.required}</td>
                              <td className="p-3">{(row.assignments || []).map((item: Record<string, any>) => item.name).join(", ") || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </List>

              {shiftAudit.length > 0 && (
                <div className="card">
                  <h3 className="font-bold">Vardiya Planı İşlem Geçmişi</h3>
                  {shiftAudit.map((row) => <p key={String(row.id)} className="mt-2 text-sm text-zinc-600">{String(row.created_at)} · {String(row.action)} · {String(row.actor_name || "")}</p>)}
                </div>
              )}
            </Section>

            <Section title="İnceleme Talepleri" error={inspections.error}>
              <div className="mb-5 grid gap-3 md:grid-cols-7">
                <input value={newInspection.company} onChange={(event) => setNewInspection((v) => ({ ...v, company: event.target.value }))} className="input" placeholder="Şirket" />
                <input value={newInspection.name} onChange={(event) => setNewInspection((v) => ({ ...v, name: event.target.value }))} className="input" placeholder="Yetkili" />
                <input value={newInspection.phone} onChange={(event) => setNewInspection((v) => ({ ...v, phone: event.target.value }))} className="input" placeholder="Telefon" />
                <input value={newInspection.city} onChange={(event) => setNewInspection((v) => ({ ...v, city: event.target.value }))} className="input" placeholder="Şehir" />
                <input value={newInspection.projectAddress} onChange={(event) => setNewInspection((v) => ({ ...v, projectAddress: event.target.value }))} className="input" placeholder="Adres" />
                <input value={newInspection.reason} onChange={(event) => setNewInspection((v) => ({ ...v, reason: event.target.value }))} className="input" placeholder="Neden" />
                <button type="button" onClick={createInspection} className="btn">İnceleme Oluştur</button>
              </div>
              <RequestList items={inspections.data || []} loading={inspections.loading}>
                {(request) => (
                  <>
                    <select value={request.status} onChange={(event) => updateInspectionStatus(request.id, event.target.value)} className="input mt-4 max-w-sm">
                      {inspectionStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                    </select>
                    <select value={request.payload.inspector_id || ""} onChange={(event) => runAction(() => panterAdminApi.assignInspector(token, request.id, event.target.value), inspections.reload)} className="input mt-3 max-w-sm">
                      <option value="">Denetçi ata</option>
                      {employees.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                    </select>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input type="file" onChange={(event) => setReportFiles((current) => ({ ...current, [request.id]: event.target.files?.[0] || null }))} className="input" />
                      <button type="button" onClick={() => uploadInspectionReport(request.id)} className="btn-secondary">Rapor Yükle</button>
                    </div>
                    <button type="button" onClick={() => showHistory(request.id)} className="btn-secondary mt-3">Geçmişi Göster</button>
                    {histories[request.id]?.map((row) => <p key={row.id} className="mt-2 text-xs text-zinc-500">{row.created_at} · {row.action} · {row.notes || ""}</p>)}
                  </>
                )}
              </RequestList>
            </Section>

            <Section title="Teklifler" error={quotations.error}>
              <RequestList items={quotations.data || []} loading={quotations.loading}>
                {(request) => (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <select value={request.status} onChange={(event) => runAction(() => panterAdminApi.updateQuotation(token, request.id, { status: event.target.value }), quotations.reload)} className="input">
                      {quotationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                    </select>
                    <input className="input" placeholder="Notlar" onBlur={(event) => runAction(() => panterAdminApi.updateQuotation(token, request.id, { notes: event.target.value }), quotations.reload)} />
                  </div>
                )}
              </RequestList>
            </Section>

            <Section title="Panter AI" error={conversations.error || aiKnowledge.error || aiDocuments.error || aiFeedback.error}>
              <textarea value={knowledge || aiKnowledge.data?.content || ""} onChange={(event) => setKnowledge(event.target.value)} className="input min-h-32 w-full" placeholder="AI bilgi tabanı" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => runAction(() => panterAdminApi.saveAiKnowledge(token, knowledge || aiKnowledge.data?.content || ""), aiKnowledge.reload)} className="btn">Bilgiyi Kaydet</button>
                <input value={trainingInstructions} onChange={(event) => setTrainingInstructions(event.target.value)} className="input max-w-sm" placeholder="AI eğitim talimatı" />
                <button type="button" onClick={() => runAction(() => panterAdminApi.trainAi(token, trainingInstructions))} className="btn-secondary">AI Eğitimi</button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="input" placeholder="Doküman başlığı" />
                <input type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} className="input" />
                <button type="button" onClick={uploadAiDocument} className="btn">Doküman Yükle</button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Metric label="Sohbet Geçmişi" value={conversations.data?.length || 0} />
                <Metric label="Yüklenen Dokümanlar" value={aiDocuments.data?.length || 0} />
                <Metric label="Geri Bildirim Geçmişi" value={aiFeedback.data?.length || 0} />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="card">
                  <h3 className="font-bold">Sohbet Geçmişi</h3>
                  {(conversations.data || []).slice(0, 5).map((item) => (
                    <p key={item.session_id} className="mt-2 text-sm text-zinc-600">{item.message_count} mesaj · {item.updated_at || "-"}</p>
                  ))}
                  {!conversations.data?.length && <p className="mt-2 text-sm text-zinc-500">Kayıt yok.</p>}
                </div>
                <div className="card">
                  <h3 className="font-bold">Yüklenen Dokümanlar</h3>
                  {(aiDocuments.data || []).slice(0, 5).map((item) => (
                    <p key={item.id} className="mt-2 text-sm text-zinc-600">{item.title} · {item.file_name || "metin"}</p>
                  ))}
                  {!aiDocuments.data?.length && <p className="mt-2 text-sm text-zinc-500">Doküman yok.</p>}
                </div>
                <div className="card">
                  <h3 className="font-bold">Geri Bildirim Geçmişi</h3>
                  {(aiFeedback.data || []).slice(0, 5).map((item) => (
                    <p key={item.id} className="mt-2 text-sm text-zinc-600">Puan: {item.rating || "-"} · {item.comment || "-"}</p>
                  ))}
                  {!aiFeedback.data?.length && <p className="mt-2 text-sm text-zinc-500">Geri bildirim yok.</p>}
                </div>
              </div>
            </Section>

            <Section title="Personeller" error={employees.error}>
              <List loading={employees.loading} empty={!employees.data?.length}>
                {employees.data?.map((employee) => (
                  <article key={employee.id} className="card">
                    <div className="flex justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{employee.name}</h3>
                        <p className="text-sm text-zinc-500">{employee.contact.email || employee.email} · {employee.department || "-"}</p>
                      </div>
                      <span className="badge">{label(employee.status)}</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">Aktif proje: {employee.active_projects}</p>
                  </article>
                ))}
              </List>
            </Section>
          </div>
        )}

        {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</p>}
      </div>
    </main>
  );
}

function Section({ title, error, children }: { title: string; error?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-xl shadow-zinc-200">
      <div className="mb-5 flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <p className="text-3xl font-extrabold text-red-600">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{fieldLabel(label)}</p>
    </div>
  );
}

function Empty({ loading, text }: { loading?: boolean; text: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">{loading ? "Yükleniyor..." : text}</div>;
}

function List({ loading, empty, children }: { loading?: boolean; empty?: boolean; children: ReactNode }) {
  if (loading) return <Empty loading text="Yükleniyor..." />;
  if (empty) return <Empty text="Kayıt bulunamadı." />;
  return <div className="mt-5 grid gap-4">{children}</div>;
}

function CalendarBoard({
  view,
  activeDate,
  selectedDate,
  events,
  onSelectDate,
  onMoveEvent,
  onEdit,
}: {
  view: string;
  activeDate: Date;
  selectedDate: string;
  events: Appointment[];
  onSelectDate: (date: string) => void;
  onMoveEvent: (eventId: string, date: string) => void;
  onEdit: (event: Appointment) => void;
}) {
  const grouped = eventsByDate(events);
  const visibleDays = view === "monthly" ? monthDays(activeDate) : view === "weekly" ? weekDays(activeDate) : [activeDate];
  const weekLabels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const today = isoDate(new Date());

  return (
    <div className="overflow-x-auto p-4">
      {view !== "daily" && (
        <div className={`${view === "monthly" ? "min-w-[760px]" : ""} grid grid-cols-7 rounded-t-2xl border border-b-0 border-zinc-200 bg-zinc-950 text-white`}>
          {weekLabels.map((day) => (
            <div key={day} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.16em]">
              {day}
            </div>
          ))}
        </div>
      )}

      <div className={view === "monthly" ? "grid min-w-[760px] grid-cols-7 overflow-hidden rounded-b-2xl border border-zinc-200" : view === "weekly" ? "grid grid-cols-1 gap-3 md:grid-cols-7" : "grid gap-3"}>
        {visibleDays.map((day) => {
          const dateKey = isoDate(day);
          const dayEvents = grouped[dateKey] || [];
          const isSelected = selectedDate === dateKey;
          const isCurrentMonth = day.getMonth() === activeDate.getMonth();
          const isToday = today === dateKey;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(dateKey)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const eventId = event.dataTransfer.getData("text/plain");
                if (eventId) onMoveEvent(eventId, dateKey);
              }}
              className={[
                "min-h-36 border-zinc-200 bg-white p-2 text-left transition hover:bg-red-50",
                view === "monthly" ? "border-r border-t" : "rounded-2xl border shadow-sm",
                isSelected ? "ring-2 ring-red-600 ring-inset" : "",
                !isCurrentMonth && view === "monthly" ? "bg-zinc-50 text-zinc-400" : "",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={isToday ? "flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-extrabold text-white" : "text-sm font-extrabold"}>
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-600">{dayEvents.length}</span>}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, view === "monthly" ? 3 : 8).map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(item);
                      onSelectDate(dateKey);
                    }}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                    className={`cursor-grab rounded-lg border px-2 py-1 text-xs font-bold shadow-sm active:cursor-grabbing ${eventColor(item.event_type)}`}
                    title={`${item.title} ${item.start_time || ""}`}
                  >
                    <span className="block truncate">{item.start_time ? `${item.start_time} · ` : ""}{item.title}</span>
                  </div>
                ))}
                {dayEvents.length > (view === "monthly" ? 3 : 8) && (
                  <p className="text-xs font-semibold text-zinc-500">+{dayEvents.length - (view === "monthly" ? 3 : 8)} etkinlik</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RequestList({
  items,
  loading,
  children,
}: {
  items: PanterRequest[];
  loading?: boolean;
  children: (request: PanterRequest) => ReactNode;
}) {
  return (
    <List loading={loading} empty={!items.length}>
      {items.map((request) => (
        <article key={request.id} className="card">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">{label(request.type)}</p>
              <h3 className="mt-1 text-xl font-bold">{request.payload.company || request.payload.name || "Yeni Talep"}</h3>
              <p className="mt-1 text-sm text-zinc-500">{new Date(request.created_at).toLocaleString("tr-TR")}</p>
            </div>
            <span className="badge">{label(request.status)}</span>
          </div>

          <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            {Object.entries(request.payload).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-zinc-200 p-3">
                <p className="font-semibold text-zinc-500">{fieldLabel(key)}</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-900">{label(String(value))}</p>
              </div>
            ))}
          </div>
          {children(request)}
        </article>
      ))}
    </List>
  );
}
