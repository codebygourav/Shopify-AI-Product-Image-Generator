import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import {
  getCustomers,
  getAiImageGenerations,
  updateCustomerProfile,
  updateAiImageGeneration,
  deleteAiImageGeneration,
} from "../services/metaobjects.server";
import { adminImageUrl } from "../services/image-urls.server";

type MetadataOption = { name?: string; value?: string };
type CustomerImage = {
  id: string;
  imageUrl?: string | null;
  metadata: string | null;
  prompt: string;
  status: string;
  visibility: string;
  moderationStatus: string;
};
type CustomerDetailData = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  shopifyCustomerId?: string | null;
  isApproved: boolean;
  generationLimit?: number | null;
  generations: CustomerImage[];
  _count: { generations: number };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedCustomerId = url.searchParams.get("customer");
  const shop = await getOrCreateShop(admin, session.shop);

  const customers = (await getCustomers(admin)) as CustomerDetailData[];
  let selectedCustomer: CustomerDetailData | null = null;

  if (selectedCustomerId) {
    const activeCust = customers.find((c) => c.id === selectedCustomerId);
    if (activeCust) {
      const generations = (
        await getAiImageGenerations(admin, {
          shopId: shop.id,
          customerId: selectedCustomerId,
        })
      ).filter((image) => image !== null) as CustomerImage[];
      selectedCustomer = {
        ...activeCust,
        generations: generations.map(withAdminImageUrl),
      };
    }
  }

  return { customers, selectedCustomer };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(admin, session.shop);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");

  if (intent.startsWith("customer:")) {
    const customers = (await getCustomers(admin)) as CustomerDetailData[];
    const customer = customers.find((c) => c.id === id);
    if (!customer) return null;

    const generationLimitValue = String(
      form.get("generationLimit") || "",
    ).trim();
    const generationLimit =
      generationLimitValue === "" ? null : Number(generationLimitValue);

    await updateCustomerProfile(admin, customer.id, {
      ...(intent === "customer:approve" ? { isApproved: true } : {}),
      ...(intent === "customer:block" ? { isApproved: false } : {}),
      ...(form.has("generationLimit") ? { generationLimit } : {}),
    });
    return null;
  }

  if (intent.startsWith("image:")) {
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
  }

  return null;
};

export default function Customers() {
  const { customers, selectedCustomer } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Customers">
      <div className={selectedCustomer ? "aim-details-container" : ""}>
        {selectedCustomer ? (
          <CustomerDetail customer={selectedCustomer} />
        ) : null}

        <s-section heading="Customer accounts">
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Customer Name / Email</th>
                  <th>Status</th>
                  <th>Total Images</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{customer.displayName || "Customer"}</div>
                      <div style={{ fontSize: 12, color: '#6d7175', marginTop: 2 }}>{customer.email || 'No email'}</div>
                    </td>
                    <td>
                      <span className={`aim-badge ${customer.isApproved ? 'aim-badge--success' : 'aim-badge--danger'}`}>
                        {customer.isApproved ? "Approved" : "Blocked"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{customer._count.generations}</span>
                    </td>
                    <td>
                      <s-stack direction="inline" gap="small">
                        <Link to={`/app/dashboard?customer=${customer.id}`} className="button-premium" style={{ textDecoration: 'none', padding: '6px 12px', fontSize: 13 }}>
                          View Details
                        </Link>
                        <Form method="post">
                          <input type="hidden" name="id" value={customer.id} />
                          <button
                            type="submit"
                            name="intent"
                            value={customer.isApproved ? "customer:block" : "customer:approve"}
                            style={{ padding: "6px 12px", fontSize: 13 }}
                          >
                            {customer.isApproved ? "Block" : "Approve"}
                          </button>
                        </Form>
                      </s-stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}

function CustomerDetail({ customer }: { customer: CustomerDetailData }) {
  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <s-section heading="Customer Details">
        <s-stack direction="block" gap="base">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>
              {customer.displayName || "Customer"}
            </div>
            <div style={{ fontSize: 13, color: '#6d7175', marginTop: 4 }}>
              {customer.email || 'No email provided'}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className={`aim-badge ${customer.isApproved ? 'aim-badge--success' : 'aim-badge--danger'}`}>
                {customer.isApproved ? "Approved" : "Blocked"}
              </span>
            </div>
          </div>

          <Form method="post" style={{ borderTop: '1px solid #e1e3e5', borderBottom: '1px solid #e1e3e5', padding: '16px 0' }}>
            <input type="hidden" name="id" value={customer.id} />
            <s-stack direction="block" gap="small">
              <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: 11, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <span>Generation limit</span>
                <input
                  name="generationLimit"
                  type="number"
                  min="0"
                  defaultValue={customer.generationLimit ?? ""}
                  placeholder="Unlimited"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', marginTop: 8 }}>
                <button
                  type="submit"
                  name="intent"
                  value="customer:approve"
                  className="button-primary"
                >
                  Save Limit
                </button>
                <button
                  type="submit"
                  name="intent"
                  value={customer.isApproved ? "customer:block" : "customer:approve"}
                >
                  {customer.isApproved ? "Block User" : "Approve User"}
                </button>
              </div>
            </s-stack>
          </Form>

          <div>
            <label style={{ fontWeight: 600, fontSize: 11, color: '#6d7175', textTransform: 'uppercase', display: 'block', marginBottom: 12, letterSpacing: '0.5px' }}>
              Customer AI Creations ({customer.generations.length})
            </label>

            {customer.generations.length === 0 ? (
              <s-text tone="neutral">No images generated by this customer.</s-text>
            ) : (
              <div style={{ display: 'grid', gap: 12, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                {customer.generations.map((image) => (
                  <div key={image.id} style={{ display: 'flex', gap: 12, background: '#f6f6f7', padding: 8, borderRadius: 8, border: '1px solid #e1e3e5', alignItems: 'center' }}>
                    {image.imageUrl ? (
                      <img
                        src={image.imageUrl}
                        alt={displayPrompt(image.metadata, image.prompt)}
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: "cover",
                          borderRadius: 6,
                          border: "1px solid #e1e3e5",
                          flexShrink: 0
                        }}
                      />
                    ) : null}
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {displayPrompt(image.metadata, image.prompt)}
                      </div>
                      <div style={{ fontSize: 10, color: '#6d7175', marginTop: 2 }}>
                        {selectedOptionsSummary(image.metadata) || "No options"}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <span className={`aim-badge ${image.visibility === 'PUBLIC' ? 'aim-badge--info' : 'aim-badge--success'}`} style={{ fontSize: 8, padding: '2px 4px' }}>
                          {image.visibility}
                        </span>
                        <span className={`aim-badge ${
                          image.moderationStatus === 'APPROVED' ? 'aim-badge--success' :
                          image.moderationStatus === 'REJECTED' ? 'aim-badge--danger' : 'aim-badge--warning'
                        }`} style={{ fontSize: 8, padding: '2px 4px' }}>
                          {image.moderationStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link to="/app/dashboard" style={{ textDecoration: 'none', textAlign: 'center', display: 'block', fontSize: 13, color: '#008060', fontWeight: 600 }}>
            Close Customer Details
          </Link>
        </s-stack>
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
    .filter((option: MetadataOption) => option.name && option.value)
    .map(
      (option: Required<MetadataOption>) => `${option.name}: ${option.value}`,
    )
    .join(", ");
}

function withAdminImageUrl(image: CustomerImage): CustomerImage {
  return {
    ...image,
    imageUrl: adminImageUrl(image.imageUrl),
  };
}
