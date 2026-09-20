// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AiOwnershipPreGenerateNotice from "@/components/AiOwnershipPreGenerateNotice";
import {
  AI_OWNERSHIP_PRE_GENERATE_BODY,
  AI_OWNERSHIP_PRE_GENERATE_TITLE,
} from "@/lib/reports/ai-ownership";

afterEach(() => cleanup());

describe("AiOwnershipPreGenerateNotice", () => {
  it("states AI draft is not a signed or issued report", () => {
    render(<AiOwnershipPreGenerateNotice />);
    expect(
      screen.getByTestId("ai-draft-vs-issued-notice"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(AI_OWNERSHIP_PRE_GENERATE_TITLE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(AI_OWNERSHIP_PRE_GENERATE_BODY),
    ).toBeInTheDocument();
    // Independent literal: the constant above could be reworded to the
    // opposite claim and still match itself.
    expect(screen.getByText(/AI draft is not a signed or issued report/i)).toBeInTheDocument();
  });
});
