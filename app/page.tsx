import HomePage from "@/components/landing/HomePage";

/**
 * RA-7712 — regenerate the marketing home every 5 minutes (ISR) instead of
 * letting Next prerender it once with a one-year s-maxage. The page body is a
 * client component; this server wrapper exists to carry the route config.
 */
export const revalidate = 300;

export default function Home() {
  return <HomePage />;
}
