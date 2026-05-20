import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getOrCreateCustomer, getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();

  const body = await request.json();
  const { shop: shopDomain, generationId, customerId, customerEmail, type, rating, comment } = body;

  if (!shopDomain || !generationId || !type) {
    return corsJson({ success: false, error: "shop, generationId, and type are required" }, { status: 400 });
  }

  const shop = await getOrCreateShop(shopDomain);
  const customer = await getOrCreateCustomer({
    shopId: shop.id,
    shopifyCustomerId: customerId,
    email: customerEmail,
  });

  if (type === "like") {
    if (!customer) return corsJson({ success: false, error: "Customer is required for likes" }, { status: 401 });
    const db = prisma;
    await db.imageLike.upsert({
      where: { generationId_customerId: { generationId, customerId: customer.id } },
      update: {},
      create: { generationId, customerId: customer.id },
    });
  }

  if (type === "comment") {
    const db = prisma;
    await db.imageComment.create({
      data: { generationId, customerId: customer?.id, body: String(comment || "") },
    });
  }

  if (type === "review") {
    const db = prisma;
    await db.imageReview.create({
      data: {
        generationId,
        customerId: customer?.id,
        rating: Number(rating || 5),
        body: comment ? String(comment) : null,
      },
    });
  }

  return corsJson({ success: true });
}
