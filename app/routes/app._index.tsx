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
      {/* Metrics Cards Grid */}
      <div className="aim-metrics-grid">
        <div className="aim-metric-card">
          <div className="aim-metric-title">Total AI Creations</div>
          <div className="aim-metric-value">{data.total}</div>
        </div>
        <div className="aim-metric-card accent-purple">
          <div className="aim-metric-title">Community Requests</div>
          <div className="aim-metric-value">{data.publicCount}</div>
        </div>
        <div className="aim-metric-card accent-orange">
          <div className="aim-metric-title">Awaiting Moderation</div>
          <div className="aim-metric-value">{data.pendingModeration}</div>
        </div>
      </div>

      <s-section heading="Recent activity">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Preview</th>
                <th>Prompt</th>
                <th>Customer</th>
                <th>Visibility</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.prompt}
                        style={{
                          width: 56,
                          height: 56,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid #e1e3e5",
                          display: "block"
                        }}
                      />
                    ) : null}
                  </td>
                  <td style={{ maxWidth: 460 }}>
                    <div
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        lineHeight: 1.4,
                        fontWeight: 500
                      }}
                    >
                      <s-text>{item.prompt}</s-text>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>
                      {item.customer?.email || "Guest User"}
                    </span>
                  </td>
                  <td>
                    <span className={`aim-badge ${item.visibility === 'PUBLIC' ? 'aim-badge--info' : 'aim-badge--success'}`}>
                      {item.visibility}
                    </span>
                  </td>
                  <td>
                    <span className={`aim-badge ${
                      item.status === 'COMPLETED' ? 'aim-badge--success' : 
                      item.status === 'FAILED' ? 'aim-badge--danger' : 'aim-badge--warning'
                    }`}>
                      {item.status}
                    </span>
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
