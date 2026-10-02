import { z } from "zod";

/**
 * Models fill a "no value" field in several ways: null, nothing at all, the
 * string "null" or an empty string. All of them mean null. The JSON schema the
 * model sees stays a plain union of the real type, string and null, with the
 * field optional; the transform only runs when the tool parses the call.
 */
const isNone = (value: unknown): boolean =>
  value === null || value === undefined || value === "" || (typeof value === "string" && value.trim().toLowerCase() === "null");

/** A string or null: "null", "" and a missing value become null. */
export const lenientNullableString = (check: z.ZodString = z.string()) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (isNone(value)) return null;
      const parsed = check.safeParse(value);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
        return z.NEVER;
      }
      return parsed.data;
    });

/** A number or null: "null", "" and a missing value become null, a numeric string becomes a number. */
export const lenientNullableNumber = () =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (isNone(value)) return null;
      const number = typeof value === "string" ? Number(value.trim()) : value;
      if (typeof number !== "number" || !Number.isFinite(number)) {
        ctx.addIssue({ code: "custom", message: "expected a number or null" });
        return z.NEVER;
      }
      return number;
    });

/** A required number the model may send as a numeric string. */
export const lenientNumber = (check: z.ZodNumber = z.number()) =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    const number = typeof value === "string" ? Number(value.trim()) : value;
    const parsed = value === "" ? null : check.safeParse(number);
    if (!parsed || !parsed.success) {
      ctx.addIssue({ code: "custom", message: "expected a number" });
      return z.NEVER;
    }
    return parsed.data;
  });
