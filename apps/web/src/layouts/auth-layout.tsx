import { Outlet } from "react-router";
import { Brand } from "./shell-parts";

/** Centered card for the signed-out pages. */
export function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-surface px-4 py-10">
      <Brand to="/login" className="mb-6 text-lg" />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <Outlet />
      </div>
    </div>
  );
}
