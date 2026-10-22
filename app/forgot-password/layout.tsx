import type { Metadata } from "next";

// The page is a client component, so its metadata lives here. The root
// layout's template renders this as "Forgot password | RestoreAssist".
export const metadata: Metadata = {
  title: "Forgot password",
  description:
    "Request a code to reset your RestoreAssist password.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
