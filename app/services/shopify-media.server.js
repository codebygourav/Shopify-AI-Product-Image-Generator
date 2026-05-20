export async function attachImageToProduct({ admin, productId, imageUrl, alt }) {
  if (!admin || !productId || !imageUrl) return null;

  if (imageUrl.startsWith("data:")) {
    return {
      skipped: true,
      reason:
        "Shopify product media upload requires a public URL. Configure object storage/CDN and pass that URL here.",
    };
  }

  const response = await admin.graphql(
    `#graphql
      mutation CreateProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            id
            alt
            mediaContentType
            status
          }
          mediaUserErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        productId,
        media: [
          {
            mediaContentType: "IMAGE",
            originalSource: imageUrl,
            alt,
          },
        ],
      },
    },
  );

  const json = await response.json();
  const errors = json.data?.productCreateMedia?.mediaUserErrors || [];
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  return json.data?.productCreateMedia?.media?.[0] || null;
}
