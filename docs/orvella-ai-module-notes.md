# Orvella AI module notes

1. Need to fix the prompt view on mobile.
2. Orvella watermark.
3. Only size options: landscape, portrait, square, with frame color.
4. Allow effects such as vintage and retro.
5. Generated images should support draft mode and live mode.

Flow requirements:

- User enters a prompt first.
- Show random prompt options.
- Generate only two low-quality draft versions first so the user does not wait too long.
- After the two drafts are generated, show a generated image detail/editor screen.
- From that screen the user can choose size, frame, effect, crop, regenerate, and finalize.
- Follow a Midjourney-style flow, without copying the exact UI.
- Draft images should be small/KB-size.
- Finalized images should be used in checkout, cart, order listing, Shopify admin order view, custom app admin, gallery, and community.
- Community images should support draft/live moderation.
- Customers should be able to request that a finalized image be public.
- Public community images should support reuse, comments, and reviews.
- Admin should be able to check, update, approve, or delete reviews.
- All records should be saved in the app database and shown in admin.
