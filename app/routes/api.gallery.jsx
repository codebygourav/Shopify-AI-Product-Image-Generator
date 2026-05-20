import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();
  return corsJson({ success: false, error: "Method not allowed" }, { status: 405 });
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  if (!shopDomain) {
    return corsJson({ success: false, error: "shop is required" }, { status: 400 });
  }

  const shop = await getOrCreateShop(shopDomain);
  const db = prisma;
  const images = await db.aiImageGeneration.findMany({
    where: {
      shopId: shop.id,
      visibility: "PUBLIC",
      moderationStatus: "APPROVED",
      status: "COMPLETED",
      imageUrl: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
    include: {
      _count: { select: { likes: true, comments: true, reviews: true } },
      reviews: { where: { isApproved: true }, orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  return corsJson({ success: true, images });
}
