import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const db = prisma as any;
  const [images, customers, comments, reviews] = await Promise.all([
    db.aiImageGeneration.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { customer: true, _count: { select: { likes: true, comments: true, reviews: true } } },
    }),
    db.customerAccount.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { generations: true } } },
    }),
    db.imageComment.findMany({
      where: { generation: { shopId: shop.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { generation: true, customer: true },
    }),
    db.imageReview.findMany({
      where: { generation: { shopId: shop.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { generation: true, customer: true },
    }),
  ]);

  return { images, customers, comments, reviews };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");
  const db = prisma as any;

  if (intent.startsWith("image:")) {
    const data =
      intent === "image:approve"
        ? { moderationStatus: "APPROVED" as const }
        : intent === "image:reject"
          ? { moderationStatus: "REJECTED" as const }
          : intent === "image:public"
            ? { visibility: "PUBLIC" as const }
            : { visibility: "PRIVATE" as const };

    const image = await db.aiImageGeneration.findFirst({ where: { id, shopId: shop.id } });
    if (image) await db.aiImageGeneration.update({ where: { id: image.id }, data });
  }

  if (intent.startsWith("customer:")) {
    const generationLimit = form.get("generationLimit");
    await db.customerAccount.update({
      where: { id },
      data: {
        isApproved: intent === "customer:approve",
        generationLimit: generationLimit === "" || generationLimit === null ? null : Number(generationLimit),
      },
    });
  }

  if (intent.startsWith("comment:")) {
    await db.imageComment.update({
      where: { id },
      data: { isApproved: intent === "comment:approve" },
    });
  }

  if (intent.startsWith("review:")) {
    await db.imageReview.update({
      where: { id },
      data: { isApproved: intent === "review:approve" },
    });
  }

  return null;
};

export default function Admin() {
  const { images, customers, comments, reviews } = useLoaderData<typeof loader>();

  return (
    <s-page heading="AI Image Manager Admin">
      <s-section heading="Generated images">
        <s-stack direction="block" gap="base">
          {images.map((image: any) => (
            <s-box key={image.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text>{image.prompt}</s-text>
                <s-text tone="neutral">
                  {image.status} · {image.moderationStatus} · {image.visibility} · {image.customer?.email || "Guest"} · {image._count.reviews} reviews
                </s-text>
                {image.imageUrl ? (
                  <img src={image.imageUrl} alt={image.prompt} style={{ width: 120, aspectRatio: "1", objectFit: "cover" }} />
                ) : null}
                <Form method="post">
                  <input type="hidden" name="id" value={image.id} />
                  <s-stack direction="inline" gap="small">
                    <button type="submit" name="intent" value="image:approve">Approve image</button>
                    <button type="submit" name="intent" value="image:reject">Reject image</button>
                    <button type="submit" name="intent" value="image:public">Make public</button>
                    <button type="submit" name="intent" value="image:private">Make private</button>
                  </s-stack>
                </Form>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Customers and limits">
        <s-stack direction="block" gap="base">
          {customers.map((customer: any) => (
            <s-box key={customer.id} padding="base" borderWidth="base" borderRadius="base">
              <Form method="post">
                <input type="hidden" name="id" value={customer.id} />
                <s-stack direction="block" gap="small">
                  <s-text>{customer.displayName || customer.email || customer.shopifyCustomerId || "Guest customer"}</s-text>
                  <s-text tone="neutral">
                    {customer.isApproved ? "Approved" : "Blocked"} · {customer._count.generations} generated images
                  </s-text>
                  <label>
                    Generation limit
                    <input
                      name="generationLimit"
                      type="number"
                      min="0"
                      defaultValue={customer.generationLimit ?? ""}
                      style={{ marginLeft: 8 }}
                    />
                  </label>
                  <s-stack direction="inline" gap="small">
                    <button type="submit" name="intent" value="customer:approve">Approve user</button>
                    <button type="submit" name="intent" value="customer:block">Block user</button>
                  </s-stack>
                </s-stack>
              </Form>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Comments">
        <ModerationList items={comments} type="comment" />
      </s-section>

      <s-section heading="Reviews">
        <ModerationList items={reviews} type="review" />
      </s-section>
    </s-page>
  );
}

function ModerationList({ items, type }: { items: any[]; type: "comment" | "review" }) {
  return (
    <s-stack direction="block" gap="base">
      {items.map((item) => (
        <s-box key={item.id} padding="base" borderWidth="base" borderRadius="base">
          <Form method="post">
            <input type="hidden" name="id" value={item.id} />
            <s-stack direction="block" gap="small">
              <s-text>{type === "review" ? `${item.rating} stars · ${item.body || ""}` : item.body}</s-text>
              <s-text tone="neutral">
                {item.isApproved ? "Approved" : "Pending"} · {item.customer?.email || "Guest"} · {item.generation?.prompt || ""}
              </s-text>
              <s-stack direction="inline" gap="small">
                <button type="submit" name="intent" value={`${type}:approve`}>Approve</button>
                <button type="submit" name="intent" value={`${type}:reject`}>Reject</button>
              </s-stack>
            </s-stack>
          </Form>
        </s-box>
      ))}
    </s-stack>
  );
}
