import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import {
  getAiImageGenerations,
  getAiImageGeneration,
  updateAiImageGeneration,
  deleteAiImageGeneration,
} from "../services/metaobjects.server";
import { adminImageUrl } from "../services/image-urls.server";

type MediaImage = {
  id: string;
  imageUrl?: string | null;
  metadata: string | null;
  prompt: string;
  status: string;
  visibility: string;
  moderationStatus: string;
  selectedForCart?: boolean;
  createdAt: string | Date;
  customer?: { email?: string | null; displayName?: string | null } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedImageId = url.searchParams.get("image");
  const shop = await getOrCreateShop(admin, session.shop);

  const [rawImages, selectedImage] = await Promise.all([
    getAiImageGenerations(admin, { shopId: shop.id }),
    selectedImageId ? getAiImageGeneration(admin, selectedImageId) : null,
  ]);
  const images = (
    rawImages.filter((image) => {
      if (image === null || !isFinalized(image)) return false;
      try {
        const parsed = typeof image.metadata === "string" ? JSON.parse(image.metadata) : image.metadata;
        if (parsed?.isPod === true || parsed?.finalSelections?.isPod === true) {
          return false;
        }
      } catch {}
      return true;
    }) as MediaImage[]
  ).map(withAdminImageUrl);

  return {
    images,
    selectedImage: selectedImage
      ? withAdminImageUrl(selectedImage as MediaImage)
      : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(admin, session.shop);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");

  if (intent === "image:delete") {
    await deleteAiImageGeneration(admin, id);
    return null;
  }

  const data =
    intent === "image:approve"
      ? { moderationStatus: "APPROVED" }
      : intent === "image:reject"
        ? { moderationStatus: "REJECTED" }
        : intent === "image:public"
          ? { visibility: "PUBLIC", moderationStatus: "APPROVED" }
          : { visibility: "PRIVATE", moderationStatus: "APPROVED" };

  await updateAiImageGeneration(admin, id, data);
  return null;
};

export default function MediaLibrary() {
  const { images, selectedImage } = useLoaderData<typeof loader>();

  if (selectedImage) {
    return (
      <s-page heading="Media Library">
        <ImageDetail image={selectedImage} />
      </s-page>
    );
  }

  return (
    <s-page heading="Media Library">
      <s-section heading="Generated AI Artworks">
        {images.length === 0 ? (
          <s-text tone="neutral">No generated images found.</s-text>
        ) : (
          <div className="aim-media-grid">
            {images.map((image) => (
              <Link
                to={`/app/gallery?image=${image.id}`}
                key={image.id}
                style={{ textDecoration: "none" }}
              >
                <div className="aim-media-card">
                  <div className="aim-media-card-img-wrapper">
                    <img
                      src={image.imageUrl || ""}
                      alt={displayPrompt(image.metadata, image.prompt)}
                    />
                    <div className="aim-media-card-overlay">
                      <span className="aim-media-card-overlay-btn">
                        Inspect
                      </span>
                    </div>
                  </div>
                  <div className="aim-media-card-info">
                    <div className="aim-media-card-prompt">
                      {displayPrompt(image.metadata, image.prompt)}
                    </div>
                    <div className="aim-media-card-meta">
                      <span>
                        {image.customer?.email?.split("@")[0] || "Guest"}
                      </span>
                      <span
                        className={`aim-badge ${
                          image.moderationStatus === "APPROVED"
                            ? "aim-badge--success"
                            : image.moderationStatus === "REJECTED"
                              ? "aim-badge--danger"
                              : "aim-badge--warning"
                        }`}
                        style={{ fontSize: 10, padding: "2px 6px" }}
                      >
                        {image.moderationStatus}
                      </span>
                    </div>
                  </div>
                  </div>
              </Link>
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

function ImageDetail({ image }: { image: MediaImage }) {
  return (
    <div>
      <Link
        to="/app/gallery"
        className="button-premium"
        style={{
          display: "inline-flex",
          marginBottom: 16,
          textDecoration: "none",
        }}
      >
        ← Back to gallery
      </Link>
      <s-section heading="Artwork inspection">
        <div className="aim-details-container">
          {image.imageUrl ? (
            <div
              style={{
                position: "sticky",
                top: 20,
                borderRadius: 22,
                overflow: "hidden",
                border: "1px solid #e8ded0",
                background: "linear-gradient(145deg, #f5eadc, #fff9ef)",
                boxShadow: "0 18px 48px rgba(35,31,26,.10)",
              }}
            >
              <img
                src={image.imageUrl}
                alt={displayPrompt(image.metadata, image.prompt)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "contain",
                  display: "block",
                  padding: 18,
                }}
              />
              <span
                className={`aim-badge ${image.visibility === "PUBLIC" ? "aim-badge--info" : "aim-badge--success"}`}
                style={{ position: "absolute", top: 14, right: 14 }}
              >
                {image.visibility}
              </span>
            </div>
          ) : null}
        <s-stack direction="block" gap="base">
          
          <s-stack direction="block" gap="small">
            <label style={{ fontWeight: 600, fontSize: 11, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Art Direction / Prompt</label>
            <div style={{ background: '#f6f6f7', padding: 12, borderRadius: 6, fontSize: 13, border: '1px solid #e1e3e5', lineHeight: 1.5, wordBreak: 'break-word', maxHeight: 120, overflowY: 'auto' }}>
              {displayPrompt(image.metadata, image.prompt)}
            </div>
          </s-stack>

          <s-stack direction="block" gap="small">
            <label style={{ fontWeight: 600, fontSize: 11, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected Customize Options</label>
            <span style={{ fontWeight: 500, fontSize: 13, display: 'block' }}>
              {selectedOptionsSummary(image.metadata) || "No custom options selected"}
            </span>
          </s-stack>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, borderTop: '1px solid #e1e3e5', paddingTop: 16 }}>
            <div>
              <span style={{ color: '#6d7175' }}>Creator:</span>
              <div style={{ fontWeight: 600, marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{image.customer?.email || "Guest"}</div>
            </div>
            <div>
              <span style={{ color: '#6d7175' }}>Moderation:</span>
              <div style={{ marginTop: 2 }}>
                <span className={`aim-badge ${
                  image.moderationStatus === 'APPROVED' ? 'aim-badge--success' :
                  image.moderationStatus === 'REJECTED' ? 'aim-badge--danger' : 'aim-badge--warning'
                }`}>
                  {image.moderationStatus}
                </span>
              </div>
            </div>
          </div>

          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={image.id} />
            <s-stack direction="block" gap="small">
              {image.visibility === "PUBLIC" ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                  <button
                    type="submit"
                    name="intent"
                    value="image:approve"
                    className="button-primary"
                    style={{ width: '100%' }}
                  >
                    Approve
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value="image:reject"
                    style={{ width: '100%' }}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                {image.visibility === 'PRIVATE' ? (
                  <button
                    type="submit"
                    name="intent"
                    value="image:public"
                    style={{ width: '100%' }}
                  >
                    Make Public
                  </button>
                ) : (
                  <button
                    type="submit"
                    name="intent"
                    value="image:private"
                    style={{ width: '100%' }}
                  >
                    Make Private
                  </button>
                )}
                <button
                  type="submit"
                  name="intent"
                  value="image:delete"
                  style={{ width: '100%' }}
                >
                  Delete
                </button>
              </div>
              <Link to="/app/gallery" style={{ textDecoration: 'none', textAlign: 'center', display: 'block', marginTop: 8, fontSize: 13, color: '#008060', fontWeight: 600 }}>
                Close Inspector
              </Link>
            </s-stack>
          </Form>
        </s-stack>
        </div>
      </s-section>
    </div>
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
    .filter(
      (option: { name?: string; value?: string }) =>
        option.name && option.value,
    )
    .map(
      (option: { name: string; value: string }) =>
        `${option.name}: ${option.value}`,
    )
    .join(", ");
}

function withAdminImageUrl(image: MediaImage): MediaImage {
  return {
    ...image,
    imageUrl: adminImageUrl(image.imageUrl),
  };
}

function isFinalized(image: MediaImage) {
  if (!image) return false;
  if (image.selectedForCart) return true;
  try {
    const parsed = typeof image.metadata === "string" ? JSON.parse(image.metadata) : image.metadata;
    if (parsed && (parsed.draft === false || parsed.generationType === "final")) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}
