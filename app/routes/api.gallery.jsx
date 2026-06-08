import { unauthenticated } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";
import { getAiImageGenerations } from "../services/metaobjects.server";

export async function action({ request }) {
  if (request.method === "OPTIONS") return optionsResponse();
  return corsJson(
    { success: false, error: "Method not allowed" },
    { status: 405 },
  );
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const take = clampTake(url.searchParams.get("take"), 24);
  if (!shopDomain) {
    return corsJson(
      { success: false, error: "shop is required" },
      { status: 400 },
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);

    const images = await getAiImageGenerations(admin, {
      shopId: shop.id,
      visibility: "PUBLIC",
      moderationStatus: "APPROVED",
      status: "COMPLETED",
      take,
      ...(url.searchParams.get("creatorId")
        ? { customerId: url.searchParams.get("creatorId") }
        : {}),
    });

    return corsJson({
      success: true,
      images: images.filter((image) => image.moderationStatus !== "REJECTED" && isFinalized(image)),
    });
  } catch (err) {
    console.error("api.gallery error", err);
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}

function isFinalized(image) {
  if (!image) return false;
  if (image.selectedForCart) return true;
  try {
    const parsed = typeof image.metadata === "string" ? JSON.parse(image.metadata) : image.metadata;
    if (parsed && (parsed.draft === false || parsed.generationType === "final")) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

function clampTake(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(60, Math.floor(numeric)));
}
