import { PASSWORD_MIN_LENGTH } from "@brightloop/shared";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError, errorMessage } from "./api";

/**
 * Shows an API error inline: field errors (400 validation_error, or a 409 that names
 * `details.field`) go under their inputs; anything else becomes the form's root error.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
) {
  const known = new Set<string>(knownFields);
  let placed = false;

  if (error instanceof ApiError) {
    for (const [field, messages] of Object.entries(error.fields)) {
      if (known.has(field) && messages[0]) {
        setError(field as Path<T>, { type: "server", message: messages[0] });
        placed = true;
      }
    }
    const detailField = error.details?.field;
    if (!placed && typeof detailField === "string" && known.has(detailField)) {
      setError(detailField as Path<T>, { type: "server", message: error.message });
      placed = true;
    }
  }

  if (!placed) setError("root.server", { type: "server", message: errorMessage(error) });
}

export const PASSWORD_HINT = `More than ${PASSWORD_MIN_LENGTH - 1} characters, with upper and lower case letters and a special character.`;
