import {
  getShopSettings,
  updateShopSettings,
  getCustomerProfile,
  ensureMetaobjectDefinition,
} from "./metaobjects.server";

export async function getOrCreateShop(admin, shopDomain) {
  // Ensure the AI generation metaobject definition is created
  await ensureMetaobjectDefinition(admin);

  let settingsStr = await getShopSettings(admin);
  let settings;

  if (!settingsStr) {
    settings = defaultShopSettings();
    settingsStr = JSON.stringify(settings);
    try {
      await updateShopSettings(admin, settingsStr);
    } catch (settingsError) {
      console.warn("Shop settings metafield update failed", settingsError);
    }
  } else {
    settings = parseShopSettings(settingsStr);
  }

  // Map to the object structure expected by the rest of the application
  return {
    id: shopDomain,
    shop: shopDomain,
    settings: JSON.stringify(settings),
  };
}

export function defaultShopSettings() {
  return {
    defaultVisibility: "PRIVATE",
    watermarkText: "orvellastudio.com",
    moderationEnabled: true,
    studioProduct: {
      title: "Generate your own image",
      checkoutVariantId: "",
      promptInstructions:
        "Create premium print-ready wall art. Respect the selected product options exactly.",
      optionGroups: [
        {
          name: "Size",
          promptLabel: "image orientation",
          values: ["Landscape", "Portrait", "Square"],
        },
        {
          name: "Frame",
          promptLabel: "frame style",
          values: ["No frame", "Thin frame", "Gallery frame", "Classic frame"],
        },
        {
          name: "Frame color",
          promptLabel: "frame color",
          values: ["Black", "White", "Walnut", "Gold"],
        },
        {
          name: "Effect",
          promptLabel: "visual effect",
          values: ["Clean", "Vintage", "Retro", "Cinematic"],
        },
      ],
      editorOptions: {
        orientation: [
          { value: "landscape", label: "Landscape" },
          { value: "portrait", label: "Portrait" },
          { value: "square", label: "Square" },
        ],
        frame: [
          { value: "none", label: "No frame" },
          { value: "thin", label: "Thin" },
          { value: "gallery", label: "Gallery" },
          { value: "classic", label: "Classic" },
        ],
        frameColor: [
          { value: "black", label: "Black" },
          { value: "white", label: "White" },
          { value: "walnut", label: "Walnut" },
          { value: "gold", label: "Gold" },
        ],
        effect: [
          { value: "none", label: "Clean" },
          { value: "vintage", label: "Vintage" },
          { value: "retro", label: "Retro" },
          { value: "cinematic", label: "Cinematic" },
        ],
      },
      promptTemplates: [
        "minimal gallery wall, premium print art, soft natural light",
        "bold abstract print, textured brushwork, curated interior styling",
        "calm spiritual artwork, refined color palette, elegant framed print",
      ],
    },
  };
}

export function parseShopSettings(settings) {
  let parsed = {};

  try {
    parsed = settings ? JSON.parse(settings) : {};
  } catch {
    parsed = {};
  }

  const defaults = defaultShopSettings();
  return {
    ...defaults,
    ...parsed,
    studioProduct: {
      ...defaults.studioProduct,
      ...(parsed.studioProduct || {}),
      optionGroups: Array.isArray(parsed.studioProduct?.optionGroups)
        ? parsed.studioProduct.optionGroups
        : defaults.studioProduct.optionGroups,
      promptTemplates: Array.isArray(parsed.studioProduct?.promptTemplates)
        ? parsed.studioProduct.promptTemplates
        : defaults.studioProduct.promptTemplates,
      editorOptions: normalizeEditorOptions(
        parsed.studioProduct?.editorOptions,
        defaults.studioProduct.editorOptions,
      ),
    },
  };
}

function normalizeEditorOptions(options, defaults) {
  if (!options || typeof options !== "object") return defaults;

  return Object.fromEntries(
    Object.entries(defaults)
      .map(([key, fallback]) => {
        const value = options[key];
        if (!Array.isArray(value) || !value.length) return [key, fallback];
        return [
          key,
          value
            .map((option) => ({
              value: String(option?.value || "").trim(),
              label: String(option?.label || option?.value || "").trim(),
            }))
            .filter((option) => option.value && option.label),
        ];
      })
      .map(([key, value]) => [
        key,
        Array.isArray(value) && value.length ? value : defaults[key],
      ]),
  );
}

export async function getOrCreateCustomer({
  admin,
  shopId,
  shopifyCustomerId,
  email,
}) {
  const cleanId = (shopifyCustomerId && shopifyCustomerId !== "undefined" && shopifyCustomerId !== "null" && shopifyCustomerId !== "") ? shopifyCustomerId : null;
  if (!cleanId) return null;

  const numericId =
    String(cleanId).match(/Customer\/([^/]+)$/)?.[1] ||
    String(cleanId);

  const profile = (await getCustomerProfile(admin, numericId)) || {
    isApproved: true,
    generationLimit: null,
    totalGenerations: 0,
  };

  return {
    id: numericId,
    shopId,
    shopifyCustomerId: numericId,
    email: email || null,
    displayName: email ? email.split("@")[0] : "Customer",
    isApproved: profile.isApproved !== false,
    generationLimit: profile.generationLimit ?? null,
  };
}
