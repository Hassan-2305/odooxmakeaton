import type { ReactNode } from "react";
import { LogoMark } from "@/layouts/shell-parts";

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-7 space-y-3">
      <LogoMark className="size-10 shadow-lg shadow-orange-500/30 rounded-[10px]" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
