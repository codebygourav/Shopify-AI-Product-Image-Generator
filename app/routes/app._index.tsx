import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);

  const db = prisma as any;
  const [total, publicCount, pendingModeration, recent] = await Promise.all([
    db.aiImageGeneration.count({ where: { shopId: shop.id } }),
    db.aiImageGeneration.count({
      where: { shopId: shop.id, visibility: "PUBLIC" },
    }),
    db.aiImageGeneration.count({
      where: { shopId: shop.id, moderationStatus: "PENDING" },
    }),
    db.aiImageGeneration.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { customer: true },
    }),
  ]);

  return { shop: session.shop, total, publicCount, pendingModeration, recent };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="AI Image Manager">
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Total images</s-heading>
            <s-text>{data.total}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Public gallery</s-heading>
            <s-text>{data.publicCount}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Pending moderation</s-heading>
            <s-text>{data.pendingModeration}</s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Recent generations">
        <s-stack direction="block" gap="base">
          {data.recent.map((item: any) => (
            <s-box key={item.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text>{item.prompt}</s-text>
                <s-text tone="neutral">
                  {item.status} · {item.visibility} · {item.customer?.email || "Guest"}
                </s-text>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.prompt} style={{ width: 160, maxWidth: "100%" }} />
                ) : null}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
