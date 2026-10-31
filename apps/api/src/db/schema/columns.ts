import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";
import { currency } from "./enums.js";

export const id = () => uuid("id").primaryKey().defaultRandom();

/** Integer paise. `number` mode is exact up to 2^53, far beyond any invoice total. */
export const paise = (name: string) => bigint(name, { mode: "number" });

export const currencyCol = () => currency("currency").notNull().default("INR");

/** All timestamps are stored in UTC. */
export const utc = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const timestamps = () => ({
  createdAt: utc("created_at").notNull().defaultNow(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});
