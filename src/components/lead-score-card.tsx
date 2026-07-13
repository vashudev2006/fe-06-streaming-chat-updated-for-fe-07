import type { ScoreLeadOutput } from "@/lib/tools/score-lead";

const TIER_COPY: Record<ScoreLeadOutput["tier"], { label: string; className: string }> = {
  hot: { label: "Hot lead", className: "tier-hot" },
  warm: { label: "Warm lead", className: "tier-warm" },
  cold: { label: "Cold lead", className: "tier-cold" },
};

export function LeadScoreCard({
  input,
  output,
}: {
  input?: { name?: string; company?: string; budget?: number };
  output: ScoreLeadOutput;
}) {
  const tier = TIER_COPY[output.tier];

  return (
    <div className="lead-score-card">
      <div className="lead-score-card__header">
        <div>
          <p className="lead-score-card__eyebrow">scoreLead result</p>
          <h4 className="lead-score-card__name">{input?.name ?? "Unnamed lead"}</h4>
          {input?.company ? (
            <p className="lead-score-card__company">{input.company}</p>
          ) : null}
        </div>
        <span className={`lead-score-card__tier ${tier.className}`}>{tier.label}</span>
      </div>

      <div className="lead-score-card__score-row">
        <div className="lead-score-card__gauge" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="lead-score-card__gauge-svg">
            <path
              className="lead-score-card__gauge-track"
              d="M18 2.5 a15.5 15.5 0 1 1 0 31 a15.5 15.5 0 1 1 0 -31"
            />
            <path
              className={`lead-score-card__gauge-fill ${tier.className}`}
              strokeDasharray={`${output.score}, 100`}
              d="M18 2.5 a15.5 15.5 0 1 1 0 31 a15.5 15.5 0 1 1 0 -31"
            />
          </svg>
          <span className="lead-score-card__gauge-number">{output.score}</span>
        </div>
        <div className="lead-score-card__meta">
          {typeof input?.budget === "number" ? (
            <p className="lead-score-card__budget">
              Budget: <strong>${input.budget.toLocaleString()}</strong>
            </p>
          ) : null}
          <p className="lead-score-card__score-label">Score out of 100</p>
        </div>
      </div>

      <ul className="lead-score-card__reasons">
        {output.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
