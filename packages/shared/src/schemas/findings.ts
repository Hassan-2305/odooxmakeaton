import { z } from "zod";
import { paiseSchema } from "./common.js";

const noteSchema = z.string().trim().max(2000);

export const findingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    confirmedImpactPaise: paiseSchema,
    note: noteSchema.optional(),
  }),
  z.object({ action: z.literal("dismiss"), note: noteSchema.min(3) }),
  z.object({ action: z.literal("resolve"), note: noteSchema.optional() }),
  z.object({ action: z.literal("reopen"), note: noteSchema.optional() }),
]);
export type FindingActionInput = z.infer<typeof findingActionSchema>;
