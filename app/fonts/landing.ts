import localFont from "next/font/local";

export const outfit = localFont({
  src: "./Outfit.woff2",
  weight: "500 700",
  style: "normal",
  display: "swap",
  variable: "--font-landing-display",
});

export const jakarta = localFont({
  src: "./PlusJakartaSans.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-landing",
});
