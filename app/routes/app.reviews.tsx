import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import { adminImageUrl } from "../services/image-urls.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(admin, session.shop);
  const shop = await db.shop.findUnique({ where: { shop: session.shop } });

  if (!shop) {
    return { reviews: [] };
  }

  const reviews = await db.imageReview.findMany({
    where: {
      generation: {
        shopId: shop.id,
      },
    },
    include: {
      customer: true,
      generation: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      body: review.body || "",
      isApproved: review.isApproved,
      createdAt: review.createdAt.toISOString(),
      customerName:
        review.customer?.displayName ||
        review.customer?.email?.split("@")[0] ||
        "Customer",
      customerEmail: review.customer?.email || "",
      imageUrl: adminImageUrl(review.generation.imageUrl),
      prompt: displayPrompt(
        review.generation.metadata,
        review.generation.prompt,
      ),
      generationId: review.generationId,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(admin, session.shop);
  const shop = await db.shop.findUnique({ where: { shop: session.shop } });
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");

  if (!shop || !id) return null;

  const review = await db.imageReview.findFirst({
    where: {
      id,
      generation: {
        shopId: shop.id,
      },
    },
  });
  if (!review) return null;

  if (intent === "review:delete") {
    await db.imageReview.delete({ where: { id } });
    return null;
  }

  if (intent === "review:approve" || intent === "review:reject") {
    await db.imageReview.update({
      where: { id },
      data: { isApproved: intent === "review:approve" },
    });
    return null;
  }

  if (intent === "review:update") {
    const rating = Math.max(1, Math.min(5, Number(form.get("rating")) || 5));
    const body = String(form.get("body") || "")
      .trim()
      .slice(0, 1200);
    await db.imageReview.update({
      where: { id },
      data: {
        rating,
        body: body || null,
      },
    });
  }

  return null;
};

export default function Reviews() {
  const { reviews } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Reviews">
      <s-section heading="Generated image reviews">
        {reviews.length === 0 ? (
          <s-text tone="neutral">No reviews submitted yet.</s-text>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {reviews.map((review) => (
              <article key={review.id} className="aim-review-card">
                {review.imageUrl ? (
                  <img
                    src={review.imageUrl}
                    alt={review.prompt}
                    style={{
                      width: 96,
                      height: 96,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid #e1e3e5",
                    }}
                  />
                ) : (
                  <div
                    style={{ width: 96, height: 96, background: "#f6f6f7" }}
                  />
                )}

                <div style={{ display: "grid", gap: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <strong>{review.customerName}</strong>
                      <div style={{ fontSize: 12, color: "#6d7175" }}>
                        {review.customerEmail || "No email"} · {review.prompt}
                      </div>
                    </div>
                    <span
                      className={`aim-badge ${
                        review.isApproved
                          ? "aim-badge--success"
                          : "aim-badge--warning"
                      }`}
                    >
                      {review.isApproved ? "APPROVED" : "PENDING"}
                    </span>
                  </div>

                  <Form method="post">
                    <input type="hidden" name="id" value={review.id} />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1fr",
                        gap: 10,
                      }}
                    >
                      <select name="rating" defaultValue={review.rating}>
                        {[5, 4, 3, 2, 1].map((rating) => (
                          <option key={rating} value={rating}>
                            {rating} stars
                          </option>
                        ))}
                      </select>
                      <textarea
                        name="body"
                        rows={2}
                        defaultValue={review.body}
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button type="submit" name="intent" value="review:update">
                        Save
                      </button>
                      <button
                        type="submit"
                        name="intent"
                        value="review:approve"
                        className="button-primary"
                      >
                        Approve
                      </button>
                      <button type="submit" name="intent" value="review:reject">
                        Hide
                      </button>
                      <button type="submit" name="intent" value="review:delete">
                        Delete
                      </button>
                    </div>
                  </Form>
                </div>
              </article>
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

function displayPrompt(metadata: string | null, fallback: string) {
  try {
    const parsed = metadata ? JSON.parse(metadata) : {};
    return parsed.originalPrompt || fallback;
  } catch {
    return fallback;
  }
}
