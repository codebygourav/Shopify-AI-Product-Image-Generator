/* global process, Buffer */
export async function loader() {
  const { corsJson } = await import("../services/cors.server");
  return corsJson({ error: "Method not allowed" }, { status: 405 });
}

export async function action({ request }) {
  const { corsJson, optionsResponse } = await import("../services/cors.server");
  if (request.method === "OPTIONS") return optionsResponse();

  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    let buffer;
    let mimeType;
    let originalName;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const base64Data = body.file; // data URL: e.g. "data:image/png;base64,..."
      originalName = body.filename || "uploaded-image.png";

      if (!base64Data) {
        return corsJson(
          { success: false, error: "No file was uploaded." },
          { status: 400 },
        );
      }

      // Check if it's a data URL
      const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        buffer = Buffer.from(match[2], "base64");
      } else {
        // Fallback: assume raw base64 png
        mimeType = "image/png";
        buffer = Buffer.from(base64Data, "base64");
      }
    } else {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return corsJson(
          { success: false, error: "No file was uploaded." },
          { status: 400 },
        );
      }

      buffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || "image/png";
      originalName = file.name || "uploaded-image.png";
    }

    // Validate mimeType is an image
    if (!mimeType.startsWith("image/")) {
      return corsJson(
        { success: false, error: "Only image files are allowed." },
        { status: 400 },
      );
    }

    // Determine extension
    const extension = mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? "jpg"
        : "png";

    const crypto = await import("node:crypto");
    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const savedFilename = `user-upload-${Date.now()}-${token}.${extension}`;

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const uploadDir = path.join(process.cwd(), "public", "ai-generated");

    // Ensure the directory exists and save the buffer
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, savedFilename), buffer);

    const publicBaseUrl =
      process.env.APP_PUBLIC_URL ||
      process.env.SHOPIFY_APP_URL ||
      process.env.HOST ||
      "https://shopify-ai.deploymeta.com";

    const normalizedBaseUrl = publicBaseUrl.replace(/\/$/, "");
    const publicUrl = `${normalizedBaseUrl}/ai-generated/${savedFilename}`;

    return corsJson({
      success: true,
      url: publicUrl,
      filename: savedFilename,
      originalName,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    return corsJson(
      { success: false, error: error.message || "Upload failed." },
      { status: 500 },
    );
  }
}
