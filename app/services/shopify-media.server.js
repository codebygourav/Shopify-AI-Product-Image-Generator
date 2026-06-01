export async function attachImageToProduct({
  admin,
  productId,
  imageUrl,
  alt,
}) {
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

async function stageImageForShopify({
  admin,
  imageUrl,
  base64Data,
  mimeType = "image/png",
}) {
  let imageBlob;
  let contentType = mimeType || "image/png";
  let extension = "png";

  if (base64Data) {
    const buffer = Buffer.from(base64Data, "base64");
    extension =
      contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "png";
    imageBlob = new Blob([buffer], { type: contentType });
  } else if (imageUrl?.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid data URL format.");
    }
    contentType = match[1];
    extension =
      contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "png";
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    imageBlob = new Blob([buffer], { type: contentType });
  } else if (imageUrl) {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Could not fetch generated image: ${imageResponse.status}`,
      );
    }
    contentType = imageResponse.headers.get("content-type") || "image/png";
    extension =
      contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : "png";
    imageBlob = await imageResponse.blob();
  } else {
    throw new Error("No generated image data was provided for upload.");
  }

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
  assertNoGraphqlErrors(stagedJson);
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

export async function uploadImageToShopifyFiles({
  admin,
  imageUrl,
  base64Data,
  mimeType,
}) {
  if (!admin || (!imageUrl && !base64Data)) return null;

  // 1. Stage the image
  const originalSource = await stageImageForShopify({
    admin,
    imageUrl,
    base64Data,
    mimeType,
  });

  // 2. Create the file in Shopify using fileCreate mutation
  const response = await admin.graphql(
    `#graphql
      mutation CreateFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            fileStatus
            ... on MediaImage {
              image {
                url
              }
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
        files: [
          {
            originalSource,
            contentType: "IMAGE",
            alt: "AI Generated Image",
          },
        ],
      },
    },
  );

  const json = await response.json();
  assertNoGraphqlErrors(json);
  const errors = json.data?.fileCreate?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  const file = json.data?.fileCreate?.files?.[0];
  if (!file) {
    throw new Error("Shopify did not return a created file.");
  }

  // 3. Poll for the file's ready status and CDN URL
  const fileId = file.id;
  let fileUrl = file.fileStatus === "READY" ? file.image?.url : null;

  for (let i = 0; !fileUrl && i < 20; i++) {
    // Wait 1 second before checking
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const checkResponse = await admin.graphql(
      `#graphql
        query GetFile($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus
              image {
                url
              }
            }
          }
        }`,
      {
        variables: { id: fileId },
      },
    );

    const checkJson = await checkResponse.json();
    assertNoGraphqlErrors(checkJson);
    const node = checkJson.data?.node;

    if (node?.fileStatus === "READY" && node?.image?.url) {
      fileUrl = node.image.url;
      break;
    }

    if (node?.fileStatus === "FAILED") {
      throw new Error("Shopify file processing failed.");
    }
  }

  if (!fileUrl) {
    throw new Error("Shopify file processing timed out. Please try again.");
  }

  return fileUrl;
}

function assertNoGraphqlErrors(json) {
  const errors = json?.errors || [];
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }
}
