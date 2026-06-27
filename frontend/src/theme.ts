// Design tokens from /app/design_guidelines.json (6 Glass / Luxe)
export const COLORS = {
  surface: "#0F0F11",
  onSurface: "#F5F5F5",
  surfaceSecondary: "#1A1A1D",
  onSurfaceSecondary: "#D1D1D1",
  surfaceTertiary: "#26262A",
  onSurfaceTertiary: "#A3A3A3",
  brand: "#D4AF37",
  brandSecondary: "#C5A028",
  brandTertiary: "#3A3320",
  onBrandPrimary: "#0F0F11",
  onBrandTertiary: "#F2E3B6",
  success: "#4CAF50",
  warning: "#FF9800",
  error: "#E53935",
  info: "#9E9E9E",
  border: "#26262A",
  borderStrong: "#4A4A4A",
  divider: "#1A1A1D",
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xl2: 32, xl3: 48 };
export const RADIUS = { sm: 6, md: 12, lg: 20, pill: 999 };
export const TYPE = {
  display: "Fraunces",
  text: "Geist",
};

export const PRIORITY_COLOR = {
  YUKSEK: "#E53935",
  ORTA: "#FF9800",
  DUSUK: "#4CAF50",
} as const;

export const STATUS_LABEL: Record<string, string> = {
  ALINDI: "Alındı",
  PERSONEL_GIDIYOR: "Personel Gidiyor",
  TAMAMLANDI: "Tamamlandı",
  REDDEDILDI: "Reddedildi",
};

export const DEPT_LABEL: Record<string, string> = {
  kuru_temizleme: "Kuru Temizleme",
  oda_servisi: "Oda Servisi",
  teknik_destek: "Teknik Destek",
  housekeeping: "Housekeeping",
  vale: "Vale",
};
