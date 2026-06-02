import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import { getAiImageGenerations } from "../services/metaobjects.server";
import { adminImageUrl } from "../services/image-urls.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(admin, session.shop);

  const allGenerations = (
    await getAiImageGenerations(admin, {
      shopId: shop.id,
    })
  ).filter((gen) => gen !== null);

  const total = allGenerations.length;
  const publicCount = allGenerations.filter(
    (gen) => gen.visibility === "PUBLIC",
  ).length;
  const pendingModeration = allGenerations.filter(
    (gen) => gen.moderationStatus === "PENDING",
  ).length;
  const recent = allGenerations.slice(0, 6).map((item) => ({
    ...item,
    imageUrl: adminImageUrl(item.imageUrl),
  }));

  return { shop: session.shop, total, publicCount, pendingModeration, recent };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Overview">
      <s-section heading="Recent activity">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 10 }}>Preview</th>
                <th style={{ padding: 10 }}>Prompt</th>
                <th style={{ padding: 10 }}>Customer</th>
                <th style={{ padding: 10 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 10, width: 76 }}>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.prompt}
                        style={{
                          width: 56,
                          aspectRatio: "1",
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                    ) : null}
                  </td>
                  <td style={{ padding: 10, maxWidth: 520 }}>
                    <div
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      <s-text>{item.prompt}</s-text>
                    </div>
                  </td>
                  <td style={{ padding: 10 }}>
                    {item.customer?.email || "Guest"}
                  </td>
                  <td style={{ padding: 10 }}>
                    {item.status} · {item.visibility}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>
    </s-page>
  );
}
