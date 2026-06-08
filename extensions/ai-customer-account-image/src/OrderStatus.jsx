import {
  reactExtension,
  BlockStack,
  Image,
  Text,
  useTarget,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order-status.cart-line-item.render-after",
  () => <AiOrderLineImage />,
);

function AiOrderLineImage() {
  const line = useTarget();
  const imageUrl = getAiImageUrl(line);

  if (!imageUrl) {
    return null;
  }

  const options = getAiOptionsSummary(line);
  const prompt = getAttributeValue(line, ["AI Prompt", "_AI Prompt"]);

  return (
    <BlockStack spacing="tight">
      <Text size="small" emphasis="bold">
        Your custom artwork
      </Text>
      <Image
        source={toDirectImageUrl(imageUrl)}
        accessibilityDescription="Generated AI artwork"
        border="base"
        cornerRadius="base"
        aspectRatio={1}
        fit="contain"
      />
      {options ? (
        <Text size="extraSmall" appearance="subdued">
          {options}
        </Text>
      ) : null}
      {prompt ? (
        <Text size="extraSmall" appearance="subdued">
          {prompt.length > 120 ? `${prompt.slice(0, 120)}...` : prompt}
        </Text>
      ) : null}
    </BlockStack>
  );
}

function toDirectImageUrl(url) {
  if (!url) return "";
  const match = String(url).match(/\/ai-generated\/([^/?#]+\.(?:png|jpe?g|webp))/i);
  if (match) {
    return `https://shopify-ai.deploymeta.com/ai-generated/${match[1]}`;
  }
  return url;
}

function getAttributeValue(line, keys) {
  const attributes = line?.attributes || line?.customAttributes || [];
  for (const key of keys) {
    const match = attributes.find(
      (attribute) => attribute.key === key || attribute.name === key,
    );
    if (match?.value) return match.value;
  }
  return "";
}

function getAiImageUrl(line) {
  return getAttributeValue(line, [
    "_AI Image URL",
    "AI Image Preview",
    "AI Image URL",
  ]);
}

function getAiOptionsSummary(line) {
  const customOptions = getAttributeValue(line, [
    "_AI Custom Options",
    "AI Options",
  ]);
  const finalSelections = getAttributeValue(line, [
    "_AI Final Selections",
    "_AI Final Options",
  ]);

  if (finalSelections) {
    try {
      const parsed = JSON.parse(finalSelections);
      const parts = [
        parsed.orientation,
        parsed.size,
        parsed.frame && parsed.frame !== "none" ? parsed.frame : null,
        parsed.frameColor,
        parsed.effect && parsed.effect !== "none" ? parsed.effect : null,
      ].filter(Boolean);
      if (parts.length) return parts.join(" · ");
    } catch {
      // Fall through.
    }
  }

  return customOptions;
}
