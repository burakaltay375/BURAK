"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Globe2,
  ImageIcon,
  Mail,
  MapPin,
  Menu,
  Paperclip,
  Phone,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { company, projectReferences, riskConsultingShowcase, securityPersonnelShowcase, technologyOperationsShowcase } from "@/content/site";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const navItems = ["Biz kimiz", "Ne yapıyoruz", "Kariyer", "Haberler", "İletişim"];

const stats = [
  { value: "7/24", label: "Operasyon" },
  { value: "100+", label: "Görev Noktası" },
  { value: "20+", label: "Sektör" },
];

const news = [
  "Kurumsal tesislerde güvenlik planlamasının önemi",
  "Etkinlik güvenliğinde profesyonel ekip yönetimi",
  "Teknoloji destekli güvenlik operasyonları",
];

const heroSlides = [
  {
    image:
      "https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=1600&q=80",
    label: "Kurumsal operasyon alanları",
  },
  {
    image: "/ozel-guvenlik-egitim.png",
    label: "Özel güvenlik eğitim ve saha disiplini",
  },
  {
    image: "/ozel-guvenlik-kursu.png",
    label: "Güvenlik personeli eğitim programları",
  },
];

type ChatAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  data_uri: string;
  size: number;
};

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  attachments?: ChatAttachment[];
};

type ChatMode = "general" | "quotation" | "recruitment" | "inspection" | "operationEvent";
type AdminRequestType = "quotation" | "recruitment" | "inspection";
type LeadPayload = {
  attachments?: ChatAttachment[];
} & Record<string, string | ChatAttachment[] | undefined>;

type LeadField = {
  key: string;
  label: string;
  prompt: string;
  optional?: boolean;
};

const ACCEPTED_CHAT_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ACCEPTED_CHAT_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".doc", ".docx"];
const MAX_CHAT_FILE_BYTES = 8 * 1024 * 1024;

const initialPanterMessage =
  "Merhaba ben Panter. Panter Güvenlik hakkında merak ettiklerinizi cevaplamakla görevliyim. Nasıl yardımcı olabilirim?";

const quotationFields: LeadField[] = [
  { key: "name", label: "Ad Soyad", prompt: "Teklif talebi oluşturalım. Adınızı ve soyadınızı yazar mısınız?" },
  { key: "phone", label: "Telefon", prompt: "Telefon numaranızı paylaşır mısınız?" },
  { key: "email", label: "E-posta", prompt: "E-posta adresinizi yazar mısınız?" },
  { key: "company", label: "Şirket", prompt: "Şirket adınızı yazabilirsiniz. Şirket yoksa 'geç' yazabilirsiniz.", optional: true },
  { key: "city", label: "Şehir", prompt: "Hizmet almak istediğiniz şehir hangisi?" },
  { key: "service", label: "Talep Edilen Hizmet", prompt: "Hangi hizmet için teklif istiyorsunuz? Örneğin tesis güvenliği, VIP koruma, etkinlik güvenliği, CCTV veya alarm sistemi." },
  { key: "notes", label: "Ek Notlar", prompt: "Eklemek istediğiniz not var mı? Yoksa 'yok' yazabilirsiniz.", optional: true },
];

const recruitmentFields: LeadField[] = [
  { key: "cv", label: "CV", prompt: "İş başvurusu için CV dosyanızı PDF, DOCX veya fotoğraf olarak ekleyin (ataç ikonu). Dosyayı ekledikten sonra Gönder'e basın." },
  { key: "name", label: "Ad Soyad", prompt: "Adınızı ve soyadınızı yazar mısınız?" },
  { key: "phone", label: "Telefon", prompt: "Telefon numaranızı paylaşır mısınız?" },
  { key: "email", label: "E-posta", prompt: "E-posta adresinizi yazar mısınız?" },
  { key: "license", label: "Güvenlik Lisansı", prompt: "Özel güvenlik kimlik kartınız / lisansınız var mı?" },
  { key: "experience", label: "Deneyim", prompt: "Güvenlik alanındaki deneyiminizi kısaca yazar mısınız?" },
];

const inspectionFields: LeadField[] = [
  { key: "company", label: "Şirket", prompt: "İnceleme talebi için şirket adınızı paylaşır mısınız?" },
  { key: "name", label: "Yetkili Kişi", prompt: "Görüşülecek yetkili kişinin adını yazar mısınız?" },
  { key: "phone", label: "Telefon", prompt: "Telefon numaranızı paylaşır mısınız?" },
  { key: "email", label: "E-posta", prompt: "E-posta adresinizi yazar mısınız?" },
  { key: "projectName", label: "Proje Adı", prompt: "İncelenecek projenin adını yazar mısınız?", optional: true },
  { key: "projectAddress", label: "Proje Adresi", prompt: "Proje adresini paylaşır mısınız?" },
  { key: "city", label: "Şehir", prompt: "Projenin bulunduğu şehir hangisi?" },
  { key: "personnelCount", label: "Güvenlik Personeli Sayısı", prompt: "Mevcut veya planlanan güvenlik personeli sayısı kaç?" },
  { key: "currentServices", label: "Mevcut Güvenlik Hizmetleri", prompt: "Şu anda hangi güvenlik hizmetleri kullanılıyor? Yoksa 'yok' yazabilirsiniz.", optional: true },
  { key: "facilityType", label: "Tesis Türü", prompt: "Tesis türü nedir? Örneğin fabrika, AVM, site, otel, hastane veya ofis." },
  { key: "reason", label: "İnceleme Nedeni", prompt: "İnceleme talebinizin nedeni nedir? Örneğin zayıf noktaları bulmak, risk analizi, proje revizyonu veya denetim." },
  { key: "preferredDate", label: "Tercih Edilen Tarih", prompt: "İnceleme için tercih ettiğiniz tarih nedir?" },
  { key: "preferredTime", label: "Tercih Edilen Saat", prompt: "İnceleme için tercih ettiğiniz saat nedir?" },
  { key: "notes", label: "Ek Notlar", prompt: "Eklemek istediğiniz not var mı? Yoksa 'yok' yazabilirsiniz.", optional: true },
];

