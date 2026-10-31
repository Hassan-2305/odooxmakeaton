import { BellRingIcon, CheckCircle2Icon, ReceiptIcon, RepeatIcon } from "lucide-react";
import { Outlet } from "react-router";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { LogoMark } from "./shell-parts";

const FEATURES = [
  { icon: RepeatIcon, title: "Recurring billing", text: "Invoices generated on schedule" },
  { icon: ReceiptIcon, title: "GST-ready", text: "Tax snapshots on every line" },
  { icon: BellRingIcon, title: "Live insights", text: "Collections, aging and renewals" },
];

/** Decorative, data-free sketch of the product: a floating card with a bar chart and rows. */
function ProductSketch() {
  const bars = [38, 56, 44, 72, 60, 84, 66, 92];
  return (
    <div className="relative mt-10 hidden max-w-md lg:block" aria-hidden>
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="mb-4 flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-orange-400" />
          <span className="h-2 w-24 rounded-full bg-white/25" />
          <span className="ml-auto h-2 w-10 rounded-full bg-white/15" />
        </div>
        <div className="flex h-28 items-end gap-2.5">
          {bars.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-orange-600/70 to-orange-300"
              style={{ height: `${h}%`, opacity: 0.55 + i * 0.05 }}
            />
          ))}
        </div>
        <div className="mt-4 space-y-2.5">
          {[70, 52, 61].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="size-6 rounded-md bg-white/10" />
              <span className="h-2 rounded-full bg-white/20" style={{ width: `${w}%` }} />
              <span className="ml-auto h-4 w-12 rounded-full bg-emerald-400/25" />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -right-8 -bottom-6 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#16203a]/90 px-4 py-3 shadow-xl backdrop-blur-md">
        <CheckCircle2Icon className="size-5 text-emerald-400" />
        <div className="space-y-1.5">
          <span className="block h-2 w-20 rounded-full bg-white/30" />
          <span className="block h-2 w-12 rounded-full bg-white/15" />
        </div>
      </div>
    </div>
  );
}

/** Signed-out pages: one full-bleed navy scene with the pitch on the left and the form card floating on it. */
export function AuthLayout() {
  const [lead, rest] = BRAND_TAGLINE.split(",");
  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-[#0b1222] text-white">
      {/* Background art */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -top-40 -left-40 size-[36rem] rounded-full bg-orange-500/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 size-[32rem] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute -bottom-48 left-1/3 size-[30rem] rounded-full bg-orange-600/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <svg className="absolute right-0 bottom-0 w-full max-w-5xl text-white/[0.04]" viewBox="0 0 800 200" fill="none">
          <path d="M0 160 C120 120 200 180 320 130 S520 40 640 90 S760 60 800 40" stroke="currentColor" strokeWidth="2" />
          <path d="M0 190 C140 150 220 200 340 160 S540 80 660 120 S770 100 800 80" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>

      <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <LogoMark className="size-9" /> {BRAND_NAME}
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.1fr_minmax(0,28rem)]">
          <section className="hidden lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
              <span className="size-1.5 rounded-full bg-orange-400" /> Billing platform for Indian businesses
            </span>
            <h1 className="mt-5 text-5xl leading-[1.08] font-bold">
              {lead},
              <span className="block bg-gradient-to-r from-orange-300 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                {rest?.trim()}
              </span>
            </h1>
            <p className="mt-5 max-w-md text-base text-slate-300">
              Customers, subscriptions, invoices and payments in one place, with revenue health at a glance.
            </p>
            <ul className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur">
                  <Icon className="size-5 text-orange-400" aria-hidden />
                  <p className="mt-2 text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{text}</p>
                </li>
              ))}
            </ul>
            <ProductSketch />
          </section>

          <section className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-px rounded-[1.4rem] bg-gradient-to-br from-orange-400/60 via-white/10 to-indigo-400/40 blur-[1px]" aria-hidden />
            <div className="relative rounded-[1.35rem] bg-white p-8 text-foreground shadow-2xl shadow-black/40 sm:p-9">
              <Outlet />
            </div>
          </section>
        </div>

        <footer className="text-center text-xs text-slate-500 lg:text-left">
          © {new Date().getFullYear()} {BRAND_NAME} · Billing in INR
        </footer>
      </div>
    </div>
  );
}
