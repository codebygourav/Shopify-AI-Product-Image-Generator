export function generationMode() {
  return process.env.IMAGE_GENERATION_MODE === "live" ? "live" : "test";
}

export function isLiveGeneration() {
  return generationMode() === "live";
}

const DEFAULT_TEST_IMAGES = [
  "/ai-generated/ai-1780664295095-d3a26a02dc23.jpg",
  "/ai-generated/ai-1780664295096-be7eb6733559.jpg",
];

export function testImageUrl(index = 0) {
  const configuredUrls = String(process.env.TEST_IMAGE_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const urls = configuredUrls.length ? configuredUrls : DEFAULT_TEST_IMAGES;
  return urls[Math.abs(index) % urls.length];
}
