import { CompassIcon } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Brand } from "@/layouts/shell-parts";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
      <Brand to="/" />
      <div className="card-surface w-full max-w-md">
        <p className="pt-10 text-center text-6xl font-semibold tracking-tight text-foreground/15">
          404
        </p>
        <EmptyState
          className="pt-4"
          icon={CompassIcon}
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved."
          action={
            <Button asChild>
              <Link to="/">Go home</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
