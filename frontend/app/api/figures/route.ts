import { NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/figures`,
      {
        next: {
          revalidate: 86400,
        },
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          detail:
            "Unable to load available perspectives.",
        },
        {
          status: response.status,
        },
      );
    }

    const payload = await response.json();

    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error(
      "Unable to fetch cached figure metadata:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Unable to load available perspectives.",
      },
      {
        status: 503,
      },
    );
  }
}
