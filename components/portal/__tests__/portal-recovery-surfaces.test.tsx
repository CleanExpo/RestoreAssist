// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalEmptyProject } from "../PortalEmptyProject";
import { PortalLinkExpired } from "../PortalLinkExpired";
import { PortalNotReady } from "../PortalNotReady";
import { PortalTokenAccessFallback } from "../PortalTokenAccessFallback";
import {
  parseInviteFailureStatus,
  PortalRecoveryCard,
} from "../PortalRecoveryCard";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";

function hrefs(): string[] {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
}

describe("PortalRecoveryCard", () => {
  it("shows a resend path on expired invites, never contractor auth", () => {
    render(
      <PortalRecoveryCard
        status="EXPIRED"
        message="This invitation has expired"
      />,
    );
    expect(screen.getByTestId("portal-invite-recovery")).toHaveAttribute(
      "data-invite-status",
      "EXPIRED",
    );
    expect(screen.getByText("Invitation expired")).toBeInTheDocument();
    expect(hrefs()).toEqual(
      expect.arrayContaining([PORTAL_PATHS.recovery, PORTAL_PATHS.help]),
    );
    expect(hrefs().some((href) => href === "/login")).toBe(false);
    expect(hrefs().some((href) => href.startsWith("/dashboard"))).toBe(false);
  });

  it("sends an already-accepted invite to portal login", () => {
    render(<PortalRecoveryCard status="ACCEPTED" />);
    expect(
      screen.getByRole("link", { name: /sign in to the client portal/i }),
    ).toHaveAttribute("href", PORTAL_PATHS.login);
  });

  it("classifies unknown verify payloads as INVALID", () => {
    expect(parseInviteFailureStatus("EXPIRED")).toBe("EXPIRED");
    expect(parseInviteFailureStatus(undefined)).toBe("INVALID");
  });
});

describe("PortalEmptyProject", () => {
  it("is not a blank dead end — recovery and help CTAs stay on /portal", () => {
    render(<PortalEmptyProject />);
    expect(screen.getByTestId("portal-empty-project")).toBeInTheDocument();
    const inviteLinks = screen.getAllByRole("link", {
      name: /request a new invite/i,
    });
    expect(inviteLinks.length).toBeGreaterThan(0);
    for (const link of inviteLinks) {
      expect(link).toHaveAttribute("href", PORTAL_PATHS.recovery);
    }
    expect(screen.getByRole("link", { name: /^client help$/i })).toHaveAttribute(
      "href",
      PORTAL_PATHS.help,
    );
    expect(hrefs().some((href) => href === "/" || href === "/login")).toBe(
      false,
    );
  });
});

describe("PortalLinkExpired", () => {
  it("renders a recovery card instead of a blank page", () => {
    render(<PortalLinkExpired />);
    expect(screen.getByTestId("portal-link-expired")).toBeInTheDocument();
    expect(screen.getByText(/job link has expired/i)).toBeInTheDocument();
    const inviteLinks = screen.getAllByRole("link", {
      name: /request a new invite/i,
    });
    expect(inviteLinks.length).toBeGreaterThan(0);
    for (const link of inviteLinks) {
      expect(link).toHaveAttribute("href", PORTAL_PATHS.recovery);
    }
    expect(
      screen.getByRole("link", { name: /sign in with a portal account/i }),
    ).toHaveAttribute("href", PORTAL_PATHS.login);
    expect(hrefs().some((href) => href.startsWith("/dashboard"))).toBe(false);
  });
});

describe("PortalNotReady", () => {
  it("is honest that the link is still valid — never expired language", () => {
    render(<PortalNotReady />);
    expect(screen.getByTestId("portal-not-ready")).toBeInTheDocument();
    expect(
      screen.getByText(/your report is not ready yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/job link is still valid/i)).toBeInTheDocument();
    expect(screen.queryByText(/job link has expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expired or invalid/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign in with a portal account/i }),
    ).toHaveAttribute("href", PORTAL_PATHS.login);
    expect(hrefs().some((href) => href.startsWith("/dashboard"))).toBe(false);
  });
});

describe("PortalTokenAccessFallback (RA-7606)", () => {
  it("maps a live account with no inspection to not-ready, not expired", () => {
    render(<PortalTokenAccessFallback resolved={{ kind: "unready" }} />);
    expect(screen.getByTestId("portal-not-ready")).toBeInTheDocument();
    expect(screen.queryByTestId("portal-link-expired")).not.toBeInTheDocument();
  });

  it("maps a genuinely bad token to LinkExpired", () => {
    render(<PortalTokenAccessFallback resolved={{ kind: "invalid" }} />);
    expect(screen.getByTestId("portal-link-expired")).toBeInTheDocument();
    expect(screen.queryByTestId("portal-not-ready")).not.toBeInTheDocument();
  });
});
