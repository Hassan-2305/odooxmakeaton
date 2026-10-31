import {
  ArrowRight,
  CalendarClock,
  Check,
  FileText,
  Layers,
  Percent,
  Radio,
  Receipt,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { ContourArt } from "@/components/contour-art";
import { Brand } from "@/layouts/shell-parts";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

const ACCENT = "#F26A1B";

const FEATURES = [
  {
    icon: Layers,
    title: "Products, plans & variants",
    body: "Model monthly, quarterly and yearly plans with attributes, variants and per-plan pricing in one catalog.",
  },
  {
    icon: RefreshCw,
    title: "Automated billing runs",
    body: "Generate every due invoice on schedule, with run counters and item-level results you can audit.",
  },
  {
    icon: Percent,
    title: "GST & discounts, snapshotted",
    body: "Each invoice freezes its prices and tax rates, so later catalog edits never rewrite history.",
  },
  {
    icon: ShieldCheck,
    title: "Revenue integrity checks",
    body: "Flags leaks like duplicate invoices, missed renewals and unbilled subscriptions before they cost you.",
  },
  {
    icon: CalendarClock,
    title: "Renewals tracked ahead",
    body: "See every subscription coming up for renewal and act before a customer silently lapses.",
  },
  {
    icon: UserRound,
    title: "Self-serve customer portal",
    body: "Customers view subscriptions, download invoices and check payments without emailing your team.",
  },
];

const STEPS = [
  { n: "01", title: "Set up your catalog", body: "Add products, plans, taxes and discounts." },
  { n: "02", title: "Quote and subscribe", body: "Turn a quotation into a live subscription in a click." },
  { n: "03", title: "Bill and collect", body: "Billing runs raise invoices; payments reconcile against them." },
];

export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Hero */}
      <header className="relative isolate overflow-hidden bg-sidebar text-white">
        <ContourArt variant="hero" className="absolute inset-0 -z-10 size-full text-white/[0.07]" />
        <div className="pointer-events-none absolute -top-40 right-[-10%] -z-10 size-[36rem] rounded-full bg-[#F26A1B]/20 blur-[120px]" />

        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
          <Brand to="/" className="text-white" />
          <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#portal" className="hover:text-white">Customer portal</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-slate-200 hover:text-white">
              Sign in
            </Link>
            <Link
              to="/register"
              className="hidden rounded-lg bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/20 hover:bg-white/15 sm:inline-flex"
            >
              Create account
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-10 pb-24 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-32">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10">
              <span className="size-1.5 rounded-full" style={{ background: ACCENT }} />
              {BRAND_TAGLINE}
            </span>
            <h1 className="mt-6 text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.04em] sm:text-[3.6rem]">
              Recurring revenue,
              <br />
              <span style={{ color: ACCENT }}>billed on time.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[1.08rem] leading-relaxed text-slate-300">
              {BRAND_NAME} runs plans, subscriptions, invoices and collections for businesses that bill in
              rupees, and catches revenue leaks before they reach your books.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="group inline-flex h-11 items-center gap-2 rounded-lg px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgb(242_106_27/0.8)] transition hover:brightness-110"
                style={{ background: ACCENT }}
              >
                Get started
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium text-slate-200 ring-1 ring-white/20 hover:bg-white/5"
              >
                Explore features
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              {["GST-ready invoices", "Live updates", "Role-based access"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4" style={{ color: ACCENT }} /> {t}
                </li>
              ))}
            </ul>
          </div>

          <HeroPreview />
        </div>
      </header>

      {/* Stats strip */}
      <section className="border-b border-border bg-card">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 sm:px-10 md:grid-cols-4">
          {[
            ["100%", "of invoices price-snapshotted"],
            ["3 roles", "admin, staff & customer"],
            ["Real-time", "dashboard via live events"],
            ["0 leaks", "left unflagged by integrity checks"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-2xl font-semibold tracking-tight">{k}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-10 px-6 py-24 sm:px-10">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold" style={{ color: ACCENT }}>
            Everything in one place
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            The whole subscription lifecycle, without the spreadsheets.
          </h2>
          <p className="mt-4 text-muted-foreground">
            From the first quotation to the hundredth renewal, every step is tracked, audited and visible to the
            people who need it.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="card-surface group p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgb(15_23_42/0.35)]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-sidebar text-white transition group-hover:bg-[#F26A1B]">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-10 bg-card py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Up and billing in three steps</h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative border-t-2 border-border pt-6">
                <span className="absolute -top-[2px] left-0 h-[2px] w-16" style={{ background: ACCENT }} />
                <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Portal / roles */}
      <section id="portal" className="mx-auto grid max-w-6xl scroll-mt-10 gap-6 px-6 py-24 sm:px-10 md:grid-cols-2">
        <RoleCard
          icon={Users}
          title="For your team"
          points={["Dashboard with MRR and collections", "Quotations, subscriptions, invoices", "Billing runs & audit log"]}
        />
        <RoleCard
          icon={FileText}
          title="For your customers"
          points={["Their subscriptions at a glance", "Invoices and payment history", "Profile managed in one place"]}
        />
      </section>

      {/* CTA */}
      <section className="px-6 pb-24 sm:px-10">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-sidebar px-8 py-16 text-center text-white sm:px-16">
          <ContourArt variant="band" className="absolute inset-0 -z-10 size-full text-white/[0.08]" />
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Stop chasing invoices.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Sign in to your workspace and let {BRAND_NAME} keep every rupee of recurring revenue accounted for.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/login"
              className="group inline-flex h-11 items-center gap-2 rounded-lg px-6 text-sm font-semibold text-white transition hover:brightness-110"
              style={{ background: ACCENT }}
            >
              Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/register"
              className="inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium ring-1 ring-white/25 hover:bg-white/5"
            >
              Create an account
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:px-10">
          <Brand to="/" className="text-foreground" />
          <span>
            © {new Date().getFullYear()} {BRAND_NAME}. {BRAND_TAGLINE}
          </span>
        </div>
      </footer>
    </div>
  );
}

