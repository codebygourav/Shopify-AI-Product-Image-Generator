import { unauthenticated } from "../shopify.server";
import { getOrCreateCustomer, getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";
import {
  createAiImageGeneration,
  getAiImageGenerations,
  getAiImageGeneration,
  updateAiImageGeneration,
} from "../services/metaobjects.server";
import { saveGeneratedImageToPublicUrl } from "../services/shopify-media.server";
import { adminImageUrl } from "../services/image-urls.server";

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
    const { admin, shop, customer } = await resolveShopContext({
      shopDomain,
      customerId,
      customerEmail,
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
    generation,
    customerId,
    customerEmail,
    intent = "select-cart",
  } = body;

  if (!shopDomain || (!generationId && !generation)) {
    return corsJson(
      {
        success: false,
        error: "shop and generationId or generation are required",
      },
      { status: 400 },
    );
  }

  try {
    const { admin, shop, customer } = await resolveShopContext({
      shopDomain,
      customerId,
      customerEmail,
    });

    if (!generationId && intent === "select-cart") {
      const image = await persistPreviewGeneration({
        admin,
        shopId: shop.id,
        generation,
        customerId: customer?.id || customerId,
        customerEmail,
      });

      return corsJson({ success: true, image });
    }

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

async function resolveShopContext({ shopDomain, customerId, customerEmail }) {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);
    const customer = await getOrCreateCustomer({
      admin,
      shopId: shop.id,
      shopifyCustomerId: customerId,
      email: customerEmail,
    });

    return { admin, shop, customer };
  } catch (error) {
    if (!isMissingShopifySessionError(error)) {
      throw error;
    }

    return {
      admin: null,
      shop: {
        id: shopDomain,
        shop: shopDomain,
      },
      customer: customerId
        ? {
            id: customerId,
            shopId: shopDomain,
            shopifyCustomerId: customerId,
            email: customerEmail || null,
            displayName: customerEmail
              ? customerEmail.split("@")[0]
              : "Customer",
          }
        : null,
    };
  }
}

async function persistPreviewGeneration({
  admin,
  shopId,
  generation,
  customerId,
  customerEmail,
}) {
  if (!generation || typeof generation !== "object") {
    throw new Error("Generated preview data is required.");
  }

  const pendingImage = generation.pendingImage || {};
  const publicBaseUrl =
    process.env.APP_PUBLIC_URL ||
    process.env.SHOPIFY_APP_URL ||
    process.env.HOST ||
    "https://shopify-ai.deploymeta.com";
  const imageUrl = adminImageUrl(
    pendingImage.imageUrl && !String(pendingImage.imageUrl).startsWith("data:")
      ? pendingImage.imageUrl
      : await saveGeneratedImageToPublicUrl({
          imageUrl: pendingImage.imageUrl,
          base64Data: pendingImage.base64Data,
          mimeType: pendingImage.mimeType,
          publicBaseUrl,
        }),
  );

  if (!imageUrl || String(imageUrl).startsWith("data:")) {
    throw new Error(
      "Generated image could not be saved to a public image URL.",
    );
  }

  return createAiImageGeneration(admin, {
    shopId,
    prompt: generation.prompt,
    status: "COMPLETED",
    visibility: generation.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    moderationStatus:
      generation.visibility === "PUBLIC" ? "PENDING" : "APPROVED",
    imageUrl,
    productId: generation.productId,
    productHandle: generation.productHandle,
    variantId: generation.variantId,
    variantTitle: generation.variantTitle,
    customerId,
    customerEmail,
    openAiRequestId: generation.openAiRequestId,
    selectedForCart: true,
    metadata: generation.metadata,
  });
}

function isMissingShopifySessionError(error) {
  const message = String(error?.message || error);
  return (
    message.includes("Could not find a session") ||
    message.includes("No session found") ||
    message.includes("MissingSessionTableError") ||
    message.includes("session table does not exist")
  );
}
