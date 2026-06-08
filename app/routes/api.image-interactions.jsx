import db from "../db.server";
import { corsJson, optionsResponse } from "../services/cors.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const generationId = url.searchParams.get("generationId");
  const take = clampTake(url.searchParams.get("take"), 12);

  if (!shopDomain) {
    return corsJson(
      { success: false, error: "shop is required" },
      { status: 400 },
    );
  }

  try {
    const shop = await db.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) return corsJson({ success: true, reviews: [] });

    const reviews = await db.imageReview.findMany({
      where: {
        isApproved: true,
        generation: {
          shopId: shop.id,
          status: "COMPLETED",
          moderationStatus: { not: "REJECTED" },
          ...(productId ? { productId } : {}),
          ...(generationId ? { id: generationId } : {}),
        },
      },
      include: {
        customer: true,
        generation: true,
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return corsJson({
      success: true,
      reviews: reviews.map(mapReview),
    });
  } catch (error) {
    console.error("api.image-interactions loader error", error);
    return corsJson({ success: false, error: error.message }, { status: 500 });
  }
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();

  try {
    const body = await request.json();
    const {
      shop: shopDomain,
      generationId,
      customerId,
      customerEmail,
      rating,
      comment,
      intent = "review:create",
    } = body;

    if (intent !== "review:create") {
      return corsJson(
        { success: false, error: "Unsupported interaction intent." },
        { status: 400 },
      );
    }

    if (!shopDomain || !generationId) {
      return corsJson(
        { success: false, error: "shop and generationId are required" },
        { status: 400 },
      );
    }

    const cleanId = (customerId && customerId !== "undefined" && customerId !== "null" && customerId !== "") ? customerId : null;
    const cleanEmail = (customerEmail && customerEmail !== "undefined" && customerEmail !== "null" && customerEmail !== "") ? customerEmail : null;

    const numericRating = Math.max(1, Math.min(5, Number(rating) || 5));
    const bodyText = String(comment || "")
      .trim()
      .slice(0, 1200);
    const shop = await db.shop.findUnique({ where: { shop: shopDomain } });

    if (!shop) {
      return corsJson(
        { success: false, error: "Shop was not found." },
        { status: 404 },
      );
    }

    const generation = await db.aiImageGeneration.findFirst({
      where: {
        id: generationId,
        shopId: shop.id,
        status: "COMPLETED",
        moderationStatus: { not: "REJECTED" },
      },
    });

    if (!generation) {
      return corsJson(
        { success: false, error: "Image was not found." },
        { status: 404 },
      );
    }

    const customer = await findReviewCustomer({
      shopId: shop.id,
      customerId: cleanId,
      customerEmail: cleanEmail,
    });

    const review = await db.imageReview.create({
      data: {
        generationId: generation.id,
        customerId: customer?.id || null,
        rating: numericRating,
        body: bodyText || null,
        isApproved: true,
      },
      include: {
        customer: true,
        generation: true,
      },
    });

    return corsJson({
      success: true,
      review: mapReview(review),
      message: "Review published.",
    });
  } catch (error) {
    console.error("api.image-interactions action error", error);
    return corsJson({ success: false, error: error.message }, { status: 500 });
  }
}

async function findReviewCustomer({ shopId, customerId, customerEmail }) {
  if (!customerId && !customerEmail) return null;

  const ids = customerIdVariants(customerId);
  const existing = await db.customerAccount.findFirst({
    where: {
      shopId,
      OR: [
        ...(ids.length ? [{ shopifyCustomerId: { in: ids } }] : []),
        ...(customerEmail ? [{ email: customerEmail }] : []),
      ],
    },
  });

  if (existing) return existing;
  if (!customerId) return null;

  const numericId = ids[1] || ids[0] || String(customerId);
  return db.customerAccount.create({
    data: {
      shopId,
      shopifyCustomerId: numericId,
      email: customerEmail || null,
      displayName: customerEmail ? customerEmail.split("@")[0] : "Customer",
    },
  });
}

function customerIdVariants(customerId) {
  if (!customerId) return [];
  const raw = String(customerId);
  const numeric = raw.match(/Customer\/([^/]+)$/)?.[1] || raw;
  return Array.from(
    new Set([raw, numeric, `gid://shopify/Customer/${numeric}`]),
  );
}

function mapReview(review) {
  const generation = review.generation || {};
  const customer = review.customer || {};
  return {
    id: review.id,
    generationId: review.generationId,
    rating: review.rating,
    body: review.body,
    isApproved: review.isApproved,
    createdAt:
      review.createdAt instanceof Date
        ? review.createdAt.toISOString()
        : review.createdAt,
    image: {
      id: generation.id,
      imageUrl: generation.imageUrl,
      prompt: generation.prompt,
      metadata: generation.metadata || "{}",
    },
    customer: {
      displayName:
        customer.displayName || customer.email?.split("@")[0] || "Customer",
      email: customer.email || null,
    },
  };
}

function clampTake(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(60, Math.floor(numeric)));
}
