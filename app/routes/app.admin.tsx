import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const db = prisma as any;
  const images = await db.aiImageGeneration.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { customer: true },
  });

  return { images };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");

  const data =
    intent === "approve"
      ? { moderationStatus: "APPROVED" as const }
      : intent === "reject"
        ? { moderationStatus: "REJECTED" as const }
        : intent === "public"
          ? { visibility: "PUBLIC" as const }
          : { visibility: "PRIVATE" as const };

  const db = prisma as any;
  await db.aiImageGeneration.update({
    where: { id, shopId: shop.id },
    data,
  });

  return null;
};

export default function Admin() {
  const { images } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Moderation and management">
      <s-section>
        <s-stack direction="block" gap="base">
          {images.map((image: any) => (
            <s-box key={image.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text>{image.prompt}</s-text>
                <s-text tone="neutral">
                  {image.status} · {image.moderationStatus} · {image.visibility} · {image.customer?.email || "Guest"}
                </s-text>
                <Form method="post">
                  <input type="hidden" name="id" value={image.id} />
                  <s-stack direction="inline" gap="small">
                    <button type="submit" name="intent" value="approve">Approve</button>
                    <button type="submit" name="intent" value="reject">Reject</button>
                    <button type="submit" name="intent" value="public">Make public</button>
                    <button type="submit" name="intent" value="private">Make private</button>
                  </s-stack>
                </Form>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
