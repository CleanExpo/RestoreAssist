// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountMenu } from "../AccountMenu";
afterEach(cleanup);

it("exposes account, organisation and a supported account-switch link from the avatar", async () => {
  const logout = vi.fn();
  render(<AccountMenu email="synthetic@example.com" name="Synthetic" organizationId="org-a" businessName="Test business" onLogout={logout} busy={false} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Account and workspace" }), { key: "Enter" });
  expect(await screen.findByText("synthetic@example.com")).toBeInTheDocument();
  expect(screen.getByText("Organisation: org-a")).toBeInTheDocument();
  expect(screen.getByText("Business: Test business")).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Use another Google account" })).toHaveAttribute("href", "/login?switchAccount=google");
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  expect(logout).toHaveBeenCalledOnce();
});


it("does not invent a personal account while organisation details are unknown", async () => {
  render(<AccountMenu email="synthetic@example.com" onLogout={vi.fn()} busy={false} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Account and workspace" }), { key: "Enter" });
  expect(await screen.findByText("Organisation details are loading or unavailable")).toBeInTheDocument();
  expect(screen.queryByText("No linked organisation")).not.toBeInTheDocument();
});
