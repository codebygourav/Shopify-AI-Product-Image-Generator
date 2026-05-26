import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../services/shops.server";
import {
  getCustomers,
  getAiImageGenerations,
  updateCustomerProfile,
  updateAiImageGeneration,
  deleteAiImageGeneration
} from "../services/metaobjects.server";

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
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedCustomerId = url.searchParams.get("customer");
  await getOrCreateShop(admin, session.shop);

  const customers = await getCustomers(admin);
  let selectedCustomer = null;

  if (selectedCustomerId) {
    const activeCust = customers.find(c => c.id === selectedCustomerId);
    if (activeCust) {
      const generations = await getAiImageGenerations(admin, { customerId: selectedCustomerId });
      selectedCustomer = {
        ...activeCust,
        generations,
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
    const customers = await getCustomers(admin);
    const customer = customers.find(c => c.id === id);
    if (!customer) return null;

    const generationLimitValue = String(form.get("generationLimit") || "").trim();
    const generationLimit = generationLimitValue === "" ? null : Number(generationLimitValue);

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
      <s-section heading="Customer accounts">
        {selectedCustomer ? <CustomerDetail customer={selectedCustomer} /> : null}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 10 }}>Customer</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }}>Images</th>
                <th style={{ padding: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 10 }}>{customer.displayName || customer.email || customer.shopifyCustomerId || "Guest user"}</td>
                  <td style={{ padding: 10 }}>{customer.isApproved ? "Approved" : "Blocked"}</td>
                  <td style={{ padding: 10 }}>{customer._count.generations}</td>
                  <td style={{ padding: 10 }}>
                    <s-stack direction="inline" gap="small">
                      <Link to={`/app/dashboard?customer=${customer.id}`}>View details</Link>
                      <Form method="post">
                        <input type="hidden" name="id" value={customer.id} />
                        <button type="submit" name="intent" value={customer.isApproved ? "customer:block" : "customer:approve"} style={{ padding: "8px 10px" }}>
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
    </s-page>
  );
}

function CustomerDetail({ customer }: { customer: CustomerDetailData }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-heading>{customer.displayName || customer.email || customer.shopifyCustomerId || "Guest user"}</s-heading>
        <s-text tone="neutral">{customer.isApproved ? "Approved" : "Blocked"} · {customer.generations.length} images</s-text>
        <Form method="post">
          <input type="hidden" name="id" value={customer.id} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Generation limit</span>
              <input
                name="generationLimit"
                type="number"
                min="0"
                defaultValue={customer.generationLimit ?? ""}
                placeholder="Unlimited"
                style={{ width: 180, padding: "8px 10px" }}
              />
            </label>
            <button type="submit" name="intent" value="customer:approve" style={{ padding: "8px 10px" }}>
              Save
            </button>
            <button type="submit" name="intent" value="customer:block" style={{ padding: "8px 10px" }}>
              Block
            </button>
          </div>
        </Form>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: 8 }}>Image</th>
                <th style={{ padding: 8 }}>Prompt</th>
                <th style={{ padding: 8 }}>State</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customer.generations.map((image) => (
                <tr key={image.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8, width: 64 }}>
                    {image.imageUrl ? (
                      <img src={image.imageUrl} alt={displayPrompt(image.metadata, image.prompt)} style={{ width: 48, aspectRatio: "1", objectFit: "cover", borderRadius: 6 }} />
                    ) : null}
                  </td>
                  <td style={{ padding: 8 }}>
                    <s-text>{displayPrompt(image.metadata, image.prompt)}</s-text>
                    <s-text tone="neutral">{selectedOptionsSummary(image.metadata) || "No options"}</s-text>
                  </td>
                  <td style={{ padding: 8 }}>{image.status} · {image.visibility} · {image.moderationStatus}</td>
                          <td style={{ padding: 8 }}>
                        <Form method="post">
                          <input type="hidden" name="id" value={image.id} />
                          <s-stack direction="inline" gap="small">
                            {image.visibility === "PUBLIC" && image.moderationStatus === "PENDING" ? (
                              <>
                                <button type="submit" name="intent" value="image:approve" style={{ padding: "6px 8px" }}>Approve</button>
                                <button type="submit" name="intent" value="image:reject" style={{ padding: "6px 8px" }}>Reject</button>
                              </>
                            ) : image.visibility === "PUBLIC" ? (
                              <button type="submit" name="intent" value="image:reject" style={{ padding: "6px 8px" }}>Reject</button>
                            ) : null}
                            <button type="submit" name="intent" value="image:private" style={{ padding: "6px 8px" }}>Private</button>
                            <button type="submit" name="intent" value="image:delete" style={{ padding: "6px 8px" }}>Delete</button>
                          </s-stack>
                        </Form>
                          </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <s-link href="/app/dashboard">Close details</s-link>
      </s-stack>
    </s-box>
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
    .map((option: Required<MetadataOption>) => `${option.name}: ${option.value}`)
    .join(", ");
}
