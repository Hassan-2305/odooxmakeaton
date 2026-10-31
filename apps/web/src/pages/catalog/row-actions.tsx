import { PencilIcon, Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useApiMutation, type ResourceKey } from "@/lib/resources";
import { toast } from "@/lib/toast";

/**
 * Edit/delete state for an admin catalog list: `edit(row)` opens the form, `remove(row)` asks
 * for confirmation and DELETEs `${path}/${id}`.
 */
export function useRowActions<T extends { id: string; name: string }>(path: string, invalidate: readonly ResourceKey[]) {
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const del = useApiMutation((id: string) => api(`${path}/${id}`, { method: "DELETE" }), invalidate);

  const confirm = (what: string, description: ReactNode) => (
    <ConfirmDialog
      open={deleting !== null}
      onOpenChange={(o) => !o && setDeleting(null)}
      destructive
      title={`Delete ${deleting?.name ?? what}?`}
      description={description}
      confirmLabel={`Delete ${what}`}
      onConfirm={async () => {
        if (!deleting) return;
        await del.mutateAsync(deleting.id);
        toast.success(`${what.charAt(0).toUpperCase()}${what.slice(1)} deleted`, deleting.name);
      }}
    />
  );

  const cell = (row: T) => (
    <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="icon-xs" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)}>
        <PencilIcon />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label={`Delete ${row.name}`} onClick={() => setDeleting(row)}>
        <Trash2Icon />
      </Button>
    </span>
  );

  return {
    editing: editing === "new" ? undefined : (editing ?? undefined),
    formOpen: editing !== null,
    openNew: () => setEditing("new"),
    closeForm: (open: boolean) => !open && setEditing(null),
    cell,
    confirm,
  };
}
