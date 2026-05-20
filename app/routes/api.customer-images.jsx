import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getOrCreateCustomer, getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const customerId = url.searchParams.get("customerId");
  const customerEmail = url.searchParams.get("customerEmail");
  const productId = url.searchParams.get("productId");

  if (!shopDomain) {
    return corsJson({ success: false, error: "shop is required" }, { status: 400 });
  }

  const shop = await getOrCreateShop(shopDomain);
  const customer = await getOrCreateCustomer({
    shopId: shop.id,
    shopifyCustomerId: customerId,
    email: customerEmail,
  });

  const db = prisma;
  const images = await db.aiImageGeneration.findMany({
    where: {
      shopId: shop.id,
      status: "COMPLETED",
      moderationStatus: "APPROVED",
      ...(customer ? { customerId: customer.id } : { visibility: "PUBLIC" }),
      ...(productId ? { productId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      _count: { select: { likes: true, comments: true, reviews: true } },
      reviews: {
        where: { isApproved: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      comments: {
        where: { isApproved: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return corsJson({ success: true, images });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();

  const body = await request.json();
  const { shop: shopDomain, generationId, customerId, customerEmail } = body;

  if (!shopDomain || !generationId) {
    return corsJson({ success: false, error: "shop and generationId are required" }, { status: 400 });
  }

  const shop = await getOrCreateShop(shopDomain);
  const customer = await getOrCreateCustomer({
    shopId: shop.id,
    shopifyCustomerId: customerId,
    email: customerEmail,
  });

  const db = prisma;
  const image = await db.aiImageGeneration.findFirst({
    where: { id: generationId, shopId: shop.id, ...(customer ? { customerId: customer.id } : {}) },
  });

  if (!image) {
    return corsJson({ success: false, error: "Image was not found." }, { status: 404 });
  }

  const updated = await db.aiImageGeneration.update({
    where: { id: image.id },
    data: { selectedForCart: true },
  });

  return corsJson({ success: true, image: updated });
}
