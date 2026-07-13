import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeadScoreCard } from "@/components/lead-score-card";

describe("LeadScoreCard", () => {
  it("renders the scored lead details, tier, budget, and reasons", () => {
    render(
      <LeadScoreCard
        input={{
          name: "Sam Rivera",
          company: "Northwind Labs",
          budget: 60_000,
        }}
        output={{
          score: 64,
          tier: "warm",
          reasons: ["Budget supports a mid-market deal.", "Full name was provided."],
        }}
      />,
    );

    const card = screen.getByRole("region", { name: /scorelead result/i });
    expect(within(card).getByRole("heading", { name: "Sam Rivera" })).toBeInTheDocument();
    expect(within(card).getByText("Northwind Labs")).toBeInTheDocument();
    expect(within(card).getByText("Warm lead")).toBeInTheDocument();
    expect(within(card).getByText("$60,000")).toBeInTheDocument();
    expect(within(card).getByText("64")).toBeInTheDocument();
    expect(within(card).getByText("Budget supports a mid-market deal.")).toBeInTheDocument();
  });

  it("uses a readable fallback when the tool input omits a lead name", () => {
    render(
      <LeadScoreCard
        output={{
          score: 28,
          tier: "cold",
          reasons: ["Only a limited budget signal was available."],
        }}
      />,
    );

    const card = screen.getByRole("region", { name: /scorelead result/i });
    expect(within(card).getByRole("heading", { name: "Unnamed lead" })).toBeInTheDocument();
    expect(within(card).getByText("Cold lead")).toBeInTheDocument();
    expect(within(card).queryByText(/budget:/i)).not.toBeInTheDocument();
  });
});
