import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

function customerIdVariants(customerId: string) {
  if (!customerId) return [];
  const raw = String(customerId);
  const numeric = raw.match(/Customer\/([^/]+)$/)?.[1] || raw;
  return Array.from(
    new Set([raw, numeric, `gid://shopify/Customer/${numeric}`]),
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!payload) {
    return new Response("No payload received", { status: 400 });
  }

  const customer = payload.customer;
  const lineItems = payload.line_items || [];

  if (customer && lineItems.length > 0) {
    const rawCustomerId = String(customer.id);
    const numericCustomerId =
      rawCustomerId.match(/Customer\/([^/]+)$/)?.[1] || rawCustomerId;
    const email = customer.email;
    const displayName =
      customer.first_name || customer.last_name
        ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
        : email
          ? email.split("@")[0]
          : "Customer";

    try {
      // Find our database shop
      const dbShop = await db.shop.findUnique({
        where: { shop: shop },
      });

      if (dbShop) {
        // Find or create customer in our database using numeric ID
        let dbCustomer = await db.customerAccount.findFirst({
          where: {
            shopId: dbShop.id,
            shopifyCustomerId: {
              in: customerIdVariants(numericCustomerId),
            },
          },
        });

        if (!dbCustomer) {
          dbCustomer = await db.customerAccount.create({
            data: {
              shopId: dbShop.id,
              shopifyCustomerId: numericCustomerId,
              email: email || null,
              displayName: displayName,
            },
          });
        } else {
          // Update customer details if they changed
          dbCustomer = await db.customerAccount.update({
            where: { id: dbCustomer.id },
            data: {
              email: email || dbCustomer.email,
              displayName: displayName || dbCustomer.displayName,
              shopifyCustomerId: numericCustomerId, // ensure it's normalized to numeric
            },
          });
        }

        // Check each line item for _AI Generation ID or _AI Generation ID property
        for (const item of lineItems) {
          const properties = item.properties || [];
          let generationId = null;

          // In webhooks, properties can be an array of { name, value } objects
          if (Array.isArray(properties)) {
            for (const prop of properties) {
              if (
                prop.name === "_AI Generation ID" ||
                prop.name === "Generation ID"
              ) {
                generationId = prop.value;
                break;
              }
            }
          }

          if (generationId) {
            console.log(
              `Webhook orders/create: Linking generation ${generationId} to customer account ${dbCustomer.id} (${numericCustomerId})`,
            );
            // Check if generation exists in DB
            const generation = await db.aiImageGeneration.findUnique({
              where: { id: generationId },
            });

            if (generation) {
              await db.aiImageGeneration.update({
                where: { id: generationId },
                data: {
                  customerId: dbCustomer.id,
                  selectedForCart: true,
                  metadata: mergeOrderMetadata(generation.metadata, {
                    orderId: payload.admin_graphql_api_id || payload.id,
                    orderName: payload.name,
                    orderNumber: payload.order_number,
                    lineItemId: item.admin_graphql_api_id || item.id,
                    lineItemTitle: item.title,
                    linkedAt: new Date().toISOString(),
                  }),
                },
              });
              console.log(
                `Webhook orders/create: Successfully linked generation ${generationId}`,
              );
            } else {
              console.warn(
                `Webhook orders/create: Generation ${generationId} not found in DB`,
              );
            }
          }
        }
      } else {
        console.warn(
          `Webhook orders/create: Shop ${shop} not found in database`,
        );
      }
    } catch (err: any) {
      console.error("Error processing orders/create webhook:", err);
      return new Response(err.message, { status: 500 });
    }
  }

  return new Response();
};

function mergeOrderMetadata(
  metadata: string | null,
  orderData: Record<string, unknown>,
) {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = metadata ? JSON.parse(metadata) : {};
  } catch {
    parsed = {};
  }

  const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
  return JSON.stringify({
    ...parsed,
    selectedForOrder: true,
    latestOrder: orderData,
    orders: [...orders, orderData].slice(-10),
  });
}
