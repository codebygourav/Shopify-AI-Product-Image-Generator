import { unauthenticated } from "../shopify.server";
import { getOrCreateCustomer, getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";
import {
  getAiImageGenerations,
  getAiImageGeneration,
  updateAiImageGeneration,
} from "../services/metaobjects.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const customerId = url.searchParams.get("customerId");
  const customerEmail = url.searchParams.get("customerEmail");
  const productId = url.searchParams.get("productId");

  if (!shopDomain) {
    return corsJson(
      { success: false, error: "shop is required" },
      { status: 400 },
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);
    const customer = await getOrCreateCustomer({
      admin,
      shopId: shop.id,
      shopifyCustomerId: customerId,
      email: customerEmail,
    });

    if (!customer) {
      return corsJson({ success: true, images: [] });
    }

    const images = await getAiImageGenerations(admin, {
      shopId: shop.id,
      customerId: customer.id,
      status: "COMPLETED",
      ...(productId ? { productId } : {}),
    });

    // Filter out rejected moderation images
    const filteredImages = images
      .filter((img) => img.moderationStatus !== "REJECTED")
      .slice(0, 40);

    return corsJson({ success: true, images: filteredImages });
  } catch (err) {
    console.error("api.customer-images loader error", err);
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();

  const body = await request.json();
  const {
    shop: shopDomain,
    generationId,
    customerId,
    customerEmail,
    intent = "select-cart",
  } = body;

  if (!shopDomain || !generationId) {
    return corsJson(
      { success: false, error: "shop and generationId are required" },
      { status: 400 },
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);
    const customer = await getOrCreateCustomer({
      admin,
      shopId: shop.id,
      shopifyCustomerId: customerId,
      email: customerEmail,
    });

    const image = await getAiImageGeneration(admin, generationId);
    if (!image) {
      return corsJson(
        { success: false, error: "Image was not found." },
        { status: 404 },
      );
    }

    const data =
      intent === "request-public"
        ? { visibility: "PUBLIC", moderationStatus: "PENDING" }
        : { selectedForCart: true };

    const updated = await updateAiImageGeneration(admin, generationId, data);

    return corsJson({ success: true, image: updated });
  } catch (err) {
    console.error("api.customer-images action error", err);
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}
