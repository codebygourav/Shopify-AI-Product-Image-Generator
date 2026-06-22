import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { adminImageUrl } from "../services/image-urls.server";
import db from "../db.server";

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
  await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedImageId = url.searchParams.get("image");

  // Fetch all generations from DB that are POD uploads
  const rawGenerations = await db.aiImageGeneration.findMany({
    where: {
      metadata: {
        contains: '"isPod":true'
      }
    },
    include: {
      customer: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const selectedImage = selectedImageId 
    ? await db.aiImageGeneration.findUnique({
        where: { id: selectedImageId },
        include: { customer: true }
      })
    : null;

  // Filter list with JSON parsing safety check
  const filteredGenerations = rawGenerations.filter(gen => {
    try {
      const parsed = typeof gen.metadata === "string" ? JSON.parse(gen.metadata) : gen.metadata;
      return parsed?.isPod === true || parsed?.finalSelections?.isPod === true;
    } catch {
      return false;
    }
  });

  const images = filteredGenerations.map(gen => ({
    id: gen.id,
    imageUrl: adminImageUrl(gen.imageUrl),
    prompt: gen.prompt,
    metadata: gen.metadata,
    createdAt: gen.createdAt.toISOString(),
    customer: gen.customer ? {
      email: gen.customer.email,
      displayName: gen.customer.displayName
    } : null
  }));

  return {
    images,
    selectedImage: selectedImage ? {
      id: selectedImage.id,
      imageUrl: adminImageUrl(selectedImage.imageUrl),
      prompt: selectedImage.prompt,
      metadata: selectedImage.metadata,
      createdAt: selectedImage.createdAt.toISOString(),
      customer: selectedImage.customer ? {
        email: selectedImage.customer.email,
        displayName: selectedImage.customer.displayName
      } : null
    } : null
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");

  if (intent === "image:delete") {
    await db.aiImageGeneration.delete({
      where: { id }
    });
  }

  return { success: true };
};

export default function PrintOnDemandAdmin() {
  const { images, selectedImage } = useLoaderData<typeof loader>();

  if (selectedImage) {
    return (
      <s-page heading="Print on Demand">
        <ImageDetail image={selectedImage as MediaImage} />
      </s-page>
    );
  }

  return (
    <s-page heading="Print on Demand">
      <s-section heading="Customer Uploaded Prints">
        {images.length === 0 ? (
          <s-text tone="neutral">No customer uploaded images found.</s-text>
        ) : (
          <div className="aim-media-grid">
            {images.map((image) => {
              const options = parsePodOptions(image.metadata);
              return (
                <Link
                  to={`/app/print-on-demand?image=${image.id}`}
                  key={image.id}
                  style={{ textDecoration: "none" }}
                >
                  <div className="aim-media-card">
                    <div className="aim-media-card-img-wrapper">
                      <img
                        src={image.imageUrl || ""}
                        alt={displayFilename(image.prompt)}
                      />
                      <div className="aim-media-card-overlay">
                        <span className="aim-media-card-overlay-btn">
                          Inspect
                        </span>
                      </div>
                    </div>
                    <div className="aim-media-card-info">
                      <div className="aim-media-card-prompt" style={{ fontWeight: 600 }}>
                        {displayFilename(image.prompt)}
                      </div>
                      <div className="aim-media-card-meta" style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#6d7175' }}>
                          Size: <span style={{ fontWeight: 600, color: '#202223' }}>{options.size}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6d7175' }}>
                          Frame: <span style={{ fontWeight: 600, color: '#202223' }}>{options.frame}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6d7175' }}>
                          Paper: <span style={{ fontWeight: 600, color: '#202223' }}>{options.paper}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6d7175', borderTop: '1px solid #f1f1f1', paddingTop: 4, marginTop: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          Customer: <span style={{ fontWeight: 600, color: '#202223' }}>{image.customer?.email || "Guest"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

function ImageDetail({ image }: { image: MediaImage }) {
  const options = parsePodOptions(image.metadata);
  const formattedDate = new Date(image.createdAt).toLocaleString();

  return (
    <div>
      <Link
        to="/app/print-on-demand"
        className="button-premium"
        style={{
          display: "inline-flex",
          marginBottom: 16,
          textDecoration: "none",
        }}
      >
        ← Back to Print on Demand
      </Link>
      <s-section heading="Custom print inspection">
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
                alt={displayFilename(image.prompt)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "contain",
                  display: "block",
                  padding: 18,
                }}
              />
            </div>
          ) : null}
          <s-stack direction="block" gap="base">
            
            <s-stack direction="block" gap="small">
              <label style={{ fontWeight: 600, fontSize: 11, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Original Filename / Description</label>
              <div style={{ background: '#f6f6f7', padding: 12, borderRadius: 6, fontSize: 13, border: '1px solid #e1e3e5', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {displayFilename(image.prompt)}
              </div>
            </s-stack>

            <s-stack direction="block" gap="small">
              <label style={{ fontWeight: 600, fontSize: 11, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customizer Selections</label>
              <div style={{ display: 'grid', gap: 8, background: '#f6f6f7', padding: 16, borderRadius: 6, border: '1px solid #e1e3e5', fontSize: 13 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                  <span style={{ color: '#6d7175' }}>Print Size:</span>
                  <strong style={{ color: '#202223' }}>{options.size}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                  <span style={{ color: '#6d7175' }}>Frame Style:</span>
                  <strong style={{ color: '#202223' }}>{options.frame}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                  <span style={{ color: '#6d7175' }}>Print Medium:</span>
                  <strong style={{ color: '#202223' }}>{options.paper}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                  <span style={{ color: '#6d7175' }}>Upload Date:</span>
                  <strong style={{ color: '#202223' }}>{formattedDate}</strong>
                </div>
              </div>
            </s-stack>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, fontSize: 13, borderTop: '1px solid #e1e3e5', paddingTop: 16 }}>
              <div>
                <span style={{ color: '#6d7175' }}>Uploader Customer Account:</span>
                <div style={{ fontWeight: 600, marginTop: 4, fontSize: 14 }}>{image.customer?.email || "Guest Checkout"}</div>
              </div>
            </div>

            <Form method="post" style={{ marginTop: 20 }}>
              <input type="hidden" name="id" value={image.id} />
              <s-stack direction="block" gap="small">
                <button
                  type="submit"
                  name="intent"
                  value="image:delete"
                  className="button-premium"
                  style={{ width: '100%', background: '#a13a2e', color: '#fff', border: '1px solid #a13a2e' }}
                >
                  Delete Record
                </button>
                <Link to="/app/print-on-demand" style={{ textDecoration: 'none', textAlign: 'center', display: 'block', marginTop: 12, fontSize: 13, color: '#008060', fontWeight: 600 }}>
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

function displayFilename(prompt: string) {
  const prefix = "Uploaded print-on-demand artwork: ";
  if (prompt.startsWith(prefix)) {
    return prompt.slice(prefix.length);
  }
  const cartPrefix = "Custom print-on-demand artwork upload: ";
  if (prompt.startsWith(cartPrefix)) {
    return prompt.slice(cartPrefix.length);
  }
  return prompt;
}

function parsePodOptions(metadata: string | null) {
  const parsed = parseMetadata(metadata);
  const finalSelections = parsed.finalSelections || {};
  return {
    size: finalSelections.size || "Default Size",
    frame: finalSelections.frameColor ? String(finalSelections.frameColor).toUpperCase() : "Default Frame",
    paper: finalSelections.paper || "Default Paper",
    effect: finalSelections.effect || "none"
  };
}