const operationEventFields: LeadField[] = [
  { key: "eventType", label: "Etkinlik Türü", prompt: "Operasyon takvimi için etkinlik türünü belirtir misiniz? Toplantı, eğitim, saha keşfi veya iç toplantı olabilir." },
  { key: "title", label: "Başlık", prompt: "Takvim etkinliği için kısa bir başlık yazar mısınız?" },
  { key: "date", label: "Tarih", prompt: "Etkinlik tarihi nedir? Mümkünse YYYY-MM-DD olarak yazın." },
  { key: "start_time", label: "Başlangıç Saati", prompt: "Başlangıç saatini paylaşır mısınız?" },
  { key: "end_time", label: "Bitiş Saati", prompt: "Bitiş saatini paylaşır mısınız?", optional: true },
  { key: "customer", label: "Müşteri", prompt: "Müşteri veya şirket adını paylaşır mısınız?", optional: true },
  { key: "project", label: "Proje", prompt: "İlgili proje adı nedir?", optional: true },
  { key: "address", label: "Adres", prompt: "Adres veya lokasyon bilgisini paylaşır mısınız?", optional: true },
  { key: "notes", label: "Notlar", prompt: "Ek not var mı? Yoksa 'yok' yazabilirsiniz.", optional: true },
];

const inspectionStatuses = [
  "Pending Inspection",
  "Scheduled",
  "Inspector Assigned",
  "Inspection In Progress",
  "Inspection Completed",
  "Report Uploaded",
  "Cancelled",
];

function formatLeadSummary(title: string, fields: LeadField[], data: LeadPayload) {
  const lines = [
    ...fields.map((field) => {
      const value = data[field.key];
      const display = typeof value === "string" && value ? value : field.optional ? "Belirtilmedi" : "-";
      return `${field.label}: ${display}`;
    }),
  ];
  if (data.attachments?.length) {
    lines.push(`Ekler: ${data.attachments.map((file) => file.file_name).join(", ")}`);
  }
  return title ? [title, ...lines].join("\n") : lines.join("\n");
}

function saveLocalRequest(type: string, payload: LeadPayload) {
  if (typeof window === "undefined") return;
  const key = "panter-ai-requests";
  const current = JSON.parse(window.localStorage.getItem(key) || "[]") as Array<Record<string, unknown>>;
  current.push({ type, payload, createdAt: new Date().toISOString() });
  window.localStorage.setItem(key, JSON.stringify(current));
}

