import { Outlet } from "react-router";
import { ContourArt } from "@/components/contour-art";
import { BRAND_NAME } from "@/lib/brand";
import { Brand } from "./shell-parts";

/**
 * Signed-out pages. A navy field with the contour artwork running behind everything, a plain
 * statement on the left and the form on the right; no split panels.
 */
export function AuthLayout() {
  return (
    <div className="relative isolate min-h-svh overflow-hidden bg-sidebar text-white">
      <ContourArt variant="hero" className="absolute inset-0 -z-10 size-full text-white/[0.07]" />

      <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-6 py-8 sm:px-10">
        <Brand to="/login" className="text-white" />

        <div className="grid flex-1 items-center gap-16 py-12 lg:grid-cols-[1fr_26rem]">
          <section className="hidden max-w-lg lg:block">
            <h1 className="text-[2.9rem] leading-[1.05] font-semibold tracking-[-0.035em]">
              Recurring revenue,
              <br />
              <span className="text-[#F26A1B]">billed on time.</span>
            </h1>
            <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed text-slate-300">
              Plans, subscriptions, invoices and collections for businesses that bill in rupees. Every
              invoice snapshots its prices and GST rates, so the numbers you send are the numbers you keep.
            </p>
            <dl className="mt-12 grid max-w-md grid-cols-3 border-t border-white/10 pt-6 text-sm">
              {[
                ["Billing runs", "on schedule"],
                ["Leaks", "flagged for review"],
                ["Renewals", "tracked ahead"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-medium text-white">{k}</dt>
                  <dd className="mt-0.5 text-slate-400">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mx-auto w-full max-w-[26rem] rounded-2xl bg-card p-8 text-foreground shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)] sm:p-9">
            <Outlet />
          </section>
        </div>

        <footer className="text-xs text-slate-500">
          © {new Date().getFullYear()} {BRAND_NAME}
        </footer>
      </div>
    </div>
  );
}
