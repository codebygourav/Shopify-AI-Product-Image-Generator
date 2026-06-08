import OpenAI from "openai";
import {
  generationMode,
  isLiveGeneration,
  testImageUrl,
} from "./generation-mode.server";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_IMAGE_SIZE = "1024x1024";
const IMAGE_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);
const IMAGE_QUALITIES = new Set(["low", "medium", "high", "auto"]);

export async function generateAiImage(prompt, options = {}) {
  const images = await generateAiImages(prompt, { ...options, count: 1 });
  return images[0];
}

export async function generateFastDraftImages(prompt, options = {}) {
  const count = clampImageCount(options.count || 2);
  const watermarkText = options.watermarkText || "Orvella";

  if (isLiveGeneration()) {
    return generateAiImages(prompt, {
      count,
      quality: "auto",
      size: "1024x1024",
      watermarkText,
    });
  }

  return Array.from({ length: count }, (_, index) => ({
    imageUrl: testImageUrl(index),
    model: "draft-mockup",
    requestId: `draft-${Date.now()}-${index + 1}`,
    mode: "instant-draft",
    index,
    quality: "draft",
    size: "preview",
    mimeType: "image/jpeg",
    isDraft: true,
    watermarkText,
  }));
}

export async function generateAiImages(prompt, options = {}) {
  const count = clampImageCount(options.count || 1);
  const size = IMAGE_SIZES.has(options.size)
    ? options.size
    : DEFAULT_IMAGE_SIZE;
  const quality = normalizeImageQuality(options.quality);
  const watermarkText = options.watermarkText || "Orvella";
  const outputFormat = options.outputFormat || "jpeg";
  const outputCompression = options.outputCompression || 72;

  if (!isLiveGeneration()) {
    return Array.from({ length: count }, (_, index) => ({
      imageUrl: testImageUrl(index),
      model: "test-image",
      requestId: `test-${Date.now()}-${index + 1}`,
      mode: generationMode(),
      index,
      quality,
      size,
      mimeType: outputFormat === "png" ? "image/png" : "image/jpeg",
    }));
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const result = await openai.images.generate({
    model: MODEL,
    prompt: withWatermark(prompt, watermarkText),
    size,
    quality,
    output_format: outputFormat,
    output_compression: outputCompression,
    n: count,
  });

  const images = result.data || [];

  if (
    !images.length ||
    images.every((image) => !image?.url && !image?.b64_json)
  ) {
    throw new Error("OpenAI did not return an image URL or image data.");
  }

  return images.map((image, index) => ({
    imageUrl: image?.url || null,
    base64Data: image?.b64_json || null,
    mimeType: outputFormat === "png" ? "image/png" : "image/jpeg",
    model: MODEL,
    requestId: result._request_id,
    mode: generationMode(),
    index,
    quality,
    size,
  }));
}

function clampImageCount(count) {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return 1;
  return Math.max(1, Math.min(2, Math.floor(numericCount)));
}

function normalizeImageQuality(quality) {
  const normalized = String(quality || "low")
    .trim()
    .toLowerCase();
  if (normalized === "standard") return "medium";
  return IMAGE_QUALITIES.has(normalized) ? normalized : "low";
}

function withWatermark(prompt, watermarkText) {
  return `${prompt}\n\nAdd a tasteful visible watermark text: "${watermarkText}" in a small lower-corner placement.`;
}
