export function adminImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;

  const filename = String(imageUrl).match(
    /\/ai-generated\/([^/?#]+\.(?:png|jpe?g))/i,
  )?.[1];
  if (!filename) return imageUrl;

  return `${appPublicBaseUrl()}/ai-generated/${filename}`;
}

function appPublicBaseUrl() {
  const value =
    process.env.APP_PUBLIC_URL ||
    process.env.SHOPIFY_APP_URL ||
    process.env.HOST ||
    "https://shopify-ai.deploymeta.com";
  return String(value).trim().replace(/\/$/, "");
}
