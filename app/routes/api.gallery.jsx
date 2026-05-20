import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  if (!shopDomain) {
    return json({ success: false, error: "shop is required" }, { status: 400 });
  }

  const shop = await getOrCreateShop(shopDomain);
  const db = prisma;
  const images = await db.aiImageGeneration.findMany({
    where: {
      shopId: shop.id,
      visibility: "PUBLIC",
      moderationStatus: "APPROVED",
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    take: 24,
    include: { _count: { select: { likes: true, comments: true, reviews: true } } },
  });

  return json({ success: true, images });
}
