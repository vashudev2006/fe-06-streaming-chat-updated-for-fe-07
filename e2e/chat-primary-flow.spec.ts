import { expect, test } from "@playwright/test";

function sse(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

test("primary chat flow renders a mocked streaming tool result", async ({ page }) => {
  let chatRouteCalls = 0;

  await page.route("**/api/chat", async (route) => {
    chatRouteCalls += 1;
    const payload = route.request().postDataJSON() as {
      messages?: Array<{ role: string; content: string }>;
    };

    expect(payload.messages?.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("Priya Anand"),
    });

    const input = {
      name: "Priya Anand",
      company: "Meridian Robotics",
      budget: 120_000,
    };

    const body = [
      sse("meta", { mode: "mock" }),
      sse("token", { chunk: "Let me score that lead." }),
      sse("tool-start", { toolCallId: "mock-call-1", toolName: "scoreLead" }),
      sse("tool-input-delta", {
        toolCallId: "mock-call-1",
        delta: JSON.stringify(input, null, 2),
      }),
      sse("tool-input-available", {
        toolCallId: "mock-call-1",
        toolName: "scoreLead",
        input,
      }),
      sse("tool-output-available", {
        toolCallId: "mock-call-1",
        output: {
          score: 88,
          tier: "hot",
          reasons: [
            "Budget supports a serious rollout.",
            "Company profile matches the ideal customer.",
          ],
        },
      }),
      sse("token", { chunk: " Priya scored 88/100." }),
      sse("done", { ok: true }),
    ].join("");

    await route.fulfill({
      body,
      contentType: "text/event-stream; charset=utf-8",
      status: 200,
    });
  });

  await page.goto("/");

  await page
    .getByRole("textbox", { name: /^message/i })
    .fill("Score a lead named Priya Anand at Meridian Robotics with a $120k budget.");
  await page.getByRole("button", { name: /send message/i }).click();

  await expect(page.getByRole("article", { name: /user message/i })).toContainText(
    "Priya Anand",
  );

  const result = page.getByRole("region", { name: /scorelead result/i });
  await expect(result).toContainText("Priya Anand");
  await expect(result).toContainText("Meridian Robotics");
  await expect(result).toContainText("Hot lead");
  await expect(result).toContainText("88");
  await expect(page.getByRole("article", { name: /assistant message/i }).last()).toContainText(
    "Priya scored 88/100.",
  );
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /stop stream/i })).toHaveCount(0);
  expect(chatRouteCalls).toBe(1);
});
