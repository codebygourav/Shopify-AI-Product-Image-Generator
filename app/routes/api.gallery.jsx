import { unauthenticated } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import { corsJson, optionsResponse } from "../services/cors.server";
import { getAiImageGenerations } from "../services/metaobjects.server";

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

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    await getOrCreateShop(admin, shopDomain);

    const images = await getAiImageGenerations(admin, {
      visibility: "PUBLIC",
      moderationStatus: "APPROVED",
      status: "COMPLETED",
      take: 24,
    });

    return corsJson({ success: true, images });
  } catch (err) {
    console.error("api.gallery error", err);
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}
