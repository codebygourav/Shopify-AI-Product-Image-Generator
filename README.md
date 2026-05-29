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
  - Product page AI image studio block
  - Public community gallery block
  - Profile generated images block for logged-in customers
  - AI image review block
- Shopify Admin GraphQL media-upload hook through `productCreateMedia`.

## Recommended storefront page structure

Use the theme extension as separate pages:

- `/pages/custom-configurator` with `AI product image studio`
- `/pages/my-ai-images` with `AI profile images`
- `/pages/community-gallery` with `AI community gallery`
- Enable app embed `AI cart line images` so generated images replace the product image in cart lines

Profile users request public/community publishing from `AI profile images`. Admin approval is required before the image appears in `AI community gallery`. Public gallery image details include actions to use the image or regenerate a new private version.

Admin pages:

- `Media library` (`/app/gallery`) is where images are approved for the community gallery.
- `Customers` (`/app/dashboard`) is where admin reviews customers and their generated images.
- `Settings` (`/app/admin`) is only for product/configurator setup.

Full setup guide:

```text
docs/AI_THEME_PAGES.md
```

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
SCOPES=write_products,read_products,write_files,read_files,read_customers,write_customers
DATABASE_URL=postgresql://apple@localhost:5432/ai_image_manager?schema=public
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1.5
OPENAI_MODERATION_MODEL=omni-moderation-latest
IMAGE_GENERATION_MODE=test
TEST_IMAGE_URL=https://dummyimage.com/1024x1024/7d7355/ffffff.png&text=Generated+AI+Image
```

For theme app extension storefront calls, configure the block setting `App API base URL` to your app URL during development. In production, configure a Shopify app proxy and use the proxy URL.

`IMAGE_GENERATION_MODE=test` returns `TEST_IMAGE_URL` and does not call OpenAI or moderation. Use `IMAGE_GENERATION_MODE=live` only when you want paid OpenAI image generation.

## Database setup

This project is configured for local PostgreSQL. Install PostgreSQL locally, then create the database yourself.

The default `.env` value is for Homebrew PostgreSQL on this Mac:

```bash
DATABASE_URL=postgresql://apple@localhost:5432/ai_image_manager?schema=public
```

macOS with Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb ai_image_manager
```

If you created a different PostgreSQL user or password, update `.env`, for example:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_image_manager?schema=public
```

Do not run database commands automatically if you need manual database control. Run these yourself when ready:

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
write_products,read_products,write_files,read_files,read_customers,write_customers
```

4. Start local development:

```bash
shopify app dev
```

5. Install the app on your dev store.
6. Open the embedded app from Shopify admin.
7. Add the Theme App Extension blocks in the theme editor:
   - `AI product image studio` on product pages near variants/add-to-cart
   - `AI community gallery` on product pages or a gallery/community page
   - `AI profile images` on customer account/profile pages
8. Set each block's `App API base URL` to `/apps/ai-image`. If you leave it blank, the extension also defaults to `/apps/ai-image`.
9. Test generation from a product page.

## Product page checkout flow

The `AI product image studio` block reads the currently selected Shopify product variant and sends `variantId` and `variantTitle` with the prompt.

After generation, the customer must click `Use this image for checkout`. The block adds hidden line-item properties to the product form:

- `AI Image URL`
- `AI Generation ID`
- `AI Prompt`
- `AI Product Variant`

When the customer clicks the theme's normal add-to-cart button, those properties travel with the cart line and show in cart/checkout/order details. The app also marks the generated image as selected in PostgreSQL.

## Local command sequence

Use this sequence on your machine. Run one command at a time and wait for each command to finish:

```bash
brew install postgresql@16
brew services start postgresql@16
pg_isready
createdb ai_image_manager
npm install
npm run prisma -- generate
npm run prisma -- migrate dev --name ai_image_manager_schema
shopify app dev
```

If `createdb` says the database already exists, continue with the next command.

When `shopify app dev` says `Ready, watching for changes`, open the `Preview URL` printed in the terminal. Do not open the old admin URL by itself if the dev server was restarted, because Shopify CLI creates a fresh tunnel URL each run.

If Homebrew says:

```text
A `brew install postgresql@16` process has already locked ...
```

another PostgreSQL install is still running. Wait for it to finish. Do not run the rest of the commands until `brew install postgresql@16` completes successfully.

If `pg_isready` or `createdb` says `command not found`, PostgreSQL is not installed yet or Homebrew has not linked it. Finish the Homebrew install first, then run:

```bash
echo 'export PATH="/usr/local/opt/postgresql@16/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

Then retry:

```bash
pg_isready
createdb ai_image_manager
```

## Fixing Prisma session errors

If you see:

```text
P1001: Can't reach database server at `localhost:5432`
```

PostgreSQL is not running, or `.env` points to the wrong host/port/user/password. Start your local PostgreSQL first:

```bash
brew services start postgresql@16
```

Then check that PostgreSQL is reachable:

```bash
pg_isready
```

If `pg_isready` says `accepting connections`, continue.

If you see:

```text
Prisma session table does not exist
The table `session` does not exist
```

PostgreSQL is reachable, but migrations have not created the Shopify session table yet. Run:

```bash
npm run prisma -- migrate dev --name ai_image_manager_schema
```

Then restart:

```bash
shopify app dev
```

## Blank Shopify Admin App

If Shopify admin shows a blank iframe or `This content is blocked`, stop old dev sessions first by pressing `q` in any terminal running `shopify app dev`.

If port `9293` is busy, close old terminal tabs that are running `shopify app dev`, then check:

```bash
lsof -nP -iTCP:9293 -sTCP:LISTEN
```

After old dev sessions are stopped, start fresh:

```bash
brew services start postgresql@16
pg_isready
npm run prisma -- migrate dev --name ai_image_manager_schema
shopify app dev
```

Open only the new `Preview URL` printed by Shopify CLI.

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
