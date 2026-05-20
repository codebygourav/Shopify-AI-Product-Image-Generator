import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateShop } from "../services/shops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const db = prisma as any;
  const images = await db.aiImageGeneration.findMany({
    where: {
      shopId: shop.id,
      visibility: "PUBLIC",
      moderationStatus: "APPROVED",
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { likes: true, comments: true, reviews: true } } },
  });

  return { images };
};

export default function Gallery() {
  const { images } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Public gallery">
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {images.map((image: any) => (
            <s-box key={image.id} padding="base" borderWidth="base" borderRadius="base">
              {image.imageUrl ? (
                <img src={image.imageUrl} alt={image.prompt} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
              ) : null}
              <s-stack direction="block" gap="small">
                <s-text>{image.prompt}</s-text>
                <s-text tone="neutral">
                  {image._count.likes} likes · {image._count.reviews} reviews · {image._count.comments} comments
                </s-text>
              </s-stack>
            </s-box>
          ))}
        </div>
      </s-section>
    </s-page>
  );
}
