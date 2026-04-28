import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchWeatherSnapshot } from "@/lib/weather/weather-provider";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/weather/snapshot
 *
 * Returns a WeatherSnapshot for the given country/postcode/date.
 * Auth required. Rate limited to 10 requests per minute per user (BOM courtesy).
 *
 * Body: { country: "AU" | "NZ", postcode: string, date: string (ISO) }
 * Returns: { data: WeatherSnapshot }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimitResponse = await applyRateLimit(req, {
    windowMs: 60_000,
    maxRequests: 10,
    prefix: "weather:snapshot",
    key: userId,
  });
  if (rateLimitResponse) return rateLimitResponse;

  // RA-1266: idempotency cuts repeat outbound calls to BOM / NZ MetService
  // when a client retries the same country/postcode/date lookup.
  return withIdempotency(req, userId, async (rawBody) => {
    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return apiError(req, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    if (typeof body !== "object" || body === null) {
      return apiError(req, {
        code: "VALIDATION",
        message: "Body must be a JSON object",
        status: 400,
      });
    }

    const { country, postcode, date } = body as Record<string, unknown>;

    if (country !== "AU" && country !== "NZ") {
      return apiError(req, {
        code: "VALIDATION",
        message: 'country must be "AU" or "NZ"',
        status: 400,
      });
    }

    if (typeof postcode !== "string" || postcode.trim() === "") {
      return apiError(req, {
        code: "VALIDATION",
        message: "postcode must be a non-empty string",
        status: 400,
      });
    }

    if (typeof date !== "string" || date.trim() === "") {
      return apiError(req, {
        code: "VALIDATION",
        message: "date must be an ISO date string",
        status: 400,
      });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return apiError(req, {
        code: "VALIDATION",
        message: "date is not a valid ISO date string",
        status: 400,
      });
    }

    try {
      const snapshot = await fetchWeatherSnapshot({
        country: country as "AU" | "NZ",
        postcode: postcode.trim(),
        date: parsedDate,
      });

      return NextResponse.json({ data: snapshot });
    } catch (err) {
      return fromException(req, err, { stage: "weather-snapshot" });
    }
  });
}
