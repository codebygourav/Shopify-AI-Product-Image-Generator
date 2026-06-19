export async function loader() {
  const { optionsResponse } = await import("../services/cors.server");
  return optionsResponse();
}

export async function action({ request }) {
  const { authenticate, unauthenticated } = await import("../shopify.server");
  const { generateFastDraftImages } = await import("../services/openai-images.server");
  const { moderatePrompt } = await import("../services/moderation.server");
  const { defaultShopSettings, getOrCreateCustomer, getOrCreateShop, parseShopSettings } = await import("../services/shops.server");
  const { corsJson, optionsResponse } = await import("../services/cors.server");
  const { isLiveGeneration } = await import("../services/generation-mode.server");
  const { getAiImageGenerations } = await import("../services/metaobjects.server");
  const { saveGeneratedImageToPublicUrl, clonePoolImageToUniqueFile } = await import("../services/shopify-media.server");
  const db = (await import("../db.server")).default;

  if (request.method === "OPTIONS") return optionsResponse();

  try {
    const body = await request.json();
    const {
      prompt,
      productId,
      productHandle,
      variantId,
      variantTitle,
      selectedOptions,
      originalPrompt,
      customerId,
      customerEmail,
      visibility = "PRIVATE",
      draftCount: requestDraftCount,
      draftQuality = "low",
      draftSize = "1024x1024",
      generationType = "draft",
      apiBase,
      shop: shopFromBody,
    } = body;

    const draftCount = requestDraftCount !== undefined
      ? Number(requestDraftCount)
      : (process.env.DRAFT_COUNT ? Number(process.env.DRAFT_COUNT) : 1);


    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return corsJson({ success: false, error: "Prompt is required." });
    }
    if (prompt.length > 4000 || /data:image\/|;base64,/i.test(prompt)) {
      return corsJson({
        success: false,
        error: "Prompt is too large. Please enter text only.",
      });
    }

    const cleanId = (customerId && customerId !== "undefined" && customerId !== "null" && customerId !== "") ? customerId : null;
    const cleanEmail = (customerEmail && customerEmail !== "undefined" && customerEmail !== "null" && customerEmail !== "") ? customerEmail : null;

    let shopDomain = shopFromBody;
    let adminClient;

    try {
      const auth = await authenticate.admin(request);
      shopDomain = auth.session.shop;
      adminClient = auth.admin;
    } catch {
      if (shopFromBody) {
        try {
          const auth = await unauthenticated.admin(shopFromBody);
          shopDomain = shopFromBody;
          adminClient = auth.admin;
        } catch (error) {
          if (!isMissingShopifySessionError(error)) {
            throw error;
          }
          shopDomain = shopFromBody;
          adminClient = null;
        }
      }
    }

    if (!shopDomain) {
      return corsJson({
        success: false,
        error: "Shop domain is required.",
      });
    }

    const shop = adminClient
      ? await getOrCreateShop(adminClient, shopDomain)
      : {
        id: shopDomain,
        shop: shopDomain,
        settings: JSON.stringify(defaultShopSettings()),
      };
    const settings = parseShopSettings(shop.settings);
    const customer = adminClient
      ? await getOrCreateCustomer({
        admin: adminClient,
        shopId: shop.id,
        shopifyCustomerId: cleanId,
        email: cleanEmail,
      })
      : cleanId
        ? {
          id: cleanId,
          shopId: shop.id,
          shopifyCustomerId: cleanId,
          email: cleanEmail || null,
          displayName: cleanEmail
            ? cleanEmail.split("@")[0]
            : "Customer",
          isApproved: true,
          generationLimit: null,
        }
        : null;

    if (customer?.isApproved === false) {
      return corsJson({
        success: false,
        error: "Your account is waiting for approval.",
      });
    }

    const customerLimit = customer?.generationLimit;
    if (customer && Number.isInteger(customerLimit)) {
      const gens = await getAiImageGenerations(adminClient, {
        shopId: shop.id,
        customerId: customer.id,
      });
      const used = gens.length;
      if (used >= customerLimit) {
        return corsJson({
          success: false,
          error: "Your image generation limit has been reached.",
        });
      }
    }

    const optionSummary = Array.isArray(selectedOptions)
      ? selectedOptions
        .filter((option) => option?.name && option?.value)
        .map((option) => `${option.name}: ${option.value}`)
        .join(", ")
      : "";
    const studioPrompt = [
      prompt.trim(),
      settings.studioProduct?.promptInstructions,
      optionSummary ? `Selected customization options: ${optionSummary}.` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (isLiveGeneration()) {
      const moderation = await moderatePrompt(studioPrompt);
      if (!moderation.allowed) {
        return corsJson({
          success: false,
          error: moderation.reason,
        });
      }
    }

    const watermarkText = settings.watermarkText || "orvellastudio.com";
    const draftImages = await generateFastDraftImages(studioPrompt, {
      count: draftCount,
      watermarkText,
    });

    const publicBaseUrl =
      process.env.APP_PUBLIC_URL ||
      process.env.SHOPIFY_APP_URL ||
      process.env.HOST ||
      "https://shopify-ai.deploymeta.com";
    const draftVariants = await Promise.all(
      draftImages.map(async (image, index) => {
        try {
          const previewImage =
            image.mode === "instant-draft"
              ? await clonePoolImageToUniqueFile(image.imageUrl)
              : image.mode === "test"
                ? await clonePoolImageToUniqueFile(image.imageUrl)
                : await saveGeneratedImageToPublicUrl({
                  imageUrl: image.imageUrl,
                  base64Data: image.base64Data,
                  mimeType: image.mimeType,
                  publicBaseUrl,
                });

          if (!previewImage || previewImage.startsWith("data:")) {
            throw new Error(
              "Generated image could not be converted to a preview image URL.",
            );
          }

          const storefrontPreviewImage = storefrontImageUrl(
            previewImage,
            apiBase,
          );
          const metadata = {
            productHandle,
            variantId,
            variantTitle,
            selectedOptions,
            originalPrompt: originalPrompt || prompt.trim(),
            generationMode: image.mode,
            generationType,
            draft: true,
            draftIndex: index + 1,
            draftQuality: image.quality || draftQuality,
            draftSize: image.size || draftSize,
            watermarkText,
            finalSelections: {
              orientation: "square",
              frame: "none",
              frameColor: "black",
              effect: "none",
            },
          };

          const variantData = {
            prompt: studioPrompt,
            status: "COMPLETED",
            visibility: "PRIVATE",
            moderationStatus: "APPROVED",
            productId,
            productHandle,
            variantId,
            variantTitle,
            customerId: customer?.shopifyCustomerId || cleanId || null,
            customerEmail: cleanEmail,
            imageUrl: storefrontPreviewImage,
            openAiRequestId: image.requestId,
            watermarkText,
            metadata: JSON.stringify(metadata),
            pendingImage: {
              imageUrl: storefrontPreviewImage,
              mimeType: image.mimeType,
            },
          };

          let savedRecord = null;
          try {
            savedRecord = await saveDraftGenerationRecord({
              shopDomain,
              shopId: shop.id,
              customerId: customer?.shopifyCustomerId || cleanId,
              customerEmail: cleanEmail,
              variantData,
            });
          } catch (saveError) {
            console.error("Draft save failed", saveError);
          }

          if (savedRecord) {
            return { ...variantData, id: savedRecord.id, customer: savedRecord.customer };
          }

          return variantData;
        } catch (draftError) {
          console.error("Draft variant processing error", {
            imageMode: image.mode,
            imageUrl: image.imageUrl,
            error: draftError.message,
            stack: draftError.stack,
          });
          throw draftError;
        }
      }),
    );

    const pendingGeneration = draftVariants[0];

    console.log("OpenAI Usage Log (Local Node Server logs):", {
      model: draftImages[0]?.model,
      imageCount: draftVariants.length,
      requestId: draftImages[0]?.requestId,
      status: "COMPLETED",
    });

    return corsJson({
      success: true,
      generation: pendingGeneration,
      variants: draftVariants,
      image: pendingGeneration.imageUrl,
      mode: draftImages[0]?.mode,
    });
  } catch (error) {
    console.error("Image generation failed", error);
    try {
      const fs = await import("fs");
      fs.writeFileSync(
        "./error_debug.log",
        `${new Date().toISOString()}\nError: ${error.message}\nStack: ${error.stack}\n`,
      );
    } catch (e) {
      console.error("Failed to write debug log", e);
    }
    return corsJson({
      success: false,
      error: error.message,
    });
  }
  function isMissingShopifySessionError(error) {
    return String(error?.message || error).includes("Could not find a session");
  }

  function storefrontImageUrl(imageUrl, apiBase) {
    const filename = String(imageUrl || "").match(
      /\/ai-generated\/([^/?#]+\.(?:png|jpe?g|webp))/i,
    )?.[1];
    if (!filename) return imageUrl;

    const base = String(apiBase || "/apps/ai-image")
      .trim()
      .replace(/\/$/, "");
    if (!base || /^https?:\/\/localhost(?::|\/|$)/i.test(base)) {
      return `/apps/ai-image/ai-generated/${filename}`;
    }

    if (/^https?:\/\//i.test(base)) {
      const url = new URL(base);
      const pathname = url.pathname.replace(/\/api\/?$/i, "");
      return `${url.origin}${pathname}/ai-generated/${filename}`;
    }

    return `${base}/ai-generated/${filename}`;
  }

  async function saveDraftGenerationRecord({
    shopDomain,
    shopId,
    customerId,
    customerEmail,
    variantData,
  }) {
    let shop = await db.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      shop = await db.shop.create({
        data: { shop: shopDomain, settings: "{}" },
      });
    }

    const numericId = customerId
      ? String(customerId).match(/Customer\/([^/]+)$/)?.[1] || String(customerId)
      : null;

    let dbCustomer = null;
    if (numericId || customerEmail) {
      dbCustomer = await db.customerAccount.findFirst({
        where: {
          shopId: shop.id,
          OR: [
            ...(numericId ? [{ shopifyCustomerId: numericId }] : []),
            ...(customerEmail ? [{ email: customerEmail }] : []),
          ],
        },
      });

      if (!dbCustomer && numericId) {
        dbCustomer = await db.customerAccount.create({
          data: {
            shopId: shop.id,
            shopifyCustomerId: numericId,
            email: customerEmail || null,
            displayName: customerEmail ? customerEmail.split("@")[0] : "Customer",
          },
        });
      }
    }

    const generation = await db.aiImageGeneration.create({
      data: {
        shopId: shop.id,
        customerId: dbCustomer?.id || null,
        productId: variantData.productId || null,
        productHandle: variantData.productHandle || null,
        variantId: variantData.variantId || null,
        variantTitle: variantData.variantTitle || null,
        prompt: variantData.prompt || "",
        imageUrl: variantData.imageUrl || null,
        status: "COMPLETED",
        visibility: "PRIVATE",
        moderationStatus: "APPROVED",
        watermarkText: variantData.watermarkText || "orvellastudio.com",
        openAiRequestId: variantData.openAiRequestId || null,
        metadata: variantData.metadata || "{}",
        selectedForCart: false,
      },
      include: { customer: true },
    });

    return {
      id: generation.id,
      customer: generation.customer
        ? {
          id: generation.customer.id,
          shopifyCustomerId: generation.customer.shopifyCustomerId,
          email: generation.customer.email,
          displayName: generation.customer.displayName,
        }
        : null,
    };
  }
}
