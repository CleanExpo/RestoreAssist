import localFont from "next/font/local";

export const geistSans = localFont({
  src: "./Geist.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-sans",
});

export const geistMono = localFont({
  src: "./GeistMono.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-mono",
});
