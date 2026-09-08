import {
  BadgeCheck,
  Building2,
  Camera,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Factory,
  Fingerprint,
  Globe2,
  GraduationCap,
  Hotel,
  Landmark,
  LockKeyhole,
  Plane,
  RadioTower,
  ShieldCheck,
  Siren,
  UsersRound,
  Warehouse,
} from "lucide-react";

export const company = {
  name: "Panter Özel Güvenlik ve Koruma Hizmetleri",
  shortName: "Panter",
  tagline: "Kurumsal alanlar, değerli varlıklar ve seçkin operasyonlar için profesyonel güvenlik.",
  email: "info@panterguvenlik.com.tr",
  emailHref: "mailto:info@panterguvenlik.com.tr",
  gmailHref: "https://mail.google.com/mail/?view=cm&fs=1&to=info@panterguvenlik.com.tr",
  phone: "532 516 0633",
  phoneHref: "tel:+905325160633",
  address: "Merkez, Mah. Bomonti Arkası Sk. Nida Park Bomonti C Blok No: 4 G, 34381 Şişli/İstanbul",
  mapsHref:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Merkez, Mah. Bomonti Arkası Sk. Nida Park Bomonti C Blok No: 4 G, 34381 Şişli/İstanbul"),
};

export const navItems = [
  { label: "Hakkımızda", href: "#about" },
  { label: "Hizmetler", href: "#services" },
  { label: "Sektörler", href: "#industries" },
  { label: "Referanslar", href: "#references" },
  { label: "İletişim", href: "#contact" },
];

export const heroHighlights = ["7/24 Operasyon", "Lisanslı Ekipler", "Kurumsal Raporlama"];

export const services = [
  {
    title: "Kurumsal Tesis Güvenliği",
    description: "Prestijli tesisler için giriş kontrolü, devriye planları, resepsiyon güvenliği ve olay müdahale süreçleri.",
    icon: Building2,
  },
  {
    title: "Yakın Koruma",
    description: "Yöneticiler ve özel misafirler için gizlilik odaklı yakın koruma, güvenli ulaşım planlaması ve ön keşif desteği.",
    icon: ShieldCheck,
  },
  {
    title: "Güvenlik Danışmanlığı",
    description: "Risk analizi, tehdit değerlendirmesi, operasyon prosedürleri ve denetime hazır güvenlik iyileştirme planları.",
    icon: ClipboardCheck,
  },
  {
    title: "Uzaktan İzleme",
    description: "Kamera takibi, alarm yanıtı, kontrol merkezi koordinasyonu ve çok lokasyonlu tesisler için eskalasyon yönetimi.",
    icon: Camera,
  },
  {
    title: "Etkinlik Güvenliği",
    description: "Davetli akışı, VIP girişleri, kalabalık yönetimi, acil durum planlaması ve marka algısına uygun güvenlik hizmeti.",
    icon: Siren,
  },
  {
    title: "Kritik Varlık Koruması",
    description: "Hassas varlıklar, tedarik zincirleri, sınırlı erişim alanları ve yüksek değerli operasyonlar için katmanlı güvenlik.",
    icon: LockKeyhole,
  },
];

export const differentiators = [
  {
    title: "Premium Müşteri Deneyimi",
    description: "Kurumsal ortamlara uyum sağlayan, sakin, profesyonel ve güven veren güvenlik yaklaşımı.",
    icon: BadgeCheck,
  },
  {
    title: "Operasyonel Disiplin",
    description: "Net prosedürler, düzenli raporlama, eskalasyon planları ve ölçülebilir hizmet standartları.",
    icon: RadioTower,
  },
  {
    title: "Seçilmiş Uzman Kadro",
    description: "Temsil kabiliyeti, dikkat, gizlilik ve güvenilirlik kriterleriyle seçilmiş eğitimli profesyoneller.",
    icon: Fingerprint,
  },
  {
    title: "Ölçeklenebilir Hizmet",
    description: "Tek bir ofisten çok lokasyonlu yapılara kadar tutarlı denetim ve standart hizmet kalitesi.",
    icon: Globe2,
  },
];