function RoleCard({ icon: Icon, title, points }: { icon: typeof Users; title: string; points: string[] }) {
  return (
    <div className="card-surface p-8">
      <Icon className="size-6" style={{ color: ACCENT }} />
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <ul className="mt-5 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A stylised, static dashboard preview drawn with plain elements. */
function HeroPreview() {
  const bars = [38, 52, 46, 61, 58, 72, 68, 84, 79, 92, 88, 100];
  return (
    <div className="relative animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="rounded-2xl bg-card p-5 text-foreground shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Monthly recurring revenue</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">₹4,82,300</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Radio className="size-3" /> Live
          </span>
        </div>
        <div className="mt-5 flex h-32 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm"
              style={{ height: `${h}%`, background: i === bars.length - 1 ? ACCENT : "#0f1729", opacity: i === bars.length - 1 ? 1 : 0.15 + i * 0.05 }}
            />
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {[
            ["INV-1042", "Acme Pvt Ltd", "Paid", "bg-emerald-50 text-emerald-700"],
            ["INV-1043", "Nova Labs", "Due soon", "bg-amber-50 text-amber-700"],
            ["INV-1044", "Pixel Co", "Overdue", "bg-red-50 text-red-700"],
          ].map(([id, who, st, cls]) => (
            <div key={id} className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Receipt className="size-4 text-muted-foreground" />
                <span className="font-medium">{id}</span>
                <span className="text-muted-foreground">{who}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{st}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-6 -left-6 hidden rounded-xl bg-card px-4 py-3 text-foreground shadow-xl ring-1 ring-black/5 sm:block">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-emerald-600" /> Integrity check passed
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">No revenue leaks found today</p>
      </div>
    </div>
  );
}
