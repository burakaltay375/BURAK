"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Camera,
  ChevronDown,
  Globe2,
  Mail,
  MapPin,
  Menu,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { company } from "@/content/site";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const navItems = ["Biz kimiz", "Ne yapıyoruz", "Kariyer", "Haberler", "İletişim"];

const serviceCards = [
  {
    title: "Güvenlik Personeli",
    text: "Kurumsal alanlar için eğitimli, disiplinli ve temsil gücü yüksek güvenlik ekipleri.",
    icon: ShieldCheck,
  },
  {
    title: "Teknolojik Çözümler",
    text: "Kamera, alarm, uzaktan izleme ve olay takip süreçleriyle desteklenen güvenlik yönetimi.",
    icon: Camera,
  },
  {
    title: "Risk Danışmanlığı",
    text: "Tesis, operasyon ve insan hareketlerine göre hazırlanan güvenlik analizleri ve aksiyon planları.",
    icon: Building2,
  },
];

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
          <a href="#contact" className="font-medium hover:text-red-600">Ara / İletişim</a>
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
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="bg-white">
      <div className="mx-auto max-w-6xl">
        <div className="relative min-h-[520px] overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(0,0,0,0.25), rgba(0,0,0,0.05)), url('https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=1600&q=80')",
            }}
          />
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.75, ease: "easeOut" }}
            className="absolute left-8 top-20 max-w-xl bg-black/82 p-8 text-white md:left-12 md:top-28 md:p-10"
          >
            <p className="text-3xl font-light text-red-500 md:text-4xl">Güvenlikte Yeni Nesil</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight md:text-6xl">Kurumsal Koruma Çözümleri</h1>
            <p className="mt-5 text-lg leading-8 text-zinc-200">
              Panter, işletmelerin insanlarını, varlıklarını ve operasyonlarını profesyonel ekiplerle korur.
            </p>
            <a href="#services" className="mt-8 inline-flex items-center gap-3 bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700">
              Hizmetleri keşfet <ArrowRight className="h-5 w-5" />
            </a>
          </motion.div>
          <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-3 bg-black py-4">
            {[0, 1, 2, 3].map((item) => (
              <span key={item} className={`h-0.5 w-10 ${item === 0 ? "bg-red-600" : "bg-white/50"}`} />
            ))}
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

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {serviceCards.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.article
                key={service.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.55, delay: index * 0.07 }}
                className="bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <Icon className="h-10 w-10 text-red-600" />
                <h3 className="mt-7 text-2xl font-bold text-zinc-950">{service.title}</h3>
                <p className="mt-4 leading-7 text-zinc-600">{service.text}</p>
                <a href="#contact" className="mt-7 inline-flex items-center gap-2 font-semibold text-red-600">
                  Devamı <ArrowRight className="h-4 w-4" />
                </a>
              </motion.article>
            );
          })}
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
            <p className="flex items-center gap-3"><Phone className="h-5 w-5" /> {company.phone}</p>
            <p className="flex items-center gap-3"><Mail className="h-5 w-5" /> {company.email}</p>
            <p className="flex items-center gap-3"><MapPin className="h-5 w-5" /> {company.address}</p>
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
    </main>
  );
}