export const industries = [
  { title: "Kurumsal Genel Merkezler", icon: Landmark },
  { title: "Lüks Otelcilik", icon: Hotel },
  { title: "Havalimanı ve Ulaşım", icon: Plane },
  { title: "Üretim Tesisleri", icon: Factory },
  { title: "Eğitim Kampüsleri", icon: GraduationCap },
  { title: "Lojistik ve Depolama", icon: Warehouse },
  { title: "Finans Kuruluşları", icon: CircleDollarSign },
  { title: "Özel Yaşam Alanları", icon: UsersRound },
];

export const stats = [
  { value: "18+", label: "Yıllık sektör deneyimi" },
  { value: "7/24", label: "Operasyon ve olay müdahalesi" },
  { value: "96%", label: "Hedef müşteri memnuniyeti" },
  { value: "120+", label: "Yıllık desteklenen lokasyon" },
];

export const securityPersonnelShowcase = [
  {
    image: "/operations/silahsiz-egitim.png",
    title: "Güvenliklerimize silahsız özel eğitimden bir kare",
    subtitle: "Panter ile güvendesiniz",
  },
  {
    image: "/operations/silahli-egitim.png",
    title: "Personellerimizin silahlı eğitimi",
    subtitle: "Panter ile güvendesiniz",
  },
];

export const technologyOperationsShowcase = [
  {
    image: "/operations/drone-devriye.png",
    title: "Drone anti drone ile devriye",
    subtitle: "Panter teknolojisi ile güvendesiniz",
  },
  {
    image: "/operations/ai-kamera-izleme.png",
    title: "Yapay zeka destekli kamera izleme sistemi ile riskleri önceden görüyoruz",
    subtitle: "Panter ile güvendesiniz",
  },
];

export const riskConsultingShowcase = [
  {
    image: "/operations/tesis-toplantisi.png",
    title: "Güvenliğini sağladığımız tesisler hakkında toplantılar yapıyoruz",
    subtitle: "Panter ile güvendesiniz",
  },
  {
    image: "/operations/vip-koruma.png",
    title: "Eğitimli silahlı VIP korumalarımız profesyonel şekilde çalışması",
    subtitle: "Panter ile güvendesiniz",
  },
];

export const projectReferences = [
  {
    name: "TAT Konakları Antalya",
    image: "/references/tat-konaklari-antalya.png",
  },
  {
    name: "Yeniköy Villası",
    image: "/references/yenikoy-villasi.png",
  },
  {
    name: "Demirevler Sitesi Üsküdar",
    image: "/references/demirevler-sitesi-uskudar.png",
  },
  {
    name: "Beykoz Konakları Kavacık",
    image: "/references/beykoz-konaklari-kavacik.png",
  },
];

export const references = [
  {
    name: "Kuzeyline Holding",
    sector: "Kurumsal Gayrimenkul",
    quote: "Risk yönetimini ve marka itibarını aynı ciddiyetle ele alan güvenilir bir iş ortağı.",
  },
  {
    name: "Orion Grand Hotel",
    sector: "Lüks Otelcilik",
    quote: "Ekip, misafir deneyimimize uyum sağlarken güvenlik standartlarımızı yükseltti.",
  },
  {
    name: "Atlas Lojistik Park",
    sector: "Lojistik",
    quote: "Raporlama düzeni ve müdahale disiplini yönetim ekibimize güven verdi.",
  },
];

export const faqs = [
  {
    question: "İçerikler ve görseller daha sonra değiştirilebilir mi?",
    answer: "Evet. Ana metinler merkezi bir içerik dosyasında tutulur; mevcut görseller ve bilgiler kolayca değiştirilebilir.",
  },
  {
    question: "Hem danışmanlık hem de personelli güvenlik hizmeti sunulabilir mi?",
    answer: "Evet. Site yapısı hem stratejik güvenlik danışmanlığını hem de sahada görev yapan güvenlik ekiplerini anlatacak şekilde hazırlandı.",
  },
  {
    question: "Bu yapı kurumsal müşterilere uygun mu?",
    answer: "Evet. Tasarım dili, metin tonu, referans alanları ve iletişim akışı premium kurumsal müşteriler için kurgulandı.",
  },
  {
    question: "Birden fazla lokasyon veya farklı dil desteği eklenebilir mi?",
    answer: "Bileşen mimarisi, ileride çok lokasyonlu sayfalar veya ek dil desteği eklenecek şekilde genişletilebilir.",
  },
];

export const ctaItems = [
  "Güvenlik analizi",
  "Yönetici bilgilendirmesi",
  "Saha görev planı",
].map((label) => ({ label, icon: ChevronRight }));
