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

export async function generateAiImage(prompt) {
  if (!isLiveGeneration()) {
    return {
      imageUrl: testImageUrl(),
      model: "test-image",
      requestId: `test-${Date.now()}`,
      mode: generationMode(),
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const result = await openai.images.generate({
    model: MODEL,
    prompt,
    size: "1024x1024",
    n: 1,
  });

  const image = result.data?.[0];
  const imageUrl = image?.url || null;
  const base64Data = image?.b64_json || null;

  if (!imageUrl && !base64Data) {
    throw new Error("OpenAI did not return an image URL or image data.");
  }

  return {
    imageUrl,
    base64Data,
    mimeType: "image/png",
    model: MODEL,
    requestId: result._request_id,
    mode: generationMode(),
  };
}
