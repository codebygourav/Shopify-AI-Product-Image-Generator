# AI Image Theme Pages Setup

This app should be used as a small set of Shopify theme pages, not as one large product page.

## Concept

There are four separate surfaces:

1. **AI Configurator page**
   Customers generate a new image, choose size/frame/fabric, and add the selected result to cart.

2. **Profile generated images page**
   Logged-in customers see only images they personally generated. From here they can request admin approval to publish an image to the community gallery.

3. **Community gallery page**
   Everyone can browse admin-approved public images. Customers can use an approved image as-is, or regenerate a new private version from the same prompt.

4. **Admin app**
   Admin reviews users, generated media, and public gallery requests, then can approve/reject/delete images.

The same `AiImageGeneration` record stores each image. No generated image is saved to Shopify product media. Checkout uses one hidden Shopify product variant plus cart line properties.

## Required Shopify Product

Create one hidden Shopify product, for example:

```text
Custom AI Artwork
```

Keep it active so checkout works, but hide it from navigation and collections.

Copy its numeric variant ID and paste it in:

```text
AI Image Manager Admin -> Generate your own product setup -> Shopify checkout variant ID
```

This hidden variant is the checkout item. The generated image, prompt, and options are attached to the cart line as properties.

## Page 1: AI Configurator

Create a Shopify page:

```text
/pages/custom-configurator
```

In the theme editor, add this app block:

```text
AI product image studio
```

Use this page for your home button:

```text
Home -> Generate by AI -> /pages/custom-configurator
```

Customers generate an image here, select it, and add it to cart.

## Page 2: Profile Generated Images

Create a Shopify page for customer profile media, for example:

```text
/pages/my-ai-images
```

In the theme editor, add this app block:

```text
AI profile images
```

This block uses the logged-in Shopify customer:

```liquid
customer.id
customer.email
```

It shows only that customer's generated images. It does not show other customers' images.

Customer actions:

- View their generated images.
- See prompt, selected options, and usage counts.
- Click `Request public` to ask admin to publish the image in the community gallery.
- If already requested, the card shows `Pending admin approval`.
- If approved, the card shows `Live in community`.

Requesting public changes the image to:

```text
visibility = PUBLIC
moderationStatus = PENDING
```

The image will not appear in the public community gallery until admin approves it.

## Page 3: Community Gallery

Create a Shopify page:

```text
/pages/community-gallery
```

In the theme editor, add this app block:

```text
AI community gallery
```

In the block setting:

```text
AI configurator page URL
```

set:

```text
/pages/custom-configurator
```

Community gallery behavior:

- Shows only `PUBLIC + APPROVED` images.
- Hover/card shows prompt and counts.
- `Details` opens image details with creator and selected options.
- Buyers can choose the available size/frame/fabric options on the card before using the image.
- `Use image` adds that approved image to cart with the hidden checkout product and the selected options.
- `Regenerate` opens the configurator with the prompt prefilled.

Regenerate creates a new image for the current customer. It does not change the original public community image.
Using an existing community image as-is does not add that image to the buyer's profile.

## Admin Workflow

Use these app pages:

```text
/app/gallery
```

Use this for media approval:

- Shows all generated images in a compact media table.
- Click `View details` on an image.
- If the user requested community publishing, the image state is `PUBLIC + PENDING`.
- Click `Approve for community` to show it in the community gallery.
- Click `Reject community post` to reject the public request.
- Click `Keep private` to remove it from public/community visibility.
- Click `Delete` to remove the image.

```text
/app/dashboard
```

Use this for customer management:

- Shows all customers in a table.
- Click `View details` on a customer to see that customer's generated images.
- Approve/block customers.
- Approve/reject that customer's public image requests.

```text
/app/admin
```

Use this for settings only:

- Configure custom product options.
- Configure checkout variant ID.

## Recommended Navigation

Storefront navigation:

```text
Generate by AI -> /pages/custom-configurator
My AI Images -> /pages/my-ai-images
Community Gallery -> /pages/community-gallery
```

Only show `My AI Images` to logged-in users if your theme supports conditional menu rendering. If not, the block itself shows a login message when the customer is not logged in.

## Theme Blocks Summary

Use these blocks:

```text
AI product image studio
AI profile images
AI community gallery
AI cart line images
```

Block purpose:

```text
AI product image studio  -> Custom generator/configurator page
AI profile images        -> Logged-in user's own generated images and public requests
AI community gallery     -> Public board of admin-approved images
AI cart line images      -> App embed for cart image replacement
```

`AI cart line images` is an app embed, not a visible section. Enable it in:

```text
Theme editor -> App embeds
```

It automatically replaces the cart product image with the generated AI image when the cart line has `_AI Image URL`.

## Important Notes

- Private generated images are usable in cart immediately.
- Approval is only required for community/public gallery display.
- Admin approval does not control checkout usage.
- Community images are reusable, but regenerating from them creates a new record.
- The hidden Shopify product is only for checkout. Generated images remain in this app's database/media records.
