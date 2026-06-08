import {
  reactExtension,
  BlockStack,
  Image,
  Text,
  InlineStack,
  useCartLineTarget,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension(
  "purchase.checkout.cart-line-item.render-after",
  () => <AiCheckoutImage />,
);

function AiCheckoutImage() {
  const cartLine = useCartLineTarget();
  const imageUrl = getAiImageUrl(cartLine);
  const options = getAiOptionsSummary(cartLine);

  if (!imageUrl) {
    return null;
  }

  return (
    <BlockStack spacing="tight">
      <Text size="small" emphasis="bold">
        Your generated artwork
      </Text>
      <Image
        source={toDirectImageUrl(imageUrl)}
        accessibilityDescription="Generated AI artwork preview"
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

function getAttributeValue(cartLine, keys) {
  const attributes = cartLine?.attributes || [];
  for (const key of keys) {
    const match = attributes.find(
      (attribute) => attribute.key === key || attribute.name === key,
    );
    if (match?.value) return match.value;
  }
  return "";
}

function getAiImageUrl(cartLine) {
  return getAttributeValue(cartLine, [
    "_AI Image URL",
    "AI Image Preview",
    "AI Image URL",
  ]);
}

function getAiOptionsSummary(cartLine) {
  const customOptions = getAttributeValue(cartLine, [
    "_AI Custom Options",
    "AI Options",
  ]);
  const finalSelections = getAttributeValue(cartLine, [
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
      // Fall through to plain text options.
    }
  }

  return customOptions;
}
