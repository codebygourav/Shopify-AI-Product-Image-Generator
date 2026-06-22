import { unauthenticated } from "../shopify.server";
import {
  defaultShopSettings,
  getOrCreateCustomer,
  getOrCreateShop,
  parseShopSettings,
} from "../services/shops.server";
import { getAiImageGenerations } from "../services/metaobjects.server";
import { corsJson, optionsResponse } from "../services/cors.server";
import { isLiveGeneration } from "../services/generation-mode.server";

const FREE_GENERATION_LIMIT = 3;

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
  const customerId = cleanParam(url.searchParams.get("customerId"));
  const customerEmail = cleanParam(url.searchParams.get("customerEmail"));

  if (!shopDomain) {
    return corsJson(
      { success: false, error: "shop is required" },
      { status: 400 },
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);
    const settings = parseShopSettings(shop.settings);
    const generationUsage = await resolveGenerationUsage({
      admin,
      shop,
      customerId,
      customerEmail,
    });

    return corsJson({
      success: true,
      studioProduct: settings.studioProduct,
      generationUsage,
    });
  } catch (err) {
    if (isMissingShopifySessionError(err)) {
      return corsJson({
        success: true,
        studioProduct: defaultShopSettings().studioProduct,
        generationUsage: {
          used: 0,
          limit: FREE_GENERATION_LIMIT,
          enforce: isLiveGeneration(),
        },
      });
    }

    console.error("api.studio-config error", err);
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}

function isMissingShopifySessionError(error) {
  const message = String(error?.message || error);
  return (
    message.includes("Could not find a session") ||
    message.includes("No session found") ||
    message.includes("MissingSessionTableError") ||
    message.includes("session table does not exist") ||
    message.includes("Prisma session table does not exist")
  );
}

function cleanParam(value) {
  return value && value !== "undefined" && value !== "null" && value !== ""
    ? value
    : null;
}

async function resolveGenerationUsage({
  admin,
  shop,
  customerId,
  customerEmail,
}) {
  if (!customerId) {
    return {
      used: 0,
      limit: FREE_GENERATION_LIMIT,
      enforce: isLiveGeneration(),
    };
  }

  const customer = await getOrCreateCustomer({
    admin,
    shopId: shop.id,
    shopifyCustomerId: customerId,
    email: customerEmail,
  });
  const limit = Number.isInteger(customer?.generationLimit)
    ? customer.generationLimit
    : FREE_GENERATION_LIMIT;
  const generations = await getAiImageGenerations(admin, {
    shopId: shop.id,
    customerId: customer?.id || customerId,
    customerEmail,
  });

  return {
    used: generations.length,
    limit,
    enforce: isLiveGeneration(),
  };
}
