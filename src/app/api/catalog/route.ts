import { searchCatalog, listCatalogClothing, listCatalogLocations } from "@/lib/catalog-index";
import { apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type") ?? "all";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
  const ids = url.searchParams.get("ids")?.split(",").map((id) => id.trim()).filter(Boolean);
  const categories = url.searchParams
    .get("categories")
    ?.split(",")
    .map((category) => category.trim())
    .filter(Boolean);

  if (query) {
    return apiJson(searchCatalog(query));
  }

  if (type === "clothing") {
    return apiJson({
      clothing: listCatalogClothing({ limit, ids, categories }),
    });
  }

  if (type === "locations") {
    return apiJson({ locations: listCatalogLocations({ limit }) });
  }

  return apiJson({
    clothing: listCatalogClothing({ limit: Math.min(limit, 100) }),
    locations: listCatalogLocations({ limit: Math.min(limit, 100) }),
  });
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/catalog");
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
