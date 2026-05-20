import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const db = prisma as any;
  const customers = await db.customerAccount.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { generations: true, likes: true, comments: true, reviews: true } } },
  });

  return { customers };
};

export default function Dashboard() {
  const { customers } = useLoaderData<typeof loader>();

  return (
    <s-page heading="User dashboard">
      <s-section>
        <s-stack direction="block" gap="base">
          {customers.map((customer: any) => (
            <s-box key={customer.id} padding="base" borderWidth="base" borderRadius="base">
              <s-text>{customer.displayName || customer.email || customer.shopifyCustomerId || "Guest user"}</s-text>
              <s-text tone="neutral">
                {customer._count.generations} images · {customer._count.likes} likes · {customer._count.comments} comments · {customer._count.reviews} reviews
              </s-text>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
