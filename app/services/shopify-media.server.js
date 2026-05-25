export async function attachImageToProduct({ admin, productId, imageUrl, alt }) {
  if (!admin || !productId || !imageUrl) return null;

  if (imageUrl.startsWith("data:")) {
    return {
      skipped: true,
      reason:
        "Shopify product media upload requires a public URL. Configure object storage/CDN and pass that URL here.",
    };
  }

  const originalSource = await stageImageForShopify({ admin, imageUrl });

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
            originalSource,
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

async function stageImageForShopify({ admin, imageUrl }) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Could not fetch generated image: ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const imageBlob = await imageResponse.blob();
  const filename = `ai-generated-${Date.now()}.${extension}`;

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation CreateStagedUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        input: [
          {
            resource: "IMAGE",
            filename,
            mimeType: contentType,
            httpMethod: "POST",
          },
        ],
      },
    },
  );

  const stagedJson = await stagedResponse.json();
  const errors = stagedJson.data?.stagedUploadsCreate?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  const target = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    throw new Error("Shopify did not return a staged upload target.");
  }

  const form = new FormData();
  target.parameters.forEach((parameter) => {
    form.append(parameter.name, parameter.value);
  });
  form.append("file", imageBlob, filename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: form,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Shopify staged upload failed: ${uploadResponse.status}`);
  }

  return target.resourceUrl;
}
