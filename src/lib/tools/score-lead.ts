import { z } from "zod";

// ---------------------------------------------------------------------------
// Tool contract: scoreLead
//
// name: "scoreLead"
// input: { name: string; company: string; budget: number }
// output: { score: number; tier: "cold" | "warm" | "hot"; reasons: string[] }
//
// The schema below is the single source of truth for validation. The JSON
// Schema handed to Anthropic's Messages API (`toAnthropicToolDefinition`)
// is derived from the same shape by hand, since this project has no network
// access to install a zod-to-json-schema style dependency. Keep the two in
// sync if the schema changes.
// ---------------------------------------------------------------------------

export const scoreLeadInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Lead name is required.")
    .max(120, "Lead name is too long."),
  company: z
    .string()
    .trim()
    .min(1, "Company name is required.")
    .max(160, "Company name is too long."),
  budget: z
    .number()
    .finite("Budget must be a finite number.")
    .nonnegative("Budget cannot be negative."),
});

export type ScoreLeadInput = z.infer<typeof scoreLeadInputSchema>;

export const scoreLeadOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(["cold", "warm", "hot"]),
  reasons: z.array(z.string()).min(1),
});

export type ScoreLeadOutput = z.infer<typeof scoreLeadOutputSchema>;

export const SCORE_LEAD_TOOL_NAME = "scoreLead";

/**
 * The tool definition Anthropic's Messages API expects. Mirrors
 * `scoreLeadInputSchema` above.
 */
export function toAnthropicToolDefinition() {
  return {
    name: SCORE_LEAD_TOOL_NAME,
    description:
      "Score a sales lead's likelihood to convert based on their name, company, and estimated budget in USD. Returns a 0-100 score, a tier (cold/warm/hot), and the reasons behind the score.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The lead's full name.",
        },
        company: {
          type: "string",
          description: "The company the lead represents.",
        },
        budget: {
          type: "number",
          description: "The lead's estimated budget in USD.",
        },
      },
      required: ["name", "company", "budget"],
    },
  };
}

/**
 * A business-rule error, distinct from a schema-validation error, so the
 * output-error UI state has more than one failure mode to demonstrate.
 */
export class LeadScoringError extends Error {}

/**
 * The tool's `execute` function. Validates input with Zod, applies a
 * deterministic (non-LLM) scoring rubric, and either returns a typed
 * output or throws — the caller is responsible for turning a throw into
 * the `output-error` tool part.
 */
export async function scoreLead(rawInput: unknown): Promise<ScoreLeadOutput> {
  const parsedInput = scoreLeadInputSchema.safeParse(rawInput);

  if (!parsedInput.success) {
    throw new LeadScoringError(
      parsedInput.error.issues[0]?.message ?? "Lead input did not match the tool schema.",
    );
  }

  const input = parsedInput.data;

  if (input.budget > 50_000_000) {
    throw new LeadScoringError(
      `Budget of $${input.budget.toLocaleString("en-US")} is outside a plausible range for this pipeline. Double-check the figure.`,
    );
  }

  const reasons: string[] = [];
  let score = 0;

  if (input.budget >= 150_000) {
    score += 55;
    reasons.push(`Budget of $${input.budget.toLocaleString("en-US")} is enterprise-scale.`);
  } else if (input.budget >= 50_000) {
    score += 42;
    reasons.push(`Budget of $${input.budget.toLocaleString("en-US")} supports a mid-market deal.`);
  } else if (input.budget >= 15_000) {
    score += 28;
    reasons.push(`Budget of $${input.budget.toLocaleString("en-US")} fits a standard package.`);
  } else if (input.budget >= 2_000) {
    score += 14;
    reasons.push(`Budget of $${input.budget.toLocaleString("en-US")} is on the smaller side.`);
  } else {
    reasons.push(`Budget of $${input.budget.toLocaleString("en-US")} is very limited.`);
  }

  const companyWordCount = input.company.split(/\s+/).filter(Boolean).length;
  if (companyWordCount >= 2) {
    score += 15;
    reasons.push(`"${input.company}" reads as a registered company name.`);
  } else {
    score += 5;
    reasons.push(`"${input.company}" is a short, single-word company name.`);
  }

  const looksLikeFullName = input.name.trim().split(/\s+/).length >= 2;
  if (looksLikeFullName) {
    score += 15;
    reasons.push(`"${input.name}" was submitted as a full name.`);
  } else {
    score += 5;
    reasons.push(`"${input.name}" looks like a first name only.`);
  }

  // Small deterministic jitter so identical company/budget pairs with
  // different names don't always land on the exact same integer.
  const nameSeed = input.name.length % 7;
  score += nameSeed;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier: ScoreLeadOutput["tier"] =
    score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";

  reasons.push(
    tier === "hot"
      ? "Overall profile suggests a high-priority follow-up."
      : tier === "warm"
        ? "Overall profile is worth a nurture sequence."
        : "Overall profile suggests low near-term priority.",
  );

  return scoreLeadOutputSchema.parse({ score, tier, reasons });
}
