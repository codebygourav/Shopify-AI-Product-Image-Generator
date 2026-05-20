(function () {
  function apiUrl(base, path) {
    const normalizedPath = String(path || "").replace(/^\/api\//, "/");
    const normalizedBase = String(base || "/apps/ai-image").replace(/\/$/, "");
    return `${normalizedBase}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  }

  async function readJson(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    throw new Error(
      response.status === 404
        ? "AI app proxy was not found. Use /apps/ai-image as the block API base URL and update the app proxy if needed."
        : text.slice(0, 160) || "AI app returned a non-JSON response.",
    );
  }

  function productForm(root) {
    return root.closest("form[action*='/cart/add']") || document.querySelector("form[action*='/cart/add']");
  }

  function selectedVariant(form) {
    const idInput = form?.querySelector("[name='id']");
    const variantId = idInput?.value || "";
    const optionInputs = form
      ? Array.from(
          form.querySelectorAll(
            "select[name^='options'], select[name^='option'], input[name^='options']:checked, input[name^='option']:checked, fieldset input[type='radio']:checked",
          ),
        )
      : [];
    const labels = optionInputs
      .map((input) => optionLabel(input))
      .filter(Boolean);
    return {
      id: variantId ? `gid://shopify/ProductVariant/${variantId}` : "",
      title: labels.join(" / ") || "Default variant",
      promptText: labels.length ? labels.join(", ") : "Default variant",
    };
  }

  function optionLabel(input) {
    const value = input.value || "";
    if (!value || value === "on") return "";

    const fieldset = input.closest("fieldset");
    const legend = fieldset?.querySelector("legend")?.textContent?.trim();
    const selectLabel =
      input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent?.trim();
    const name = input.name?.replace(/^options?\[?|\]?$/g, "") || "";
    const optionName = legend || name || selectLabel;

    return optionName ? `${optionName}: ${value}` : value;
  }

  function setCartProperty(form, name, value) {
    if (!form) return;
    const inputName = `properties[${name}]`;
    let input = form.querySelector(`input[name="${CSS.escape(inputName)}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = inputName;
      form.appendChild(input);
    }
    input.value = value || "";
  }

  document.querySelectorAll("[data-ai-image-generator]").forEach((root) => {
    const button = root.querySelector("[data-ai-generate]");
    const selectButton = root.querySelector("[data-ai-select]");
    const textarea = root.querySelector("[data-ai-prompt]");
    const status = root.querySelector("[data-ai-status]");
    const preview = root.querySelector("[data-ai-preview]");
    const publicInput = root.querySelector("[data-ai-public]");
    const variantLabel = root.querySelector("[data-ai-variant-label]");
    const form = productForm(root);
    let selectedImage = null;

    function refreshVariantLabel() {
      const variant = selectedVariant(form);
      variantLabel.textContent = variant.title;
      return variant;
    }

    refreshVariantLabel();
    document.addEventListener("change", refreshVariantLabel);

    root.querySelectorAll("[data-ai-template]").forEach((template) => {
      template.addEventListener("click", () => {
        const variant = refreshVariantLabel();
        textarea.value = `${template.dataset.aiTemplate}, for ${root.dataset.productTitle}, selected options: ${variant.promptText}`;
        textarea.focus();
      });
    });

    button.addEventListener("click", async () => {
      const variant = refreshVariantLabel();
      const prompt = textarea.value.trim();
      if (!prompt) {
        status.textContent = "Enter an art direction first.";
        return;
      }

      const promptWithOptions = `${prompt}\n\nProduct: ${root.dataset.productTitle}. Selected product options: ${variant.promptText}.`;
      button.disabled = true;
      selectButton.hidden = true;
      status.textContent = "Moderating prompt and generating artwork...";
      preview.classList.add("is-loading");

      try {
        const response = await fetch(apiUrl(root.dataset.apiBase, "/api/generate-image"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: root.dataset.shop,
            productId: root.dataset.productId,
            productHandle: root.dataset.productHandle,
            variantId: variant.id,
            variantTitle: variant.title,
            customerId: root.dataset.customerId,
            customerEmail: root.dataset.customerEmail,
            prompt: promptWithOptions,
            visibility: publicInput.checked ? "PUBLIC" : "PRIVATE",
          }),
        });
        const data = await readJson(response);
        if (!data.success) throw new Error(data.error || "Image generation failed.");

        selectedImage = data.generation;
        preview.innerHTML = `
          <img src="${data.image}" alt="${escapeHtml(prompt)}">
          <span>Generated by AI</span>
        `;
        selectButton.hidden = false;
        status.textContent = "Image generated. Select it before adding this product to cart.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        preview.classList.remove("is-loading");
        button.disabled = false;
      }
    });

    selectButton.addEventListener("click", async () => {
      if (!selectedImage) return;

      setCartProperty(form, "AI Image URL", selectedImage.imageUrl);
      setCartProperty(form, "AI Generation ID", selectedImage.id);
      setCartProperty(form, "AI Prompt", selectedImage.prompt);
      setCartProperty(form, "AI Product Variant", selectedImage.variantTitle || selectedVariant(form).title);

      await fetch(apiUrl(root.dataset.apiBase, "/api/customer-images"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: root.dataset.shop,
          generationId: selectedImage.id,
          customerId: root.dataset.customerId,
          customerEmail: root.dataset.customerEmail,
        }),
      }).catch(function () {});

      status.textContent = "Selected image is attached to this cart item.";
    });
  });

  document.querySelectorAll("[data-ai-gallery]").forEach(async (root) => {
    const grid = root.querySelector("[data-ai-gallery-grid]");
    const images = await fetchImages(root, "/api/gallery");
    grid.innerHTML = renderCards(images, { showReviews: true });
  });

  document.querySelectorAll("[data-ai-user-images]").forEach(async (root) => {
    const grid = root.querySelector("[data-ai-user-images-grid]");
    const images = await fetchImages(root, "/api/customer-images");
    grid.innerHTML = renderCards(images, { showReviews: true });
  });

  document.querySelectorAll("[data-ai-reviews]").forEach(async (root) => {
    const list = root.querySelector("[data-ai-review-list]");
    const select = root.querySelector("[data-ai-review-image]");
    const form = root.querySelector("[data-ai-review-form]");
    const status = root.querySelector("[data-ai-review-status]");
    const images = await fetchImages(root, "/api/customer-images");

    select.innerHTML = images.map((image) => `<option value="${image.id}">${escapeHtml(image.prompt).slice(0, 80)}</option>`).join("");
    list.innerHTML = renderReviewList(images);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      status.textContent = "Submitting review...";
      try {
        const response = await fetch(apiUrl(root.dataset.apiBase, "/api/image-interactions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: root.dataset.shop,
            customerId: root.dataset.customerId,
            customerEmail: root.dataset.customerEmail,
            generationId: data.get("generationId"),
            type: "review",
            rating: data.get("rating"),
            comment: data.get("comment"),
          }),
        });
        const result = await readJson(response);
        if (!result.success) throw new Error(result.error || "Review failed.");
        status.textContent = "Review submitted for approval.";
        form.reset();
      } catch (error) {
        status.textContent = error.message;
      }
    });
  });

  async function fetchImages(root, path) {
    try {
      const params = new URLSearchParams({
        shop: root.dataset.shop || "",
        customerId: root.dataset.customerId || "",
        customerEmail: root.dataset.customerEmail || "",
        productId: root.dataset.productId || "",
      });
      const response = await fetch(apiUrl(root.dataset.apiBase, `${path}?${params.toString()}`));
      const data = await readJson(response);
      return data.images || [];
    } catch (error) {
      return [];
    }
  }

  function renderCards(images, options) {
    if (!images.length) return '<p class="aim-empty">No approved AI images yet.</p>';
    return images
      .map((image) => `
        <article class="aim-card" data-generation-id="${image.id}">
          <img src="${image.imageUrl}" alt="${escapeHtml(image.prompt)}">
          <div class="aim-card__body">
            <p>${escapeHtml(image.prompt)}</p>
            <small>${image._count?.likes || 0} likes · ${image._count?.reviews || 0} reviews · ${image._count?.comments || 0} comments</small>
            ${options.showReviews ? renderStars(image.reviews) : ""}
          </div>
        </article>
      `)
      .join("");
  }

  function renderReviewList(images) {
    const reviews = images.flatMap((image) =>
      (image.reviews || []).map((review) => ({ ...review, image })),
    );
    if (!reviews.length) return '<p class="aim-empty">No approved reviews yet.</p>';
    return reviews
      .map((review) => `
        <article class="aim-review">
          <img src="${review.image.imageUrl}" alt="${escapeHtml(review.image.prompt)}">
          <div>
            <strong>${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</strong>
            <p>${escapeHtml(review.body || "")}</p>
          </div>
        </article>
      `)
      .join("");
  }

  function renderStars(reviews) {
    if (!reviews?.length) return "";
    const average = Math.round(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length);
    return `<span class="aim-stars">${"★".repeat(average)}${"☆".repeat(5 - average)}</span>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
