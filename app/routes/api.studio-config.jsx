import { unauthenticated } from "../shopify.server";
import { getOrCreateShop, parseShopSettings } from "../services/shops.server";
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

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);
    const settings = parseShopSettings(shop.settings);

    return corsJson({
      success: true,
      studioProduct: settings.studioProduct,
    });
  } catch (err) {
    console.error("api.studio-config error", err);
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}
