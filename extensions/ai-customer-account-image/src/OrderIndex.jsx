import {
  reactExtension,
  BlockStack,
  InlineStack,
  Card,
  Image,
  Text,
  Link,
  useApi,
} from "@shopify/ui-extensions-react/customer-account";
import { useState, useEffect } from "react";

export default reactExtension(
  "customer-account.order-index.block.render",
  () => <AiOrderIndexPreviews />,
);

function AiOrderIndexPreviews() {
  const [ordersWithArtwork, setOrdersWithArtwork] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await fetch("shopify://customer-account/api/2025-07/graphql.json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `
              query GetCustomerOrders {
                customer {
                  orders(first: 15) {
                    edges {
                      node {
                        id
                        name
                        processedAt
                        lineItems(first: 20) {
                          edges {
                            node {
                              title
                              customAttributes {
                                key
                                value
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
          }),
        });

        const res = await response.json();
        const ordersEdges = res?.data?.customer?.orders?.edges || [];
        
        // Filter orders that have at least one line item with an AI image URL
        const filtered = ordersEdges
          .map((edge) => {
            const order = edge.node;
            const items = order.lineItems?.edges || [];
            
            const artworkItems = items
              .map((itemEdge) => {
                const item = itemEdge.node;
                const attributes = item.customAttributes || [];
                
                const imageUrl = attributes.find((attr) =>
                  ["_AI Image URL", "AI Image Preview", "AI Image URL"].includes(attr.key)
                )?.value;
                
                const optionsSummary = attributes.find((attr) =>
                  ["_AI Custom Options", "AI Options"].includes(attr.key)
                )?.value;
                
                return imageUrl ? { title: item.title, imageUrl, optionsSummary } : null;
              })
              .filter(Boolean);

            return artworkItems.length > 0 ? { ...order, artworkItems } : null;
          })
          .filter(Boolean);

        setOrdersWithArtwork(filtered);
      } catch (err) {
        console.error("Failed to fetch customer orders with custom artwork:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  if (loading || ordersWithArtwork.length === 0) {
    return null; // Don't render anything if loading or no orders have custom artwork
  }

  return (
    <Card padding="extraLoose">
      <BlockStack spacing="loose">
        <BlockStack spacing="extraTight">
          <Text size="medium" emphasis="bold">
            Your Custom Artwork Order Previews
          </Text>
          <Text size="small" appearance="subdued">
            Quickly preview and track your generated AI artworks from recent orders.
          </Text>
        </BlockStack>
        <BlockStack spacing="loose">
          {ordersWithArtwork.map((order) => (
            <Card key={order.id} padding="loose" border="base">
              <BlockStack spacing="base">
                <InlineStack justify="space-between" blockAlignment="center">
                  <BlockStack spacing="none">
                    <Text size="small" emphasis="bold">
                      Order {order.name}
                    </Text>
                    <Text size="extraSmall" appearance="subdued">
                      Ordered on {new Date(order.processedAt).toLocaleDateString()}
                    </Text>
                  </BlockStack>
                  <Link to={`shopify://customer-account/orders/${order.id.split("/").pop()}`}>
                    View Details
                  </Link>
                </InlineStack>
                <BlockStack spacing="loose">
                  {order.artworkItems.map((item, index) => (
                    <InlineStack key={index} spacing="base" blockAlignment="center">
                      <Image
                        source={toDirectImageUrl(item.imageUrl)}
                        accessibilityDescription={item.title}
                        border="base"
                        cornerRadius="base"
                        aspectRatio={1}
                        fit="contain"
                        width={64}
                      />
                      <BlockStack spacing="none">
                        <Text size="small" emphasis="bold">
                          {item.title}
                        </Text>
                        {item.optionsSummary ? (
                          <Text size="extraSmall" appearance="subdued">
                            {item.optionsSummary}
                          </Text>
                        ) : null}
                      </BlockStack>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function toDirectImageUrl(url) {
  if (!url) return "";
  const match = String(url).match(/\/ai-generated\/([^/?#]+\.(?:png|jpe?g|webp))/i);
  if (match) {
    return `https://shopify-ai.deploymeta.com/ai-generated/${match[1]}`;
  }
  return url;
}
