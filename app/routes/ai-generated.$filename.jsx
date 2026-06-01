export async function loader({ params }) {
  const filename = params.filename || "";

  if (!/^[a-zA-Z0-9._-]+\.(png|jpg|jpeg)$/i.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(
      process.cwd(),
      "public",
      "ai-generated",
      filename,
    );
    const file = await fs.readFile(filePath);
    const contentType =
      filename.toLowerCase().endsWith(".jpg") ||
      filename.toLowerCase().endsWith(".jpeg")
        ? "image/jpeg"
        : "image/png";

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
