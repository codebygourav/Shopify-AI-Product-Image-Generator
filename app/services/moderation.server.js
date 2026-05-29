import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function moderatePrompt(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    return { allowed: false, reason: "OPENAI_API_KEY is not configured." };
  }

  const response = await openai.moderations.create({
    model: "text-moderation-latest",
    input: prompt,
  });

  const result = response.results?.[0];
  return {
    allowed: !result?.flagged,
    reason: result?.flagged ? "Prompt failed AI safety moderation." : null,
    raw: result,
  };
}
