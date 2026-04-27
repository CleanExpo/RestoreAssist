import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a RestoreAssist account and get started in minutes. Free trial, no credit card required.",
  robots: { index: true, follow: true },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
