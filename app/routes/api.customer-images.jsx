export async function loader({ request }) {
  const { corsJson } = await import("../services/cors.server");
  const { getAiImageGenerations } = await import("../services/metaobjects.server");
  const db = (await import("../db.server")).default;

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const customerId = url.searchParams.get("customerId");
  const customerEmail = url.searchParams.get("customerEmail");
  const productId = url.searchParams.get("productId");
  const take = clampTake(url.searchParams.get("take"), 40);

  if (!shopDomain) {
    return corsJson(
      { success: false, error: "shop is required" },
      { status: 400 },
    );
  }

  const cleanId = (customerId && customerId !== "undefined" && customerId !== "null" && customerId !== "") ? customerId : null;
  const cleanEmail = (customerEmail && customerEmail !== "undefined" && customerEmail !== "null" && customerEmail !== "") ? customerEmail : null;

  try {
    const { admin, shop, customer } = await resolveShopContext({
      shopDomain,
      customerId: cleanId,
      customerEmail: cleanEmail,
    });

    if (!customer) {
      return corsJson({ success: true, images: [] });
    }

    const dbShop = await db.shop.findUnique({ where: { shop: shopDomain } });
    if (dbShop) {
      await ensureProfileCustomerRecord({
        shopId: dbShop.id,
        customerId: customer.shopifyCustomerId || cleanId,
        customerEmail: customer.email || cleanEmail,
      });
    }

    const images = await getAiImageGenerations(admin, {
      shopId: shop.id,
      customerId: customer.shopifyCustomerId || cleanId || customer.id,
      customerEmail: customer.email || cleanEmail || null,
      take,
      ...(productId ? { productId } : {}),
    });

    // Profile gallery: show all user images except rejected (no approval required), and only finalized ones
    const filteredImages = images
      .filter((img) => img.moderationStatus !== "REJECTED" && isFinalized(img))
      .slice(0, take);

    return corsJson({ success: true, images: filteredImages });
  } catch (err) {
    console.error("api.customer-images loader error", err);
    try {
      const fs = await import("fs");
      fs.writeFileSync(
        "./error_debug.log",
        `${new Date().toISOString()}\nLoader Error: ${err.message}\nStack: ${err.stack}\n`,
      );
    } catch (e) {}
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}

export async function action({ request }) {
  const { corsJson, optionsResponse } = await import("../services/cors.server");
  const { getAiImageGeneration, createAiImageGeneration, updateAiImageGeneration } = await import("../services/metaobjects.server");

  if (request.method === "OPTIONS") return optionsResponse();

  const body = await request.json();
  const {
    shop: shopDomain,
    generationId,
    generation,
    finalSelections,
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

  const cleanId = (customerId && customerId !== "undefined" && customerId !== "null" && customerId !== "") ? customerId : null;
  const cleanEmail = (customerEmail && customerEmail !== "undefined" && customerEmail !== "null" && customerEmail !== "") ? customerEmail : null;

  try {
    const { admin, shop, customer } = await resolveShopContext({
      shopDomain,
      customerId: cleanId,
      customerEmail: cleanEmail,
    });

    if (!generationId && intent === "select-cart") {
      const image = await persistPreviewGeneration({
        admin,
        shopId: shop.id,
        generation,
        finalSelections,
        customerId: customer?.id || cleanId,
        customerEmail: cleanEmail,
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

    // If the image belongs to a different customer, clone it for the current customer instead of updating the original public image
    if (image.customerId !== (customer?.id || null)) {
      const cloned = await createAiImageGeneration(admin, {
        shopId: shop.id,
        prompt: image.prompt,
        status: "COMPLETED",
        visibility: "PRIVATE", // customized checkout copy is private by default
        moderationStatus: "APPROVED",
        imageUrl: image.imageUrl,
        productId: image.productId || null,
        productHandle: image.productHandle || null,
        variantId: image.variantId || null,
        variantTitle: image.variantTitle || null,
        customerId: customer?.id || cleanId,
        customerEmail: cleanEmail,
        openAiRequestId: image.openAiRequestId || null,
        selectedForCart: true,
        watermarkText: image.watermarkText || "orvellastudio.com",
        metadata: mergeFinalMetadata(image.metadata, finalSelections),
      });

      return corsJson({ success: true, image: cloned });
    }

    const data =
      intent === "request-public"
        ? { visibility: "PUBLIC", moderationStatus: "PENDING" }
        : await buildFinalizeUpdate({
            admin,
            shopId: shop.id,
            image,
            finalSelections,
          });

    const updated = await updateAiImageGeneration(admin, generationId, data);

    return corsJson({ success: true, image: updated });
  } catch (err) {
    console.error("api.customer-images action error", err);
    try {
      const fs = await import("fs");
      fs.writeFileSync(
        "./error_debug.log",
        `${new Date().toISOString()}\nAction Error: ${err.message}\nStack: ${err.stack}\n`,
      );
    } catch (e) {}
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}

async function resolveShopContext({ shopDomain, customerId, customerEmail }) {
  const { unauthenticated } = await import("../shopify.server");
  const { getOrCreateShop, getOrCreateCustomer } = await import("../services/shops.server");

  const cleanId = (customerId && customerId !== "undefined" && customerId !== "null" && customerId !== "") ? customerId : null;
  const cleanEmail = (customerEmail && customerEmail !== "undefined" && customerEmail !== "null" && customerEmail !== "") ? customerEmail : null;

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const shop = await getOrCreateShop(admin, shopDomain);
    const customer = await getOrCreateCustomer({
      admin,
      shopId: shop.id,
      shopifyCustomerId: cleanId,
      email: cleanEmail,
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
      customer: cleanId
        ? {
            id: cleanId,
            shopId: shopDomain,
            shopifyCustomerId: cleanId,
            email: cleanEmail || null,
            displayName: cleanEmail
              ? cleanEmail.split("@")[0]
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
  finalSelections,
  customerId,
  customerEmail,
}) {
  const { getOrCreateShop, defaultShopSettings, parseShopSettings } = await import("../services/shops.server");
  const { generateAiImages } = await import("../services/openai-images.server");
  const { clonePoolImageToUniqueFile, saveGeneratedImageToPublicUrl } = await import("../services/shopify-media.server");
  const { updateAiImageGeneration, createAiImageGeneration } = await import("../services/metaobjects.server");

  if (!generation || typeof generation !== "object") {
    throw new Error("Generated preview data is required.");
  }

  const pendingImage = generation.pendingImage || {};
  const publicBaseUrl =
    process.env.APP_PUBLIC_URL ||
    process.env.SHOPIFY_APP_URL ||
    process.env.HOST ||
    "https://shopify-ai.deploymeta.com";

  let imageUrl = storefrontImageUrl(
    pendingImage.imageUrl && !String(pendingImage.imageUrl).startsWith("data:")
      ? pendingImage.imageUrl
      : generation.imageUrl,
  );

  const metadata = mergeFinalMetadata(generation.metadata, finalSelections);

  if (process.env.FINALIZE_WITH_AI === "true") {
    try {
      const shopRecord = admin
        ? await getOrCreateShop(admin, shopId)
        : { settings: JSON.stringify(defaultShopSettings()) };
      const settings = parseShopSettings(shopRecord?.settings);
      const publicBaseUrl =
        process.env.APP_PUBLIC_URL ||
        process.env.SHOPIFY_APP_URL ||
        process.env.HOST ||
        "https://shopify-ai.deploymeta.com";
      const finalImages = await generateAiImages(generation.prompt || "", {
        count: 1,
        quality: settings.finalImageQuality || "high",
        size: sizeToOpenAi(
          finalSelections?.size,
          finalSelections?.orientation,
        ),
        outputFormat: "jpeg",
        outputCompression: 85,
        watermarkText: settings.watermarkText || generation.watermarkText,
      });
      const finalImage = finalImages[0];
      if (finalImage) {
        const savedUrl =
          finalImage.mode === "test" || finalImage.mode === "instant-draft"
            ? await clonePoolImageToUniqueFile(finalImage.imageUrl)
            : await saveGeneratedImageToPublicUrl({
                imageUrl: finalImage.imageUrl,
                base64Data: finalImage.base64Data,
                mimeType: finalImage.mimeType,
                publicBaseUrl,
              });
        if (savedUrl && !String(savedUrl).startsWith("data:")) {
          imageUrl = storefrontImageUrl(savedUrl);
        }
      }
    } catch (finalError) {
      console.warn("Final AI generation failed, using draft image", finalError);
    }
  }

  if (!imageUrl || String(imageUrl).startsWith("data:")) {
    throw new Error(
      "Generated image could not be saved to a public image URL.",
    );
  }

  if (generation.id) {
    return updateAiImageGeneration(admin, generation.id, {
      imageUrl,
      status: "COMPLETED",
      visibility: generation.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
      moderationStatus:
        generation.visibility === "PUBLIC" ? "PENDING" : "APPROVED",
      selectedForCart: true,
      metadata,
    });
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
    watermarkText: generation.watermarkText || "orvellastudio.com",
    metadata,
  });
}

function mergeFinalMetadata(metadata, finalSelections) {
  let parsed = {};
  try {
    parsed = metadata ? JSON.parse(metadata) : {};
  } catch {
    parsed = {};
  }

  return JSON.stringify({
    ...parsed,
    draft: false,
    generationType: "final",
    finalSelections: {
      ...(parsed.finalSelections || {}),
      ...(finalSelections || {}),
    },
  });
}

function storefrontImageUrl(imageUrl) {
  const filename = String(imageUrl || "").match(
    /\/ai-generated\/([^/?#]+\.(?:png|jpe?g|webp))/i,
  )?.[1];
  if (!filename) return imageUrl;
  return `/apps/ai-image/ai-generated/${filename}`;
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

function clampTake(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(60, Math.floor(numeric)));
}

async function buildFinalizeUpdate({ admin, shopId, image, finalSelections }) {
  const { getOrCreateShop, defaultShopSettings, parseShopSettings } = await import("../services/shops.server");
  const { generateAiImages } = await import("../services/openai-images.server");
  const { clonePoolImageToUniqueFile, saveGeneratedImageToPublicUrl } = await import("../services/shopify-media.server");

  const metadata = mergeFinalMetadata(image.metadata, finalSelections);
  let imageUrl = storefrontImageUrl(image.imageUrl);

  if (process.env.FINALIZE_WITH_AI === "true") {
    const publicBaseUrl =
      process.env.APP_PUBLIC_URL ||
      process.env.SHOPIFY_APP_URL ||
      process.env.HOST ||
      "https://shopify-ai.deploymeta.com";
    try {
      const shopRecord = admin
        ? await getOrCreateShop(admin, shopId)
        : { settings: JSON.stringify(defaultShopSettings()) };
      const settings = parseShopSettings(shopRecord?.settings);
      const finalImages = await generateAiImages(image.prompt || "", {
        count: 1,
        quality: settings.finalImageQuality || "high",
        size: sizeToOpenAi(finalSelections?.size, finalSelections?.orientation),
        outputFormat: "jpeg",
        outputCompression: 85,
        watermarkText: settings.watermarkText || image.watermarkText,
      });
      const finalImage = finalImages[0];
      if (finalImage) {
        const savedUrl =
          finalImage.mode === "test" || finalImage.mode === "instant-draft"
            ? await clonePoolImageToUniqueFile(finalImage.imageUrl)
            : await saveGeneratedImageToPublicUrl({
                imageUrl: finalImage.imageUrl,
                base64Data: finalImage.base64Data,
                mimeType: finalImage.mimeType,
                publicBaseUrl,
              });
        if (savedUrl && !String(savedUrl).startsWith("data:")) {
          imageUrl = storefrontImageUrl(savedUrl);
        }
      }
    } catch (finalError) {
      console.warn("Final AI generation failed, keeping draft image", finalError);
    }
  }

  return {
    imageUrl,
    selectedForCart: true,
    metadata,
  };
}

function sizeToOpenAi(size, orientation) {
  const orient = orientation || orientationForPrintSize(size) || "square";
  if (orient === "portrait") return "1024x1536";
  if (orient === "landscape") return "1536x1024";
  return "1024x1024";
}

function orientationForPrintSize(size) {
  const parts = String(size || "")
    .split("x")
    .map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (parts[0] === parts[1]) return "square";
  return parts[0] > parts[1] ? "landscape" : "portrait";
}

async function ensureProfileCustomerRecord({
  shopId,
  customerId,
  customerEmail,
}) {
  const db = (await import("../db.server")).default;
  const numericId = customerId
    ? String(customerId).match(/Customer\/([^/]+)$/)?.[1] || String(customerId)
    : null;
  if (!numericId && !customerEmail) return null;

  const existing = await db.customerAccount.findFirst({
    where: {
      shopId,
      OR: [
        ...(numericId ? [{ shopifyCustomerId: numericId }] : []),
        ...(customerEmail ? [{ email: customerEmail }] : []),
      ],
    },
  });
  if (existing) return existing;

  if (!numericId) return null;

  return db.customerAccount.create({
    data: {
      shopId,
      shopifyCustomerId: numericId,
      email: customerEmail || null,
      displayName: customerEmail ? customerEmail.split("@")[0] : "Customer",
    },
  });
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