async function saveAdminRequest(type: AdminRequestType, payload: LeadPayload) {
  const apiBase = (process.env.NEXT_PUBLIC_PANTER_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

  try {
    const response = await fetch(`${apiBase}/panter/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, source: "panter-ai" }),
    });

    if (!response.ok) {
      throw new Error(`Panter admin request failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.warn("Panter admin backend unavailable, request saved locally.", error);
    saveLocalRequest(type, payload);
    return false;
  }
}

async function saveOperationEvent(payload: LeadPayload) {
  const apiBase = (process.env.NEXT_PUBLIC_PANTER_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
  const asText = (value: string | ChatAttachment[] | undefined) => (typeof value === "string" ? value : undefined);

  try {
    const response = await fetch(`${apiBase}/panter/operation-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: asText(payload.title) || asText(payload.eventType) || "Panter AI Operasyon Etkinliği",
        description: asText(payload.notes) || asText(payload.eventType),
        date: asText(payload.date) || asText(payload.preferredDate),
        start_time: asText(payload.start_time) || asText(payload.preferredTime),
        end_time: asText(payload.end_time),
        event_type: asText(payload.eventType) || "Other",
        status: "Pending",
        priority: "Medium",
        customer: asText(payload.customer) || asText(payload.company) || asText(payload.name),
        project: asText(payload.project) || asText(payload.projectName),
        address: asText(payload.address) || asText(payload.projectAddress),
        notes: asText(payload.notes),
        attachments: (payload.attachments || []).map(({ file_name, mime_type, data_uri }) => ({
          file_name,
          mime_type,
          data_uri,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Panter operation event failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.warn("Panter operation calendar backend unavailable.", error);
    saveLocalRequest("operationEvent", payload);
    return false;
  }
}

function isAcceptedChatFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const extensionOk = ACCEPTED_CHAT_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const mimeOk = !file.type || ACCEPTED_CHAT_FILE_TYPES.includes(file.type);
  return extensionOk && mimeOk;
}

function readFileAsDataUri(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

async function filesToAttachments(files: FileList | File[]) {
  const list = Array.from(files);
  const attachments: ChatAttachment[] = [];

  for (const file of list) {
    if (!isAcceptedChatFile(file)) {
      throw new Error(`Desteklenmeyen dosya: ${file.name}. Fotoğraf, PDF veya DOCX yükleyin.`);
    }
    if (file.size > MAX_CHAT_FILE_BYTES) {
      throw new Error(`${file.name} çok büyük. En fazla 8 MB yükleyebilirsiniz.`);
    }
    attachments.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      data_uri: await readFileAsDataUri(file),
      size: file.size,
    });
  }

  return attachments;
}

function downloadAttachment(attachment: ChatAttachment) {
  const link = document.createElement("a");
  link.href = attachment.data_uri;
  link.download = attachment.file_name || "panter-dosya";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(attachment: ChatAttachment) {
  return attachment.mime_type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(attachment.file_name);
}

function ChatAttachmentList({
  attachments,
  tone = "light",
}: {
  attachments: ChatAttachment[];
  tone?: "light" | "dark";
}) {
  if (!attachments.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`overflow-hidden rounded-xl border ${tone === "dark" ? "border-white/25 bg-white/10" : "border-zinc-200 bg-white"}`}
        >
          {isImageAttachment(attachment) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.data_uri} alt={attachment.file_name} className="max-h-40 w-full object-cover" />
          ) : null}
          <div className="flex items-center gap-2 px-3 py-2">
            {isImageAttachment(attachment) ? (
              <ImageIcon className={`h-4 w-4 shrink-0 ${tone === "dark" ? "text-cyan-100" : "text-red-600"}`} />
            ) : (
              <FileText className={`h-4 w-4 shrink-0 ${tone === "dark" ? "text-cyan-100" : "text-red-600"}`} />
            )}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-xs font-semibold ${tone === "dark" ? "text-white" : "text-zinc-900"}`}>{attachment.file_name}</p>
              <p className={`text-[11px] ${tone === "dark" ? "text-white/70" : "text-zinc-500"}`}>{formatFileSize(attachment.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => downloadAttachment(attachment)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                tone === "dark" ? "bg-white/15 text-white hover:bg-white/25" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
              }`}
              aria-label={`${attachment.file_name} dosyasını indir`}
            >
              <Download className="h-3.5 w-3.5" />
              İndir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function adminSaveMessage(savedToBackend: boolean) {
  return savedToBackend
    ? "Talep admin paneline gönderildi."
    : "Backend şu anda erişilemediği için talep geçici olarak tarayıcıda saklandı.";
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractInfo(message: string, mode: ChatMode) {
  const normalized = normalizeText(message);
  const info: Record<string, string> = {};
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = message.match(/(?:\+?90\s*)?(?:0\s*)?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/)?.[0];
  const cityMatch = message.match(/(?:şehir|sehir|il|lokasyon|konum)\s*[:=-]?\s*([A-Za-zÇĞİÖŞÜçğıöşü\s]{2,30})(?=,|\.|;|$)/i);
  const companyMatch = message.match(/(?:şirket|sirket|firma|kurum)\s*[:=-]?\s*([A-Za-z0-9ÇĞİÖŞÜçğıöşü\s.&-]{2,50})(?=,|\.|;|$)/i);
  const nameMatch = message.match(/(?:adım|adim|ad soyad|ismim|ben)\s*[:=-]?\s*([A-Za-zÇĞİÖŞÜçğıöşü\s]{3,40})(?=,|\.|;|$)/i);
  const personnelMatch = normalized.match(/(\d+)\s*(?:personel|guvenlik|gorevli|kişi|kisi)/);
  const timeMatch = message.match(/\b([01]?\d|2[0-3])[:.][0-5]\d\b|\b([01]?\d|2[0-3])\s*(?:de|da)\b/i);
  const dateMatch = message.match(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b|(?:pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|yarın|yarin|haftaya|bugün|bugun)/i);
  const addressMatch = message.match(/(?:adres|adresi|lokasyon|konum)\s*[:=-]?\s*([^.;\n]{5,90})/i);
  const projectMatch = message.match(/(?:proje adı|proje adi|proje)\s*[:=-]?\s*([A-Za-z0-9ÇĞİÖŞÜçğıöşü\s.&-]{2,60})(?=,|\.|;|$)/i);

  if (email) info.email = email;
  if (phone) info.phone = phone;
  if (cityMatch?.[1]) info.city = cityMatch[1].trim();
  if (companyMatch?.[1]) info.company = companyMatch[1].trim();
  if (nameMatch?.[1]) info.name = nameMatch[1].trim();
  if (personnelMatch?.[1]) info.personnelCount = personnelMatch[1];
  if (timeMatch?.[0]) {
    info.preferredTime = timeMatch[0].trim();
    info.start_time = timeMatch[0].trim();
  }
  if (dateMatch?.[0]) {
    info.preferredDate = dateMatch[0].trim();
    info.date = dateMatch[0].trim();
  }
  if (addressMatch?.[1]) {
    info.projectAddress = addressMatch[1].trim();
    info.address = addressMatch[1].trim();
  }
  if (projectMatch?.[1]) {
    info.projectName = projectMatch[1].trim();
    info.project = projectMatch[1].trim();
  }

  const serviceKeywords = [
    "tesis güvenliği",
    "tesis guvenligi",
    "özel güvenlik",
    "ozel guvenlik",
    "vip koruma",
    "yakın koruma",
    "yakin koruma",
    "etkinlik güvenliği",
    "etkinlik guvenligi",
    "cctv",
    "kamera",
    "alarm",
    "mobil devriye",
    "kurumsal güvenlik",
    "kurumsal guvenlik",
  ];
  const service = serviceKeywords.find((keyword) => normalized.includes(normalizeText(keyword)));
  if (service) info.service = service;

  if (mode === "recruitment") {
    if (normalized.includes("cv")) info.cv = message;
    if (normalized.includes("lisans") || normalized.includes("kimlik kart")) info.license = message;
    if (normalized.includes("deneyim") || normalized.includes("tecrube") || normalized.includes("tecrübe") || /\d+\s*yil/.test(normalized)) {
      info.experience = message;
    }
  }

  if (mode === "inspection") {
    const facilityTypes = [
      ["fabrika", "Fabrika"],
      ["factory", "Fabrika"],
      ["avm", "Alışveriş Merkezi"],
      ["alisveris merkezi", "Alışveriş Merkezi"],
      ["shopping mall", "Alışveriş Merkezi"],
      ["site", "Residential Site"],
      ["residential", "Residential Site"],
      ["konut", "Residential Site"],
      ["otel", "Otel"],
      ["hotel", "Otel"],
      ["hastane", "Hastane"],
      ["hospital", "Hastane"],
      ["ofis", "Ofis"],
      ["office", "Ofis"],
      ["depo", "Depo"],
      ["lojistik", "Lojistik Tesisi"],
      ["okul", "Eğitim Kurumu"],
    ] as const;
    const facility = facilityTypes.find(([keyword]) => normalized.includes(keyword));
    if (facility) info.facilityType = facility[1];

    const reasons = [
      ["zayif", "Güvenlik zayıf noktalarının belirlenmesi"],
      ["eksik", "Eksik güvenlik önlemlerinin tespiti"],
      ["risk", "Risk analizi"],
      ["denetim", "Güvenlik denetimi"],
      ["audit", "Güvenlik denetimi"],
      ["inceleme", "Proje incelemesi"],
      ["kontrol", "Proje kontrolü"],
      ["revizyon", "Proje revizyonu"],
    ] as const;
    const reason = reasons.find(([keyword]) => normalized.includes(keyword));
    if (reason) info.reason = reason[1];

    if (service) info.currentServices = service;
  }

  if (mode === "operationEvent") {
    const eventTypes = [
      ["saha keşfi", "Site Survey"],
      ["saha kesfi", "Site Survey"],
      ["site survey", "Site Survey"],
      ["keşif", "Site Survey"],
      ["kesif", "Site Survey"],
      ["eğitim", "Employee Training"],
      ["egitim", "Employee Training"],
      ["training", "Employee Training"],
      ["iç toplantı", "Internal Meeting"],
      ["ic toplanti", "Internal Meeting"],
      ["internal meeting", "Internal Meeting"],
      ["toplantı", "Customer Meeting"],
      ["toplanti", "Customer Meeting"],
      ["meeting", "Customer Meeting"],
      ["bakım", "Equipment Maintenance"],
      ["bakim", "Equipment Maintenance"],
      ["maintenance", "Equipment Maintenance"],
      ["hatırlatma", "Reminder"],
      ["hatirlatma", "Reminder"],
      ["reminder", "Reminder"],
    ] as const;
    const eventType = eventTypes.find(([keyword]) => normalized.includes(keyword));
    if (eventType) info.eventType = eventType[1];
    if (!info.title) info.title = message.slice(0, 70);
    if (info.company) info.customer = info.company;
  }

  return info;
}

function getMissingField(fields: LeadField[], data: LeadPayload) {
  return fields.find((field) => {
    const value = data[field.key];
    return !field.optional && !(typeof value === "string" && value.trim());
  });
}

function mergeLeadData(current: LeadPayload, message: string, mode: ChatMode, activeField?: LeadField): LeadPayload {
  const normalized = normalizeText(message);
  const extracted = extractInfo(message, mode);
  const next: LeadPayload = { ...current, ...extracted };

  if (activeField && !(typeof next[activeField.key] === "string" && next[activeField.key])) {
    const skipOptional = activeField.optional && ["gec", "geç", "yok", "hayir", "hayır"].includes(normalized);
    next[activeField.key] = skipOptional ? "" : message;
  }

  return next;
}

function withChatAttachments(data: LeadPayload, files: ChatAttachment[]): LeadPayload {
  const merged = [...(data.attachments || []), ...files];
  const next: LeadPayload = { ...data, attachments: merged };
  if (files.length && !(typeof next.cv === "string" && next.cv)) {
    next.cv = files.map((file) => file.file_name).join(", ");
  }
  return next;
}

function getPanterResponse(question: string) {
  const normalized = normalizeText(question);

  const hasAny = (words: string[]) => words.some((word) => normalized.includes(word));

  if (hasAny(["ogren", "öğren", "egit ai", "admin", "bilgi ekle", "dokuman", "pdf", "politika"])) {
    return "Panter AI yalnızca yetkili yöneticiler tarafından eğitilebilir. Yeni bilgi, doküman veya politika eklemek için admin paneli gerekir. Ziyaretçilerden gelen bilgiler otomatik olarak öğrenilmez.";
  }

  if (hasAny(["inceleme", "denetim", "audit", "risk analizi", "proje kontrol", "proje inceleme", "zayif nokta", "zayıf nokta", "guvenlik acigi", "güvenlik açığı"])) {
    return "Güvenlik projenizi incelemek için Panter saha keşif / denetim talebi oluşturabilir. Şirket, yetkili kişi, iletişim, proje adresi, tesis türü, personel sayısı ve tercih edilen tarih-saat bilgileriyle randevu planlanır.";
  }

  if (hasAny(["basvuru", "iş", "is", "kariyer", "cv", "eleman", "çalışmak", "calismak"])) {
    return "İş başvurusu için CV, ad soyad, telefon ve e-posta bilgileri gerekir. Değerlendirme yalnızca görevle ilgili niteliklere göre yapılır; yaş, cinsiyet, din, ırk, uyruk veya engellilik gibi korunan özellikler dikkate alınmaz.";
  }

  if (hasAny(["hizmet", "ne yapi", "ne yap", "neler", "alan"])) {
    return "Panter; özel güvenlik, VIP koruma, etkinlik güvenliği, CCTV, alarm sistemleri, mobil devriye, kurumsal güvenlik, tesis güvenliği ve risk danışmanlığı konularında destek olabilir.";
  }

  if (hasAny(["iletisim", "telefon", "mail", "e posta", "adres", "ulas"])) {
    return `Panter ile iletişime geçmek için ${company.phone} numarasını arayabilir, ${company.email} adresine e-posta gönderebilir veya sayfadaki iletişim formunu doldurabilirsiniz.`;
  }

  if (hasAny(["teklif", "fiyat", "ucret", "maliyet", "kac para"])) {
    return "Fiyat bilgisi uydurmam doğru olmaz. Teklif; şehir, hizmet türü, personel sayısı, görev süresi ve risk seviyesine göre hazırlanır. İsterseniz teklif talebi oluşturmanıza yardımcı olabilirim.";
  }

  if (hasAny(["egitim", "kurs", "sertifika", "personel", "guvenlik gorevlisi"])) {
    return "Panter personel yapısında eğitim, disiplin, temsil kabiliyeti, dikkat, kriz yönetimi ve görev bilinci önemlidir. Personel ihtiyacınıza göre uygun ekip planlaması yapılabilir.";
  }

  if (hasAny(["tesis", "site", "fabrika", "avm", "otel", "ofis", "depo", "lojistik"])) {
    return "Tesis güvenliğinde giriş-çıkış kontrolü, devriye planı, ziyaretçi yönetimi, kamera takibi, olay raporlama ve acil durum prosedürleri birlikte değerlendirilir.";
  }

  if (hasAny(["yakin koruma", "koruma", "vip", "yonetici", "transfer"])) {
    return "Yakın koruma hizmetinde kişinin günlük programı, ulaşım rotası, risk seviyesi ve gizlilik ihtiyacı analiz edilerek güvenli hareket planı hazırlanır.";
  }

  if (hasAny(["kamera", "alarm", "teknoloji", "izleme", "uzaktan"])) {
    return "CCTV, alarm sistemleri, uzaktan izleme ve olay kayıt süreçleri saha güvenliğini destekler. Net kapsam için keşif ve ihtiyaç analizi yapılması önerilir.";
  }

  if (hasAny(["etkinlik", "organizasyon", "konser", "toplanti", "dugun"])) {
    return "Etkinlik güvenliğinde giriş kontrolü, kalabalık yönetimi, VIP alan güvenliği, yönlendirme ve acil durum planlaması yapılır.";
  }

  if (hasAny(["merhaba", "selam", "iyi gunler", "nasilsin"])) {
    return "Merhaba, ben Panter. Size Panter Güvenlik hizmetleri, teklif süreci, iletişim bilgileri veya güvenlik planlaması hakkında yardımcı olabilirim.";
  }

  return `“${question}” sorunuzla ilgili yardımcı olayım. Bu konu daha çok hizmetler, teklif, iletişim, personel, tesis güvenliği veya yakın koruma başlıklarından hangisiyle ilgili?`;
}

function LogoBlock({ inverse = false }: { inverse?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-3">
      <span className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden bg-black">
        <Image src="/panter-logo.png" alt={`${company.name} logosu`} width={192} height={128} className="h-full w-full object-cover" priority />
      </span>
      <span className={`hidden max-w-[260px] text-sm font-bold uppercase leading-tight tracking-wide md:block ${inverse ? "text-white" : "text-zinc-900"}`}>
        {company.name}
      </span>
    </a>
  );
}

function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs text-zinc-700">
          <div className="flex items-center gap-2">
            <span>Türkiye</span>
            <Globe2 className="h-4 w-4" />
            <span className="flex items-center gap-1">Kurumsal web sitesi <ChevronDown className="h-3 w-3" /></span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/operasyon" className="font-medium hover:text-red-600">Operasyon merkezi</a>
            <a href="/admin" className="font-medium hover:text-red-600">Admin</a>
            <a href={company.phoneHref} className="font-medium hover:text-red-600">Ara / İletişim</a>
          </div>
        </div>
      </div>

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <LogoBlock />

        <div className="hidden items-center gap-9 lg:flex">
          {navItems.map((item) => (
            <a key={item} href={item === "İletişim" ? "#contact" : "#services"} className="text-sm font-medium text-zinc-700 transition hover:text-red-600">
              {item}
            </a>
          ))}
          <a href="/operasyon" className="text-sm font-semibold text-red-600 transition hover:text-red-700">
            Operasyon
          </a>
          <a href="/admin" className="text-sm font-semibold text-zinc-900 transition hover:text-red-600">
            Admin
          </a>
        </div>

        <button
          aria-label="Menüyü aç veya kapat"
          onClick={() => setOpen((value) => !value)}
          className="rounded border border-zinc-300 p-3 text-zinc-900 lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-zinc-200 bg-white px-4 py-4 lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col">
            {navItems.map((item) => (
              <a
                key={item}
                href={item === "İletişim" ? "#contact" : "#services"}
                onClick={() => setOpen(false)}
                className="border-b border-zinc-100 px-2 py-3 text-zinc-800"
              >
                {item}
              </a>
            ))}
            <a href="/operasyon" onClick={() => setOpen(false)} className="border-b border-zinc-100 px-2 py-3 font-semibold text-red-600">
              Operasyon merkezi
            </a>
            <a href="/admin" onClick={() => setOpen(false)} className="px-2 py-3 font-semibold text-zinc-900">
              Admin paneli
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = heroSlides[activeSlide];
  const goToNextSlide = () => setActiveSlide((current) => (current + 1) % heroSlides.length);
  const goToPreviousSlide = () => setActiveSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length);

  return (
    <section id="top" className="bg-white">
      <div className="mx-auto max-w-6xl">
        <div
          className="relative min-h-[520px] cursor-pointer overflow-hidden"
          role="button"
          tabIndex={0}
          aria-label="Sonraki görsele geç"
          onClick={goToNextSlide}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") goToNextSlide();
          }}
        >
          {heroSlides.map((item, index) => (
            <motion.div
              key={item.image}
              aria-hidden={activeSlide !== index}
              animate={{ opacity: activeSlide === index ? 1 : 0, scale: activeSlide === index ? 1 : 1.03 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.25), rgba(0,0,0,0.05)), url('${item.image}')`,
              }}
            />
          ))}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.75, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
            className="absolute left-8 top-20 max-w-xl bg-black/82 p-8 text-white md:left-12 md:top-28 md:p-10"
          >
            <p className="text-3xl font-light text-red-500 md:text-4xl">Güvenlikte Yeni Nesil</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight md:text-6xl">Kurumsal Koruma Çözümleri</h1>
            <p className="mt-5 text-lg leading-8 text-zinc-200">
              Panter, işletmelerin insanlarını, varlıklarını ve operasyonlarını profesyonel ekiplerle korur.
            </p>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">{slide.label}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#services" className="inline-flex items-center gap-3 bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700">
                Hizmetleri keşfet <ArrowRight className="h-5 w-5" />
              </a>
              <a href="/operasyon" className="inline-flex items-center gap-3 border border-white/40 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
                Operasyon merkezini aç
              </a>
            </div>
          </motion.div>
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 bg-black py-4" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-label="Önceki görsel"
              onClick={goToPreviousSlide}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 text-white transition hover:border-red-600 hover:bg-red-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
            {heroSlides.map((item, index) => (
              <button
                key={item.image}
                type="button"
                aria-label={`${item.label} görseline geç`}
                onClick={() => setActiveSlide(index)}
                className={`h-0.5 w-12 transition ${activeSlide === index ? "bg-red-600" : "bg-white/50 hover:bg-white"}`}
              />
            ))}
            </div>
            <button
              type="button"
              aria-label="Sonraki görsel"
              onClick={goToNextSlide}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 text-white transition hover:border-red-600 hover:bg-red-600"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function IntroStats() {
  return (
    <section id="about" className="bg-white py-10">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1fr_1.4fr]">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <h2 className="text-2xl font-extrabold uppercase text-zinc-950">Biz kimiz</h2>
          <div className="mt-6 flex items-start gap-5">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full">
              <Image src="/panter-logo.png" alt={`${company.name} logosu`} fill sizes="112px" className="object-cover" />
            </div>
            <p className="text-sm leading-6 text-zinc-700">
              {company.name}; kurumsal güvenlik, tesis koruma ve özel güvenlik hizmetlerinde güvenilir çözüm ortağıdır.
              Hizmet yapısı şirket bilgilerinizle kolayca güncellenebilir.
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}>
          <h2 className="text-2xl font-extrabold uppercase text-zinc-950">Rakamlarla Panter</h2>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-red-600 px-4 text-center text-3xl font-light leading-tight text-white md:h-32 md:w-32">
                  {stat.value}
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ShowcaseSlider({
  title,
  slides,
  first = false,
}: {
  title: string;
  slides: Array<{ image: string; title: string; subtitle: string }>;
  first?: boolean;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide];
  const goToNextSlide = () => setActiveSlide((current) => (current + 1) % slides.length);
  const goToPreviousSlide = () => setActiveSlide((current) => (current - 1 + slides.length) % slides.length);

  return (
    <div className={`${first ? "mt-10" : "mt-16 border-t border-zinc-300 pt-14"}`}>
      <h3 className="text-2xl font-extrabold text-zinc-950 md:text-3xl">{title}</h3>
      <div className="relative mt-8 overflow-hidden bg-zinc-900 shadow-md">
        <div className="relative aspect-[16/9] md:aspect-[21/9]">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.image}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              className="absolute inset-0"
            >
              <Image src={slide.image} alt={slide.title} fill sizes="100vw" className="object-cover" priority={first && activeSlide === 0} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
                <p className="max-w-3xl text-xl font-extrabold leading-snug text-white md:text-3xl">{slide.title}</p>
                <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-red-500 md:text-base">{slide.subtitle}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Önceki görsel"
              onClick={goToPreviousSlide}
              className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white transition hover:border-red-600 hover:bg-red-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Sonraki görsel"
              onClick={goToNextSlide}
              className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white transition hover:border-red-600 hover:bg-red-600"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {slides.map((item, index) => (
                <button
                  key={item.image}
                  type="button"
                  aria-label={`${index + 1}. görsele geç`}
                  onClick={() => setActiveSlide(index)}
                  className={`h-2.5 w-10 rounded-full transition ${activeSlide === index ? "bg-red-600" : "bg-white/45 hover:bg-white/70"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Services() {
  return (
    <section id="services" className="bg-zinc-100 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-extrabold leading-tight text-zinc-950">Kuruluşunuzun güvenlik risklerini azaltmak için buradayız</h2>
          <p className="mt-5 text-lg leading-8 text-zinc-700">
            İnsan, teknoloji ve operasyon disiplinini bir araya getiren sade, güçlü ve kurumsal güvenlik hizmetleri.
          </p>
        </div>

        <ShowcaseSlider title="Güvenlik Personeli" slides={securityPersonnelShowcase} first />
        <ShowcaseSlider title="Teknoloji Destekli Güvenlik Operasyonları" slides={technologyOperationsShowcase} />
        <ShowcaseSlider title="Risk Danışmanlığı" slides={riskConsultingShowcase} />

        <div id="references" className="mt-16 border-t border-zinc-300 pt-14">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-red-600">Referanslarımız</p>
            <h3 className="mt-3 text-3xl font-extrabold text-zinc-950">Risk danışmanlığı projelerimiz</h3>
            <p className="mt-4 text-lg leading-8 text-zinc-700">
              Tesis güvenliği ve risk danışmanlığı kapsamında hizmet verdiğimiz seçili lokasyonlardan bazıları.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {projectReferences.map((reference, index) => (
              <motion.article
                key={reference.name}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="group relative aspect-[4/3] overflow-hidden bg-zinc-900 shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >
                <Image
                  src={reference.image}
                  alt={reference.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-lg font-extrabold leading-snug text-white drop-shadow-sm">{reference.name}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Industries() {
  return (
    <section className="bg-white py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-extrabold text-zinc-950">Sektörlere göre güvenlik</h2>
            <p className="mt-4 leading-7 text-zinc-700">
              Panter, farklı sektörlerin çalışma düzenine ve risk profiline göre güvenlik kurgusu oluşturur.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["Kurumsal tesisler", "Sanayi ve üretim", "Lojistik alanları", "Etkinlik ve organizasyon"].map((item) => (
              <div key={item} className="border-l-4 border-red-600 bg-zinc-50 p-5 font-semibold text-zinc-900">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function News() {
  return (
    <section className="bg-zinc-100 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-extrabold text-zinc-950">Bizden haberler</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {news.map((item) => (
            <article key={item} className="bg-white p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-red-600">Güvenlik</p>
              <h3 className="mt-4 text-xl font-bold leading-snug text-zinc-950">{item}</h3>
              <a href="#contact" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
                Daha fazla <ArrowRight className="h-4 w-4 text-red-600" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="bg-white py-14">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-red-600 p-8 text-white">
          <h2 className="text-3xl font-extrabold">İletişim</h2>
          <p className="mt-4 leading-7 text-red-50">Güvenlik ihtiyaçlarınız için Panter ekibiyle iletişime geçin.</p>
          <div className="mt-8 space-y-4">
            <a
              href={company.phoneHref}
              className="flex items-center gap-3 transition hover:underline"
              aria-label={`${company.phone} numarasını ara`}
            >
              <Phone className="h-5 w-5 shrink-0" />
              {company.phone}
            </a>
            <a
              href={company.gmailHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 transition hover:underline"
              aria-label={`${company.email} adresine e-posta gönder`}
            >
              <Mail className="h-5 w-5 shrink-0" />
              {company.email}
            </a>
            <a
              href={company.mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 transition hover:underline"
              aria-label="Adresi Google Haritalar'da aç"
            >
              <MapPin className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{company.address}</span>
            </a>
          </div>
        </div>
        <form className="grid gap-4 bg-zinc-100 p-8 text-zinc-950">
          {["Ad Soyad", "Şirket", "E-posta", "Telefon"].map((label) => (
            <label key={label} className="grid gap-2 text-sm font-semibold text-zinc-700">
              {label}
              <input className="border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-red-600" placeholder={label} />
            </label>
          ))}
          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            Mesaj
            <textarea className="min-h-32 border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-red-600" placeholder="Güvenlik ihtiyacınızı kısaca anlatın" />
          </label>
          <button type="button" className="mt-2 bg-zinc-950 px-7 py-4 font-semibold text-white transition hover:bg-red-700">
            Talep Gönder
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <LogoBlock inverse />
        <p className="text-sm text-zinc-400">&copy; {new Date().getFullYear()} {company.name}. Tüm hakları saklıdır.</p>
      </div>
    </footer>
  );
}

function PanterAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("general");
  const [leadData, setLeadData] = useState<LeadPayload>({});
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: initialPanterMessage,
    },
  ]);

  const attachSelectedFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setFileError("");
    try {
      const next = await filesToAttachments(fileList);
      setPendingFiles((current) => [...current, ...next]);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Dosya eklenemedi.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((current) => current.filter((file) => file.id !== id));
  };

  const sendMessage = async () => {
    const question = input.trim();
    const outgoingFiles = pendingFiles;
    if (!question && !outgoingFiles.length) return;

    const displayText = question || (outgoingFiles.length ? `Dosya eklendi: ${outgoingFiles.map((file) => file.file_name).join(", ")}` : "");
    const normalized = normalizeText(question || displayText);
    const userMessage: ChatMessage = {
      role: "user",
      text: displayText,
      attachments: outgoingFiles.length ? outgoingFiles : undefined,
    };

    const finishTurn = () => {
      setInput("");
      setPendingFiles([]);
      setFileError("");
    };

    if (mode === "quotation") {
      const activeField = getMissingField(quotationFields, leadData);
      let nextData = mergeLeadData(leadData, question || displayText, "quotation", activeField);
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(quotationFields, nextData);

      if (missingField) {
        setLeadData(nextData);
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `Anladım. Şu ana kadar aldığım bilgiler: ${formatLeadSummary("", quotationFields, nextData).trim()}\n\nEksik olan bilgi: ${missingField.prompt}`,
          },
        ]);
      } else {
        const savedToBackend = await saveAdminRequest("quotation", nextData);
        setMode("general");
        setLeadData({});
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `${formatLeadSummary("Teklif talebiniz oluşturuldu:", quotationFields, nextData)}\n\n${adminSaveMessage(savedToBackend)}`,
            attachments: nextData.attachments,
          },
        ]);
      }
      finishTurn();
      return;
    }

    if (mode === "recruitment") {
      const activeField = getMissingField(recruitmentFields, leadData);
      let nextData = mergeLeadData(leadData, question || displayText, "recruitment", activeField);
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(recruitmentFields, nextData);

      if (missingField) {
        setLeadData(nextData);
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `Teşekkürler. Verdiğiniz bilgileri not ettim. Eksik olan bilgi: ${missingField.prompt}`,
            attachments: outgoingFiles.length ? outgoingFiles : undefined,
          },
        ]);
      } else {
        const savedToBackend = await saveAdminRequest("recruitment", nextData);
        setMode("general");
        setLeadData({});
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `${formatLeadSummary("Başvuru ön bilginiz alındı:", recruitmentFields, nextData)}\n\n${adminSaveMessage(savedToBackend)}${nextData.attachments?.length ? " CV / dosya ekleriniz talebe kaydedildi; aşağıdaki İndir ile tekrar indirebilirsiniz." : ""}`,
            attachments: nextData.attachments,
          },
        ]);
      }
      finishTurn();
      return;
    }

    if (mode === "inspection") {
      const activeField = getMissingField(inspectionFields, leadData);
      let nextData = mergeLeadData(leadData, question || displayText, "inspection", activeField);
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(inspectionFields, nextData);

      if (missingField) {
        setLeadData(nextData);
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `Anladım. İnceleme talebi için paylaştığınız bilgileri not ettim.\n\n${formatLeadSummary("", inspectionFields, nextData).trim()}\n\nEksik olan bilgi: ${missingField.prompt}`,
          },
        ]);
      } else {
        const inspectionRequest = {
          ...nextData,
          status: inspectionStatuses[0],
          inspectionType: nextData.reason || "Güvenlik proje incelemesi",
        };
        const savedToBackend = await saveAdminRequest("inspection", inspectionRequest);
        setMode("general");
        setLeadData({});
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `${formatLeadSummary("İnceleme randevu talebiniz oluşturuldu:", inspectionFields, inspectionRequest)}\nDurum: ${inspectionRequest.status}\n\n${adminSaveMessage(savedToBackend)}`,
            attachments: inspectionRequest.attachments,
          },
        ]);
      }
      finishTurn();
      return;
    }

    if (mode === "operationEvent") {
      const activeField = getMissingField(operationEventFields, leadData);
      let nextData = mergeLeadData(leadData, question || displayText, "operationEvent", activeField);
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(operationEventFields, nextData);

      if (missingField) {
        setLeadData(nextData);
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `Operasyon takvimi için bilgileri not ettim.\n\n${formatLeadSummary("", operationEventFields, nextData).trim()}\n\nEksik olan bilgi: ${missingField.prompt}`,
          },
        ]);
      } else {
        const savedToBackend = await saveOperationEvent(nextData);
        setMode("general");
        setLeadData({});
        setMessages((current) => [
          ...current,
          userMessage,
          {
            role: "assistant",
            text: `${formatLeadSummary("Operasyon takvimi etkinliği oluşturuldu:", operationEventFields, nextData)}\n\n${savedToBackend ? "Etkinlik operasyon takvimine eklendi ve yöneticilerin panelinde görünecek." : "Backend şu anda erişilemediği için etkinlik geçici olarak tarayıcıda saklandı."}`,
            attachments: nextData.attachments,
          },
        ]);
      }
      finishTurn();
      return;
    }

    if (["inceleme", "denetim", "audit", "risk", "zayif", "zayıf", "proje kontrol", "proje inceleme", "keşif", "kesif"].some((word) => normalized.includes(normalizeText(word)))) {
      let nextData = mergeLeadData({}, question || displayText, "inspection");
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(inspectionFields, nextData);
      const inspectionRequest = { ...nextData, status: inspectionStatuses[0], inspectionType: nextData.reason || "Güvenlik proje incelemesi" };
      const savedToBackend = missingField ? false : await saveAdminRequest("inspection", inspectionRequest);
      setMode("inspection");
      setLeadData(nextData);
      setMessages((current) => [
        ...current,
        userMessage,
        {
          role: "assistant",
          text: missingField
            ? `Güvenlik proje incelemesi için yardımcı olurum. Mesajınızdan anladıklarımı not ettim.\n\n${formatLeadSummary("", inspectionFields, nextData).trim()}\n\nEksik olan bilgi: ${missingField.prompt}`
            : `${formatLeadSummary("İnceleme randevu talebiniz oluşturuldu:", inspectionFields, inspectionRequest)}\nDurum: ${inspectionStatuses[0]}\n\n${adminSaveMessage(savedToBackend)}`,
          attachments: nextData.attachments,
        },
      ]);
      if (!missingField) {
        setMode("general");
        setLeadData({});
      }
      finishTurn();
      return;
    }

    if (["toplanti", "toplantı", "meeting", "egitim", "eğitim", "training", "saha kesfi", "saha keşfi", "site survey", "ic toplanti", "iç toplantı", "bakim", "bakım", "maintenance", "hatirlatma", "hatırlatma"].some((word) => normalized.includes(normalizeText(word)))) {
      let nextData = mergeLeadData({}, question || displayText, "operationEvent");
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(operationEventFields, nextData);
      const savedToBackend = missingField ? false : await saveOperationEvent(nextData);
      setMode("operationEvent");
      setLeadData(nextData);
      setMessages((current) => [
        ...current,
        userMessage,
        {
          role: "assistant",
          text: missingField
            ? `Bu talebi operasyon takvimine ekleyebilirim. Mesajınızdan anladıklarımı not ettim.\n\n${formatLeadSummary("", operationEventFields, nextData).trim()}\n\nEksik olan bilgi: ${missingField.prompt}`
            : `${formatLeadSummary("Operasyon takvimi etkinliği oluşturuldu:", operationEventFields, nextData)}\n\n${savedToBackend ? "Etkinlik operasyon takvimine eklendi ve yöneticilere bildirilecek." : "Backend şu anda erişilemediği için etkinlik geçici olarak tarayıcıda saklandı."}`,
          attachments: nextData.attachments,
        },
      ]);
      if (!missingField) {
        setMode("general");
        setLeadData({});
      }
      finishTurn();
      return;
    }

    if (["teklif", "fiyat", "ucret", "ücret", "maliyet"].some((word) => normalized.includes(word))) {
      let nextData = mergeLeadData({}, question || displayText, "quotation");
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(quotationFields, nextData);
      const savedToBackend = missingField ? false : await saveAdminRequest("quotation", nextData);
      setMode("quotation");
      setLeadData(nextData);
      setMessages((current) => [
        ...current,
        userMessage,
        {
          role: "assistant",
          text: missingField
            ? `Teklif talebi için yardımcı olurum. Mesajınızdan anladıklarımı not ettim.\n\n${formatLeadSummary("", quotationFields, nextData).trim()}\n\nEksik olan bilgi: ${missingField.prompt}`
            : `${formatLeadSummary("Teklif talebiniz oluşturuldu:", quotationFields, nextData)}\n\n${adminSaveMessage(savedToBackend)}`,
          attachments: nextData.attachments,
        },
      ]);
      if (!missingField) {
        setMode("general");
        setLeadData({});
      }
      finishTurn();
      return;
    }

    if (["basvuru", "başvuru", "kariyer", "cv", "is", "iş"].some((word) => normalized.includes(word))) {
      let nextData = mergeLeadData({}, question || displayText, "recruitment");
      if (outgoingFiles.length) nextData = withChatAttachments(nextData, outgoingFiles);
      const missingField = getMissingField(recruitmentFields, nextData);
      const savedToBackend = missingField ? false : await saveAdminRequest("recruitment", nextData);
      setMode("recruitment");
      setLeadData(nextData);
      setMessages((current) => [
        ...current,
        userMessage,
        {
          role: "assistant",
          text: missingField
            ? `Başvuru için yardımcı olurum. Paylaştığınız bilgileri not ettim. Eksik olan bilgi: ${missingField.prompt}`
            : `${formatLeadSummary("Başvuru ön bilginiz alındı:", recruitmentFields, nextData)}\n\n${adminSaveMessage(savedToBackend)}${nextData.attachments?.length ? " CV / dosya ekleriniz talebe kaydedildi." : ""}`,
          attachments: nextData.attachments,
        },
      ]);
      if (!missingField) {
        setMode("general");
        setLeadData({});
      }
      finishTurn();
      return;
    }

    if (outgoingFiles.length && !question) {
      setMessages((current) => [
        ...current,
        userMessage,
        {
          role: "assistant",
          text: "Dosyanızı aldım. Fotoğraf, PDF veya DOCX eklerini buradan indirebilirsiniz. Başvuru için 'CV' veya 'iş başvurusu', teklif için 'teklif' yazabilirsiniz.",
          attachments: outgoingFiles,
        },
      ]);
      finishTurn();
      return;
    }

    setMessages((current) => [
      ...current,
      userMessage,
      {
        role: "assistant",
        text: getPanterResponse(question || displayText),
        attachments: outgoingFiles.length ? outgoingFiles : undefined,
      },
    ]);
    finishTurn();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="relative w-[22rem] max-w-full rounded-3xl border border-cyan-200/70 bg-white p-4 shadow-2xl shadow-cyan-950/20"
          >
            <div className="absolute -bottom-3 right-16 h-6 w-6 rotate-45 border-b border-r border-cyan-200/70 bg-white" />
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-wide text-zinc-950">Panter AI</p>
                <p className="text-xs text-zinc-500">Dosya, fotoğraf, PDF ve DOCX ekleyebilirsiniz</p>
              </div>
              <button
                type="button"
                aria-label="Sohbeti kapat"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${message.role === "user" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-800"}`}>
                    {message.text}
                    {message.attachments?.length ? (
                      <ChatAttachmentList attachments={message.attachments} tone={message.role === "user" ? "dark" : "light"} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {pendingFiles.length > 0 && (
              <div className="mt-3 space-y-2 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3">
                {pendingFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2">
                    {isImageAttachment(file) ? <ImageIcon className="h-4 w-4 text-red-600" /> : <FileText className="h-4 w-4 text-red-600" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-zinc-900">{file.file_name}</p>
                      <p className="text-[11px] text-zinc-500">{formatFileSize(file.size)}</p>
                    </div>
                    <button type="button" onClick={() => downloadAttachment(file)} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700" aria-label={`${file.file_name} indir`}>
                      İndir
                    </button>
                    <button type="button" onClick={() => removePendingFile(file.id)} className="rounded-full p-1 text-zinc-500 hover:bg-white" aria-label={`${file.file_name} kaldır`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {fileError ? <p className="mt-2 text-xs text-red-600">{fileError}</p> : null}

            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="hidden"
                onChange={(event) => void attachSelectedFiles(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full border border-zinc-200 p-3 text-zinc-700 transition hover:border-red-600 hover:text-red-700"
                aria-label="Dosya, fotoğraf, PDF veya DOCX ekle"
                title="Dosya / fotoğraf / PDF / DOCX"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Sorunuzu yazın veya dosya ekleyin..."
                className="min-w-0 flex-1 rounded-full border border-zinc-200 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-red-600"
              />
              <button type="submit" className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700">
                Gönder
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label="Panter yapay zeka asistanını aç"
        onClick={() => setOpen((value) => !value)}
        initial={false}
        animate={open ? { y: [0, -6, 0] } : { y: 0 }}
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.55 }}
        className="group flex items-center gap-3 rounded-3xl border border-cyan-300/60 bg-zinc-950 p-2 pr-5 text-left text-white shadow-2xl shadow-cyan-950/30 transition hover:border-cyan-200"
      >
        <span className="relative h-24 w-32 overflow-hidden rounded-2xl bg-zinc-900 ring-2 ring-cyan-300/70">
          <Image src="/panter-ai-assistant.png" alt="Panter yapay zeka asistanı" fill sizes="128px" className="object-cover object-center transition group-hover:scale-105" />
          {open && (
            <span className="absolute right-2 top-2 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-cyan-300" />
            </span>
          )}
        </span>
        <span className="hidden sm:block">
          <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Yapay Zeka</span>
          <span className="block text-sm font-bold">Panter&apos;e Sor</span>
        </span>
      </motion.button>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="overflow-hidden">
      <Navbar />
      <Hero />
      <IntroStats />
      <Services />
      <Industries />
      <News />
      <Contact />
      <Footer />
      <PanterAssistant />
    </main>
  );
}
