# AI Image Manager for Shopify

Shopify app for AI product-image generation, public galleries, customer history, moderation, and admin management.

## What is included

- Shopify React Router app shell.
- GPT Image 1 generation API at `/api/generate-image`.
- OpenAI prompt moderation before image generation.
- Prisma data model for PostgreSQL.
- Dynamic records for prompt, image URL, product ID, customer ID, created date, visibility, moderation, usage logs, likes, reviews, and comments.
- Admin app pages:
  - `/app` overview
  - `/app/gallery` public image gallery
  - `/app/dashboard` customer image counts and activity
  - `/app/admin` moderation and visibility controls
- Theme App Extension:
  - Product page AI image generator block
  - Public community gallery block
- Shopify Admin GraphQL media-upload hook through `productCreateMedia`.

## Important production note

GPT Image 1 can return base64 image data. Shopify product media requires a public URL that Shopify can fetch. For production, add object storage and CDN before relying on automatic product gallery upload.

Recommended flow:

1. Generate image with OpenAI.
2. Apply or verify watermark.
3. Upload final image to S3, Cloudflare R2, Vercel Blob, or another CDN-backed store.
4. Save the CDN URL in PostgreSQL.
5. Pass the CDN URL to Shopify `productCreateMedia`.

The current code stores the returned OpenAI image data and skips product media upload when the image is a `data:` URL.

## Environment variables

Create `.env` with:

```bash
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=write_products,read_products,write_files,read_files,read_customers
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
OPENAI_API_KEY=
```

For theme app extension storefront calls, configure the block setting `App API base URL` to your app URL during development. In production, configure a Shopify app proxy and use the proxy URL.

## Database setup

Do not run these automatically if you need manual database control. Run them yourself when ready:

```bash
npm run prisma -- generate
npm run prisma -- migrate dev --name ai_image_manager_schema
```

For production:

```bash
npm run prisma -- migrate deploy
```

## Shopify setup steps

1. Create or select your Shopify Partner app.
2. Link local config:

```bash
npm run config:link
```

3. Set scopes in `shopify.app.toml` or through Shopify CLI:

```text
write_products,read_products,write_files,read_files,read_customers
```

4. Start local development:

```bash
npm run dev
```

5. Install the app on your dev store.
6. Open the embedded app from Shopify admin.
7. Add the Theme App Extension blocks in the theme editor:
   - `AI image generator` on product pages
   - `AI public gallery` on a gallery/community page
8. Set each block's `App API base URL`.
9. Test generation from a product page.

## API routes

### `POST /api/generate-image`

Body:

```json
{
  "shop": "your-store.myshopify.com",
  "productId": "gid://shopify/Product/123",
  "productHandle": "example-product",
  "customerId": "123",
  "customerEmail": "customer@example.com",
  "prompt": "Create a lifestyle product image",
  "visibility": "PUBLIC"
}
```

Response includes:

```json
{
  "success": true,
  "image": "https://...",
  "generation": {},
  "media": {}
}
```

### `GET /api/gallery?shop=your-store.myshopify.com`

Returns approved public images for storefront gallery blocks.

### `POST /api/image-interactions`

Supports `like`, `comment`, and `review`.

## Customer accounts

This scaffold maps generated images to Shopify customer IDs when the storefront has a logged-in customer. If you also want accounts outside Shopify customer accounts, add:

- Registration and login pages.
- Password hashing with a dependency such as `bcryptjs`.
- Session cookies.
- Email verification and password reset.

For a Shopify storefront, the best first version is to rely on Shopify customer accounts and pass `customer.id` from Liquid.

## Subscription and credits

The schema includes `CreditLedger` and `SubscriptionPlan`. To finish billing:

1. Add Shopify Billing API subscription creation.
2. Insert credit rows when a plan is purchased or renewed.
3. Check available credits before `/api/generate-image`.
4. Insert a negative credit row after successful generation.

## Redis queue

The synchronous API is useful for development. For production scale:

1. Add Redis provider such as Upstash Redis.
2. Add a queue library such as BullMQ.
3. Change `/api/generate-image` to create a `PENDING` generation and enqueue the job.
4. Create a worker process that runs moderation, OpenAI generation, CDN upload, Shopify media upload, and status updates.
5. Poll generation status from the storefront or stream progress with server-sent events.

## Moderation workflow

- Prompts are checked with OpenAI moderation before image generation.
- Unsafe prompts become `BLOCKED` and `REJECTED`.
- Admins can approve or reject generated images in `/app/admin`.
- Comments and reviews are saved as unapproved by default. Add approval UI before showing them publicly.

## Production checklist

- PostgreSQL database configured through `DATABASE_URL`.
- CDN/object storage configured for generated image files.
- Shopify app proxy configured for storefront API calls.
- Webhook handling for app uninstall and customer/data cleanup.
- Redis queue and worker process for async generation.
- Shopify Billing API wired to `CreditLedger`.
- Rate limiting per shop and customer.
- Logging for OpenAI request IDs and Shopify media upload errors.
- Admin moderation process for public gallery, reviews, and comments.
- Backup and retention policy for generated images and customer data.
