export function generationMode() {
  return process.env.IMAGE_GENERATION_MODE === "live" ? "live" : "test";
}

export function isLiveGeneration() {
  return generationMode() === "live";
}

const DEFAULT_TEST_IMAGES = [
  "/ai-generated/ai-1780375616027-825dbe7f4b9e.png",
  "/ai-generated/ai-1780377295119-733654541932.png",
  "/ai-generated/ai-1780377801685-455a9467f9fc.png",
];

export function testImageUrl(index = 0) {
  if (index === 0 && process.env.DRAFT_IMAGE_1) {
    return process.env.DRAFT_IMAGE_1;
  }
  if (index === 1 && process.env.DRAFT_IMAGE_2) {
    return process.env.DRAFT_IMAGE_2;
  }
  const configuredUrls = String(process.env.TEST_IMAGE_URLS || process.env.TEST_IMAGE_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const urls = configuredUrls.length ? configuredUrls : DEFAULT_TEST_IMAGES;
  return urls[Math.abs(index) % urls.length];
}

