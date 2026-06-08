import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, parseShopSettings } from "../services/shops.server";
import { updateShopSettings } from "../services/metaobjects.server";

type OptionGroup = {
  name: string;
  promptLabel?: string;
  values: string[];
};
type EditorOption = { value: string; label: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(admin, session.shop);
  const settings = parseShopSettings(shop.settings);

  return {
    watermarkText: settings.watermarkText,
    studioProduct: settings.studioProduct,
    optionGroupsText: serializeOptionGroups(
      settings.studioProduct.optionGroups,
    ),
    editorOptionsText: serializeEditorOptions(
      settings.studioProduct.editorOptions,
    ),
    promptTemplatesText: settings.studioProduct.promptTemplates.join("\n"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(admin, session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "studio:save") {
    const currentSettings = parseShopSettings(shop.settings);
    const nextSettings = {
      ...currentSettings,
      watermarkText: String(
        form.get("watermarkText") || "orvellastudio.com",
      ).trim(),
      studioProduct: {
        ...currentSettings.studioProduct,
        title: String(
          form.get("studioTitle") || "Generate your own image",
        ).trim(),
        checkoutVariantId: String(form.get("checkoutVariantId") || "").trim(),
        promptInstructions: String(form.get("promptInstructions") || "").trim(),
        optionGroups: parseOptionGroups(String(form.get("optionGroups") || "")),
        editorOptions: parseEditorOptions(
          String(form.get("editorOptions") || ""),
        ),
        promptTemplates: String(form.get("promptTemplates") || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
    };

    await updateShopSettings(admin, JSON.stringify(nextSettings));
  }

  return null;
};

export default function Settings() {
  const {
    watermarkText,
    studioProduct,
    optionGroupsText,
    editorOptionsText,
    promptTemplatesText,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="AI Product Settings">
      <s-section heading="Custom product setup">
        <Form method="post">
          <s-stack direction="block" gap="large">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#202223",
                }}
              >
                Product title
                <input
                  name="studioTitle"
                  defaultValue={studioProduct.title}
                  placeholder="e.g. Generate your own image"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#202223",
                }}
              >
                Shopify checkout variant ID
                <input
                  name="checkoutVariantId"
                  defaultValue={studioProduct.checkoutVariantId || ""}
                  placeholder="Example: 45678901234567"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#006875",
                background: "#e5f5f8",
                padding: "10px 14px",
                borderRadius: 6,
                border: "1px solid #00687520",
                marginTop: -10,
              }}
            >
              💡 <strong>Checkout setup:</strong> Use a real hidden Shopify
              product variant ID for checkout. Generated images and customer
              configuration selections are automatically attached to cart items
              as hidden line properties.
            </div>

            <label
              style={{
                display: "grid",
                gap: 6,
                fontWeight: 600,
                fontSize: 13,
                color: "#202223",
              }}
            >
              Watermark text
              <input
                name="watermarkText"
                defaultValue={watermarkText || "orvellastudio.com"}
                placeholder="orvellastudio.com"
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: 6,
                fontWeight: 600,
                fontSize: 13,
                color: "#202223",
              }}
            >
              AI prompt instructions
              <textarea
                name="promptInstructions"
                defaultValue={studioProduct.promptInstructions}
                rows={3}
                placeholder="Give DALL-E instructions on style, watermarks, bounds..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#202223",
                }}
              >
                Customer custom options
                <textarea
                  name="optionGroups"
                  defaultValue={optionGroupsText}
                  rows={6}
                  placeholder="Format: Option Name: Val1, Val2"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                    fontSize: 13,
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#202223",
                }}
              >
                Editor options
                <textarea
                  name="editorOptions"
                  defaultValue={editorOptionsText}
                  rows={6}
                  placeholder="Format: size=landscape: Landscape, portrait: Portrait"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                    fontSize: 13,
                  }}
                />
              </label>
            </div>

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}
            >
              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#202223",
                }}
              >
                Prompt template buttons
                <textarea
                  name="promptTemplates"
                  defaultValue={promptTemplatesText}
                  rows={6}
                  placeholder="One prompt suggestion per line..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #e1e3e5",
                paddingTop: 20,
              }}
            >
              <span style={{ fontSize: 13, color: "#6d7175" }}>
                Format editor options as:{" "}
                <code>
                  orientation=landscape: Landscape, portrait: Portrait
                </code>
              </span>
              <button
                type="submit"
                name="intent"
                value="studio:save"
                className="button-primary"
                style={{ minWidth: 140, height: 40, fontSize: 14 }}
              >
                Save settings
              </button>
            </div>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

function serializeOptionGroups(groups: OptionGroup[]) {
  return groups
    .map((group) => `${group.name}: ${(group.values || []).join(", ")}`)
    .join("\n");
}

function parseOptionGroups(value: string) {
  const groups = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, valuesText = ""] = line.split(":");
      const cleanName = name.trim();
      return {
        name: cleanName,
        promptLabel: cleanName.toLowerCase(),
        values: valuesText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
    })
    .filter((group) => group.name && group.values.length);

  return groups.length
    ? groups
    : parseShopSettings("").studioProduct.optionGroups;
}

function serializeEditorOptions(options: Record<string, EditorOption[]>) {
  const labels: Record<string, string> = {
    orientation: "orientation",
    frame: "frame",
    frameColor: "frameColor",
    effect: "effect",
  };

  return Object.entries(labels)
    .map(([key, label]) => {
      const values = options[key] || [];
      return `${label}=${values.map((option) => `${option.value}: ${option.label}`).join(", ")}`;
    })
    .join("\n");
}

function parseEditorOptions(value: string) {
  const defaults = parseShopSettings("").studioProduct.editorOptions;
  const options = { ...defaults };

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [keyText, valuesText = ""] = line.split("=");
      const key = keyText.trim();
      if (!["orientation", "frame", "frameColor", "effect"].includes(key)) {
        return;
      }

      const parsedValues = valuesText
        .split(",")
        .map((item) => {
          const [rawValue, rawLabel = rawValue] = item.split(":");
          return {
            value: rawValue.trim(),
            label: rawLabel.trim(),
          };
        })
        .filter((option) => option.value && option.label);

      if (parsedValues.length) {
        options[key as keyof typeof options] = parsedValues;
      }
    });

  return options;
}
