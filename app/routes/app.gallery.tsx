import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

type MediaImage = {
  id: string;
  imageUrl?: string | null;
  metadata: string | null;
  prompt: string;
  status: string;
  visibility: string;
  moderationStatus: string;
  createdAt: string | Date;
  customer?: { email?: string | null; displayName?: string | null } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedImageId = url.searchParams.get("image");
  const shop = await getOrCreateShop(session.shop);
  const db = prisma;

  const [images, selectedImage] = await Promise.all([
    db.aiImageGeneration.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { customer: true },
    }),
    selectedImageId
      ? db.aiImageGeneration.findFirst({
          where: { id: selectedImageId, shopId: shop.id },
          include: { customer: true },
        })
      : null,
  ]);

  return { images, selectedImage };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");
  const db = prisma;

  const image = await db.aiImageGeneration.findFirst({ where: { id, shopId: shop.id } });
  if (!image) return null;

  if (intent === "image:delete") {
    await db.aiImageGeneration.delete({ where: { id: image.id } });
    return null;
  }

  if ((intent === "image:approve" || intent === "image:reject") && image.visibility !== "PUBLIC") {
    return null;
  }

  const data =
    intent === "image:approve"
      ? { moderationStatus: "APPROVED" as const }
      : intent === "image:reject"
        ? { moderationStatus: "REJECTED" as const }
        : intent === "image:public"
          ? { visibility: "PUBLIC" as const, moderationStatus: "APPROVED" as const }
          : { visibility: "PRIVATE" as const, moderationStatus: "APPROVED" as const };

  await db.aiImageGeneration.update({ where: { id: image.id }, data });
  return null;
};

export default function MediaLibrary() {
  const { images, selectedImage } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Media Library">
      <s-section heading="Generated image media">
        {selectedImage ? <ImageDetail image={selectedImage} /> : null}
        <MediaTable images={images} />
      </s-section>
    </s-page>
  );
}

function MediaTable({ images }: { images: MediaImage[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: 10 }}>Preview</th>
            <th style={{ padding: 10 }}>Prompt</th>
            <th style={{ padding: 10 }}>Customer</th>
            <th style={{ padding: 10 }}>State</th>
            <th style={{ padding: 10 }}>Created</th>
            <th style={{ padding: 10 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {images.map((image) => (
            <tr key={image.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 10, width: 76 }}>
                {image.imageUrl ? (
                  <img src={image.imageUrl} alt={displayPrompt(image.metadata, image.prompt)} style={{ width: 56, aspectRatio: "1", objectFit: "cover", borderRadius: 6 }} />
                ) : null}
              </td>
              <td style={{ padding: 10, maxWidth: 420 }}>
                <details>
                  <summary style={{ cursor: "pointer" }}>
                    <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      <s-text>{displayPrompt(image.metadata, image.prompt)}</s-text>
                    </div>
                    <div style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      <s-text tone="neutral">{selectedOptionsSummary(image.metadata) || "No options"}</s-text>
                    </div>
                  </summary>
                  <s-text>{displayPrompt(image.metadata, image.prompt)}</s-text>
                  <s-text tone="neutral">{selectedOptionsSummary(image.metadata) || "No options"}</s-text>
                </details>
              </td>
              <td style={{ padding: 10 }}>{image.customer?.email || image.customer?.displayName || "Guest"}</td>
              <td style={{ padding: 10 }}>{image.status} · {image.visibility} · {image.moderationStatus}</td>
              <td style={{ padding: 10 }}>{new Date(image.createdAt).toLocaleDateString()}</td>
              <td style={{ padding: 10 }}>
                <Link to={`/app/gallery?image=${image.id}`}>View details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageDetail({ image }: { image: MediaImage }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "start" }}>
        {image.imageUrl ? (
          <img src={image.imageUrl} alt={displayPrompt(image.metadata, image.prompt)} style={{ width: 180, aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />
        ) : null}
        <s-stack direction="block" gap="small">
          <s-heading>{displayPrompt(image.metadata, image.prompt)}</s-heading>
          <s-text>{selectedOptionsSummary(image.metadata) || "No options saved"}</s-text>
          <s-text tone="neutral">
            {image.status} · {image.visibility} · {image.moderationStatus} · {image.customer?.email || "Guest"}
          </s-text>
          <Form method="post">
            <input type="hidden" name="id" value={image.id} />
            <s-stack direction="inline" gap="small">
              {image.visibility === "PUBLIC" ? (
                <>
                  <button type="submit" name="intent" value="image:approve" style={{ padding: "8px 10px" }}>Approve for community</button>
                  <button type="submit" name="intent" value="image:reject" style={{ padding: "8px 10px" }}>Reject community post</button>
                </>
              ) : null}
              <button type="submit" name="intent" value="image:public" style={{ padding: "8px 10px" }}>Publish to community</button>
              <button type="submit" name="intent" value="image:private" style={{ padding: "8px 10px" }}>Keep private</button>
              <button type="submit" name="intent" value="image:delete" style={{ padding: "8px 10px" }}>Delete</button>
              <s-link href="/app/gallery">Close details</s-link>
            </s-stack>
          </Form>
        </s-stack>
      </div>
    </s-box>
  );
}

function parseMetadata(metadata: string | null) {
  try {
    return metadata ? JSON.parse(metadata) : {};
  } catch {
    return {};
  }
}

function displayPrompt(metadata: string | null, fallback: string) {
  const parsed = parseMetadata(metadata);
  return parsed.originalPrompt || fallback;
}

function selectedOptionsSummary(metadata: string | null) {
  const parsed = parseMetadata(metadata);
  if (!Array.isArray(parsed.selectedOptions)) return "";

  return parsed.selectedOptions
    .filter((option: { name?: string; value?: string }) => option.name && option.value)
    .map((option: { name: string; value: string }) => `${option.name}: ${option.value}`)
    .join(", ");
}
