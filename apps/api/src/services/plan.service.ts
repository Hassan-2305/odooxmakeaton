import type { CreatePlanInput, Plan, PlanListQuery, UpdatePlanInput } from "@brightloop/shared";
import { isCheckViolation, isForeignKeyViolation } from "../lib/db-errors.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { DbOrTx } from "../repositories/audit.repository.js";
import type { PlansRepository } from "../repositories/taxes-plans.repository.js";

type SellableFields = Pick<Plan, "isActive" | "availableFrom" | "availableTo">;

/** True when the plan is active and `date` falls in its availability window (both ends inclusive). */
export function isSellable(plan: SellableFields, date: string): boolean {
  return (
    plan.isActive &&
    (!plan.availableFrom || plan.availableFrom <= date) &&
    (!plan.availableTo || date <= plan.availableTo)
  );
}

export function createPlanService({ plans }: { plans: PlansRepository }) {
  async function guard<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isCheckViolation(err)) throw new BadRequestError("availableTo must be after availableFrom");
      throw err;
    }
  }

  return {
    isSellable,

    list: (query: PlanListQuery) => plans.list(query),

    async get(id: string, tx?: DbOrTx) {
      const plan = await plans.findById(id, tx);
      if (!plan) throw new NotFoundError("Plan");
      return plan;
    },

    create: (input: CreatePlanInput) => guard(() => plans.create(input)),

    async update(id: string, input: UpdatePlanInput) {
      const plan = await guard(() => plans.update(id, input));
      if (!plan) throw new NotFoundError("Plan");
      return plan;
    },

    async remove(id: string) {
      try {
        if (!(await plans.delete(id))) throw new NotFoundError("Plan");
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new ConflictError("This plan is used by subscriptions or templates. Deactivate it instead.");
        }
        throw err;
      }
    },
  };
}

export type PlanService = ReturnType<typeof createPlanService>;
