import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop, parseShopSettings } from "../services/shops.server";

type OptionGroup = {
  name: string;
  promptLabel?: string;
  values: string[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const settings = parseShopSettings(shop.settings);

  return {
    studioProduct: settings.studioProduct,
    optionGroupsText: serializeOptionGroups(settings.studioProduct.optionGroups),
    promptTemplatesText: settings.studioProduct.promptTemplates.join("\n"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "studio:save") {
    const currentSettings = parseShopSettings(shop.settings);
    const nextSettings = {
      ...currentSettings,
      studioProduct: {
        ...currentSettings.studioProduct,
        title: String(form.get("studioTitle") || "Generate your own image").trim(),
        checkoutVariantId: String(form.get("checkoutVariantId") || "").trim(),
        promptInstructions: String(form.get("promptInstructions") || "").trim(),
        optionGroups: parseOptionGroups(String(form.get("optionGroups") || "")),
        promptTemplates: String(form.get("promptTemplates") || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
    };

    await prisma.shop.update({
      where: { id: shop.id },
      data: { settings: JSON.stringify(nextSettings) },
    });
  }

  return null;
};

export default function Settings() {
  const { studioProduct, optionGroupsText, promptTemplatesText } = useLoaderData<typeof loader>();

  return (
    <s-page heading="AI Product Settings">
      <s-section heading="Custom product setup">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <Form method="post">
            <s-stack direction="block" gap="base">
              <label>
                Product title
                <input
                  name="studioTitle"
                  defaultValue={studioProduct.title}
                  style={{ display: "block", marginTop: 6, width: "100%", padding: 10 }}
                />
              </label>
              <label>
                Shopify checkout variant ID
                <input
                  name="checkoutVariantId"
                  defaultValue={studioProduct.checkoutVariantId || ""}
                  placeholder="Example: 45678901234567"
                  style={{ display: "block", marginTop: 6, width: "100%", padding: 10 }}
                />
              </label>
              <s-text tone="neutral">
                Use a real hidden Shopify product variant for checkout. Generated image and selected options are added as cart line properties.
              </s-text>
              <label>
                AI prompt instructions
                <textarea
                  name="promptInstructions"
                  defaultValue={studioProduct.promptInstructions}
                  rows={4}
                  style={{ display: "block", marginTop: 6, width: "100%", padding: 10 }}
                />
              </label>
              <label>
                Customer options
                <textarea
                  name="optionGroups"
                  defaultValue={optionGroupsText}
                  rows={8}
                  style={{ display: "block", marginTop: 6, width: "100%", padding: 10 }}
                />
              </label>
              <s-text tone="neutral">
                Format: one option group per line. Example: Size: 8 x 10 in, 12 x 16 in
              </s-text>
              <label>
                Prompt template buttons
                <textarea
                  name="promptTemplates"
                  defaultValue={promptTemplatesText}
                  rows={5}
                  style={{ display: "block", marginTop: 6, width: "100%", padding: 10 }}
                />
              </label>
              <button type="submit" name="intent" value="studio:save">Save settings</button>
            </s-stack>
          </Form>
        </s-box>
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

  return groups.length ? groups : parseShopSettings("").studioProduct.optionGroups;
}
