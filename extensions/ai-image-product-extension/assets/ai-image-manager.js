(function () {
  function apiUrl(base, path) {
    const normalizedBase = String(base || "/apps/ai-image").replace(/\/$/, "");
    const rawPath = String(path || "");
    const isDirectAppUrl = /^https?:\/\//i.test(normalizedBase);
    const normalizedPath =
      isDirectAppUrl && !/\/api$/i.test(normalizedBase)
        ? rawPath
        : rawPath.replace(/^\/api\//, "/");

    return `${normalizedBase}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  }

  async function readJson(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      // Continue to the standard non-JSON error message below.
    }

    throw new Error(
      response.status === 404
        ? "AI app proxy was not found. Use /apps/ai-image as the block API base URL and update the app proxy if needed."
        : `AI app returned ${response.status || "a non-JSON response"} from ${response.url || "the configured API URL"}. Check the block App API base URL and Shopify app proxy settings.`,
    );
  }

  function productForm(root) {
    return (
      root.closest("form[action*='/cart/add']") ||
      document.querySelector("form[action*='/cart/add']")
    );
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
      numericId: variantId,
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
      input.id &&
      document
        .querySelector(`label[for="${CSS.escape(input.id)}"]`)
        ?.textContent?.trim();
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

  let isEnhancing = false;
  async function enhanceCartLineImages() {
    if (isEnhancing) return;
    isEnhancing = true;
    document.documentElement.dataset.aiCartLineImages = "loading";

    let cart;
    try {
      const response = await fetch("/cart.js", {
        headers: { Accept: "application/json" },
      });
      cart = await readJson(response);
    } catch {
      document.documentElement.dataset.aiCartLineImages = "cart-fetch-failed";
      isEnhancing = false;
      return;
    }

    const aiItems = (cart.items || []).filter(
      (item) => item.properties?.["_AI Image URL"],
    );
    if (!aiItems.length) {
      document.documentElement.dataset.aiCartLineImages = "no-ai-items";
      isEnhancing = false;
      return;
    }

    aiItems.forEach((item, index) => {
      const imageUrl = item.properties["_AI Image URL"];
      const prompt =
        item.properties["AI Prompt"] ||
        item.properties["_AI Prompt"] ||
        "Generated AI image";
      const line = findCartLine(item, index);
      if (!line) return;

      let image = line.querySelector("img");
      if (!image) {
        image = createCartLineImage(line, imageUrl, prompt);
      } else {
        // Strip theme lazy-loading attributes to prevent theme scripts from overwriting our AI image URL
        image.removeAttribute("srcset");
        image.removeAttribute("data-srcset");
        image.removeAttribute("data-src");
        image.removeAttribute("data-lazy");
        image.removeAttribute("data-lazy-src");
        image.sizes = "";
      }

      image.src = imageUrl;
      image.srcset = "";
      image.alt = prompt;
      image.classList.add("aim-cart-line-image");
    });
    document.documentElement.dataset.aiCartLineImages = "ready";
    isEnhancing = false;
  }

  // Intercept global Fetch requests to capture AJAX cart events (e.g. Add to Cart, Cart updates)
  (function (window2, originalFetch) {
    if (typeof originalFetch === "function") {
      window2.fetch = function () {
        return originalFetch
          .apply(this, Array.prototype.slice.call(arguments))
          .then((response) => {
            if (!response.ok) {
              return response;
            }
            const url = arguments[0];
            const urlString = typeof url === "string" ? url : url?.url || "";
            // Crucial: Ignore '/cart.js' itself to prevent infinite loop recursion
            if (
              urlString.includes("/cart") &&
              !urlString.includes("/cart.js")
            ) {
              setTimeout(() => {
                enhanceCartLineImages();
              }, 600);
            }
            return response;
          });
      };
    }
  })(window, window.fetch);

  // Intercept XMLHttpRequest to support themes using AJAX libraries (e.g. jQuery, Cartjs)
  (function (window2, originalOpen) {
    if (typeof originalOpen === "function") {
      XMLHttpRequest.prototype.open = function (method, url) {
        this.addEventListener("load", () => {
          if (url && String(url).includes("/cart")) {
            setTimeout(() => {
              enhanceCartLineImages();
            }, 600);
          }
        });
        return originalOpen.apply(this, arguments);
      };
    }
  })(window, XMLHttpRequest.prototype.open);

  function createCartLineImage(line, imageUrl, prompt) {
    const image = document.createElement("img");
    image.className = "aim-cart-line-image";
    image.src = imageUrl;
    image.alt = prompt;

    const mediaCell =
      line.querySelector(
        ".cart-item__media, .cart__image-wrapper, [class*='media']",
      ) ||
      line.querySelector(
        ".cart-item__details, .cart__meta, [class*='details']",
      ) ||
      line.querySelector("td");
    const productLink =
      line.querySelector("a[href*='/products/']") ||
      line.querySelector(".cart-item__name, [class*='name']");

    if (mediaCell && !mediaCell.querySelector("img")) {
      mediaCell.prepend(image);
      return image;
    }

    if (productLink?.parentElement) {
      productLink.parentElement.insertBefore(image, productLink);
      return image;
    }

    line.prepend(image);
    return image;
  }

  function findCartLine(item, index) {
    const candidates = Array.from(
      document.querySelectorAll(
        "[id^='CartItem-'], .cart-item, .cart-items tr, tr, li, .cart__item",
      ),
    ).filter((candidate) => candidate.textContent?.trim());
    const itemUrl = String(item.url || "").split("?")[0];
    const byUrl = candidates.find((candidate) => {
      return Array.from(candidate.querySelectorAll("a[href]")).some((link) =>
        link.getAttribute("href")?.includes(itemUrl),
      );
    });
    if (byUrl) return byUrl;

    const productTitle = String(item.product_title || item.title || "").trim();
    const byText = candidates.find((candidate) => {
      const text = candidate.textContent || "";
      return (
        (productTitle && text.includes(productTitle)) ||
        text.includes("AI Generated Image") ||
        text.includes("AI Prompt")
      );
    });
    if (byText) return byText;

    return (
      candidates.filter((candidate) => !candidate.querySelector("th"))[index] ||
      null
    );
  }

  function cartProperties(image, variantTitle) {
    const options = image.selectedOptionsOverride || selectedOptionsText(image);
    const prompt = displayPrompt(image);

    const properties = {
      "_AI Image URL": image.imageUrl,
      "_AI Generation ID": image.id,
      "_AI Prompt": image.prompt,
      "_AI Product Variant": variantTitle,
      "_AI Custom Options": options,
      "AI Prompt": prompt,
      "AI Options": options,
      "AI Generated Image": "Selected",
    };

    return Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value),
    );
  }

  function applyCartPropertiesToForm(form, properties) {
    Object.entries(properties).forEach(([name, value]) => {
      setCartProperty(form, name, value);
    });
  }

  async function addGeneratedImageToCart({
    root,
    studioConfig,
    form,
    selectedImage,
  }) {
    const variant = selectedVariant(form);
    const variantId =
      variant.numericId ||
      root.dataset.checkoutVariantId ||
      studioConfig.checkoutVariantId ||
      "";
    const properties = cartProperties(
      selectedImage,
      selectedImage.variantTitle || variant.title,
    );

    if (!variantId) {
      throw new Error(
        "Configure a Shopify checkout variant ID for this custom page.",
      );
    }

    const response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: Number(variantId),
        quantity: 1,
        properties,
      }),
    });

    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(
        data.description ||
          data.message ||
          "Could not add generated image to cart.",
      );
    }

    applyCartPropertiesToForm(form, properties);
  }

  document
    .querySelectorAll("[data-ai-image-generator]")
    .forEach(async (root) => {
      if (root.dataset.aiGeneratorInitialized === "true") return;
      root.dataset.aiGeneratorInitialized = "true";

      const button = root.querySelector("[data-ai-generate]");
      const selectButton = root.querySelector("[data-ai-select]");
      const addToCartButton = root.querySelector("[data-ai-add-to-cart]");
      const textarea = root.querySelector("[data-ai-prompt]");
      const status = root.querySelector("[data-ai-status]");
      const preview = root.querySelector("[data-ai-preview]");
      const previewToggle = root.querySelector("[data-ai-preview-toggle]");
      const publicInput = root.querySelector("[data-ai-public]");
      const optionsRoot = root.querySelector("[data-ai-studio-options]");
      const promptTools = root.querySelector("[data-ai-prompt-tools]");
      const form = productForm(root);
      let selectedImage = null;
      let generatedPreviewHtml = "";
      let generationRequest = null;
      const productPreviewHtml = root.dataset.productImage
        ? `<img src="${root.dataset.productImage}" alt="${escapeHtml(root.dataset.productTitle || "Product image")}"><span>Product image</span>`
        : "";

      const studioConfig = await fetchStudioConfig(root);
      renderStudioOptions(optionsRoot, studioConfig.optionGroups || []);
      renderPromptTools(promptTools, studioConfig.promptTemplates || []);
      prefillPromptFromUrl(textarea);
      prefillOptionsFromUrl(root);
      clearStoredPreview(root);

      promptTools?.addEventListener("click", (event) => {
        const template = event.target.closest("[data-ai-template]");
        if (!template) return;

        const optionSummary = selectedStudioOptions(root)
          .map((option) => `${option.name}: ${option.value}`)
          .join(", ");
        textarea.value = `${template.dataset.aiTemplate}, for ${studioConfig.title || root.dataset.productTitle}, selected options: ${optionSummary}`;
        textarea.focus();
      });

      button.addEventListener("click", async () => {
        if (generationRequest) return;

        const prompt = textarea.value.trim();
        if (!prompt) {
          status.textContent = "Enter an art direction first.";
          return;
        }

        const variant = selectedVariant(form);
        const selectedOptions = selectedStudioOptions(root);
        const optionSummary = selectedOptions
          .map((option) => `${option.name}: ${option.value}`)
          .join(", ");
        const promptWithOptions = `${prompt}\n\nCustom product: ${studioConfig.title || root.dataset.productTitle}. Selected options: ${optionSummary || "Default options"}.`;
        button.disabled = true;
        if (selectButton) selectButton.hidden = true;
        if (addToCartButton) addToCartButton.hidden = true;
        status.textContent = publicInput.checked
          ? "Generating artwork. Community posts will wait for admin approval."
          : "Moderating prompt and generating artwork...";
        preview.classList.add("is-loading");

        try {
          generationRequest = fetch(
            apiUrl(root.dataset.apiBase, "/api/generate-image"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shop: root.dataset.shop,
                productId: root.dataset.productId,
                productHandle: root.dataset.productHandle,
                variantId: variant.id,
                variantTitle: variant.title,
                selectedOptions,
                customerId: root.dataset.customerId,
                customerEmail: root.dataset.customerEmail,
                prompt: promptWithOptions,
                originalPrompt: prompt,
                visibility: publicInput.checked ? "PUBLIC" : "PRIVATE",
                apiBase: root.dataset.apiBase || "/apps/ai-image",
              }),
            },
          );
          const response = await generationRequest;
          const data = await readJson(response);
          if (!data.success)
            throw new Error(data.error || "Image generation failed.");
          if (!data.image) {
            throw new Error("The AI app did not return a preview image.");
          }

          selectedImage = data.generation;
          generatedPreviewHtml = previewImageHtml(data.image, prompt);
          await renderGeneratedPreview(preview, data.image, prompt);
          storePreview(root, {
            generation: selectedImage,
            image: data.image,
            prompt,
          });
          if (previewToggle) previewToggle.hidden = !productPreviewHtml;
          if (previewToggle) setPreviewToggleState(root, "generated");
          if (selectButton) selectButton.hidden = false;
          status.textContent =
            data.generation?.moderationStatus === "PENDING"
              ? "Preview generated. Use this image to save it and request community approval."
              : "Preview generated. Use this image to save it for checkout.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          preview.classList.remove("is-loading");
          button.disabled = false;
          generationRequest = null;
        }
      });

      selectButton?.addEventListener("click", async () => {
        if (!selectedImage) return;

        selectButton.disabled = true;
        status.textContent = "Saving selected image...";

        try {
          if (!selectedImage.id) {
            const response = await fetch(
              apiUrl(root.dataset.apiBase, "/api/customer-images"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  shop: root.dataset.shop,
                  generation: selectedImage,
                  customerId: root.dataset.customerId,
                  customerEmail: root.dataset.customerEmail,
                  intent: "select-cart",
                }),
              },
            );
            const data = await readJson(response);
            if (!data.success) {
              throw new Error(data.error || "Could not save selected image.");
            }
            selectedImage = data.image;
            storePreview(root, {
              generation: selectedImage,
              image: selectedImage.imageUrl,
              prompt: displayPrompt(selectedImage),
            });
          } else {
            const response = await fetch(
              apiUrl(root.dataset.apiBase, "/api/customer-images"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  shop: root.dataset.shop,
                  generationId: selectedImage.id,
                  customerId: root.dataset.customerId,
                  customerEmail: root.dataset.customerEmail,
                }),
              },
            );
            const data = await readJson(response);
            if (!data.success) {
              throw new Error(data.error || "Could not save selected image.");
            }
            selectedImage = data.image;
            storePreview(root, {
              generation: selectedImage,
              image: selectedImage.imageUrl,
              prompt: displayPrompt(selectedImage),
            });
          }

          const properties = cartProperties(
            selectedImage,
            selectedImage.variantTitle || selectedVariant(form).title,
          );
          applyCartPropertiesToForm(form, properties);

          if (addToCartButton) addToCartButton.hidden = false;
          status.textContent =
            "Selected image is saved and attached to this cart item. Add it to cart when ready.";
        } catch (error) {
          status.textContent = error.message;
        } finally {
          selectButton.disabled = false;
        }
      });

      addToCartButton?.addEventListener("click", async () => {
        if (!selectedImage) {
          status.textContent = "Select a generated image first.";
          return;
        }

        addToCartButton.disabled = true;
        status.textContent = "Adding generated image to cart...";

        try {
          await addGeneratedImageToCart({
            root,
            studioConfig,
            form,
            selectedImage,
          });
          window.location.href = "/cart";
        } catch (error) {
          status.textContent = error.message;
          addToCartButton.disabled = false;
        }
      });

      previewToggle?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-ai-view]");
        if (!button) return;

        if (button.dataset.aiView === "product" && productPreviewHtml) {
          preview.innerHTML = productPreviewHtml;
          setPreviewToggleState(root, "product");
        } else {
          preview.innerHTML = generatedPreviewHtml;
          setPreviewToggleState(root, "generated");
        }
      });
    });

  enhanceCartLineImages();

  document.querySelectorAll("[data-ai-gallery]").forEach(async (root) => {
    const grid = root.querySelector("[data-ai-gallery-grid]");
    const [images, studioConfig] = await Promise.all([
      fetchImages(root, "/api/gallery"),
      fetchStudioConfig(root),
    ]);
    grid.innerHTML = renderCards(images, {
      mode: "community",
      optionGroups: studioConfig.optionGroups || [],
    });
    bindImageCardActions(root, grid);
  });

  document.querySelectorAll("[data-ai-user-images]").forEach(async (root) => {
    const grid = root.querySelector("[data-ai-user-images-grid]");
    const images = await fetchImages(root, "/api/customer-images");
    grid.innerHTML = renderCards(images, { mode: "user" });
    bindImageCardActions(root, grid);
  });

  async function fetchImages(root, path) {
    try {
      const params = new URLSearchParams({
        shop: root.dataset.shop || "",
        customerId: root.dataset.customerId || "",
        customerEmail: root.dataset.customerEmail || "",
        productId: root.dataset.productId || "",
      });
      const response = await fetch(
        apiUrl(root.dataset.apiBase, `${path}?${params.toString()}`),
      );
      const data = await readJson(response);
      return data.images || [];
    } catch (error) {
      return [];
    }
  }

  async function fetchStudioConfig(root) {
    const fallback = {
      title: root.dataset.productTitle || "Generate your own image",
      optionGroups: [],
      promptTemplates: [
        "minimal gallery wall, premium print art, soft natural light",
        "bold abstract print, textured brushwork, curated interior styling",
        "calm spiritual artwork, refined color palette, elegant framed print",
      ],
    };

    try {
      const params = new URLSearchParams({ shop: root.dataset.shop || "" });
      const response = await fetch(
        apiUrl(root.dataset.apiBase, `/api/studio-config?${params.toString()}`),
      );
      const data = await readJson(response);
      return data.studioProduct || fallback;
    } catch {
      return fallback;
    }
  }

  function renderStudioOptions(root, groups) {
    if (!root) return;
    if (!groups.length) {
      root.innerHTML = "";
      return;
    }

    root.innerHTML = groups
      .map((group) => {
        const values = Array.isArray(group.values) ? group.values : [];
        return `
          <label class="aim-field">
            <span>${escapeHtml(group.name)}</span>
            <select data-ai-option data-ai-option-name="${escapeHtml(group.name)}" data-ai-option-prompt="${escapeHtml(group.promptLabel || group.name)}">
              ${values
                .map(
                  (value, valueIndex) =>
                    `<option value="${escapeHtml(value)}" ${valueIndex === 0 ? "selected" : ""}>${escapeHtml(value)}</option>`,
                )
                .join("")}
            </select>
          </label>
        `;
      })
      .join("");
  }

  function renderPromptTools(root, templates) {
    if (!root) return;
    root.innerHTML = (templates || [])
      .map(
        (template) =>
          `<button type="button" class="aim-chip" data-ai-template="${escapeHtml(template)}">${escapeHtml(shortTemplateLabel(template))}</button>`,
      )
      .join("");
  }

  function selectedStudioOptions(root) {
    return Array.from(root.querySelectorAll("[data-ai-option]")).map(
      (input) => ({
        name: input.dataset.aiOptionName || "",
        promptLabel:
          input.dataset.aiOptionPrompt || input.dataset.aiOptionName || "",
        value: input.value || "",
      }),
    );
  }

  function selectedOptionsText(image) {
    try {
      const metadata = JSON.parse(image.metadata || "{}");
      return (metadata.selectedOptions || [])
        .map((option) => `${option.name}: ${option.value}`)
        .join(", ");
    } catch {
      return "";
    }
  }

  function displayPrompt(image) {
    try {
      const metadata = JSON.parse(image.metadata || "{}");
      return metadata.originalPrompt || image.prompt || "";
    } catch {
      return image.prompt || "";
    }
  }

  function prefillPromptFromUrl(textarea) {
    if (!textarea || textarea.value.trim()) return;
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("prompt");
    if (prompt) textarea.value = prompt;
  }

  function prefillOptionsFromUrl(root) {
    const params = new URLSearchParams(window.location.search);
    const selectedOptions = params.get("selectedOptions");
    if (!selectedOptions) return;

    const map = {};
    selectedOptions.split(",").forEach((pair) => {
      const [name, value] = pair.split(":").map((part) => part?.trim());
      if (name && value) map[name] = value;
    });

    root.querySelectorAll("[data-ai-option]").forEach((select) => {
      const name = select.dataset.aiOptionName;
      if (name && map[name]) select.value = map[name];
    });
  }

  function shortTemplateLabel(template) {
    const first = String(template || "")
      .split(",")[0]
      .trim();
    return first.length > 24
      ? `${first.slice(0, 21)}...`
      : first || "Prompt idea";
  }

  function renderCards(images, options) {
    if (!images.length)
      return '<p class="aim-empty">No approved AI images yet.</p>';
    return images
      .map((image) => {
        const prompt = displayPrompt(image);
        const imageJson = escapeHtml(JSON.stringify(image));
        const userPublicAction = renderUserPublicAction(image);
        const title = escapeHtml(shortTitle(prompt));

        if (options.mode === "community") {
          return `
  <div class="aim_card_community_main"
       data-generation-id="${image.id}"
       data-ai-image-json="${imageJson}">

    <article class="aim-card aim-card--community">
      <img src="${image.imageUrl}" alt="${title}">

      <div class="aim-card__overlay"></div>

      <div class="aim_card__actions">
        <button
          type="button"
          class="aim-button aim-button--primary aim_view_detail_com"
          data-ai-card-action="details">
          Add to Cart
        </button>
      </div>
    </article>

    <div class="aim-card__title-bottom">
      ${title}
    </div>

  </div>`;
        }

        return `
        <article class="aim-card" data-generation-id="${image.id}" data-ai-image-json="${imageJson}">
          <img src="${image.imageUrl}" alt="${escapeHtml(image.prompt)}">
          <div class="aim-card__body">
            <p>${escapeHtml(prompt)}</p>
            <small>${image.visibility === "PUBLIC" ? "Requested for community" : "Private image"}</small>
            <div class="aim-card__actions">
              <button type="button" class="aim-chip" data-ai-card-action="details">Details</button>
              ${options.mode === "user" ? userPublicAction : ""}
            </div>
          </div>
        </article>
      `;
      })
      .join("");
  }

  function renderUserPublicAction(image) {
    if (image.visibility !== "PUBLIC") {
      return '<button type="button" class="aim-chip" data-ai-card-action="request-public">Request public</button>';
    }

    if (image.moderationStatus === "PENDING") {
      return '<span class="aim-chip aim-chip--static">Pending admin approval</span>';
    }

    if (image.moderationStatus === "APPROVED") {
      return '<span class="aim-chip aim-chip--static">Live in community</span>';
    }

    return '<button type="button" class="aim-chip" data-ai-card-action="request-public">Request again</button>';
  }

  function bindImageCardActions(root, grid) {
    grid.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-ai-card-action]")?.dataset
        .aiCardAction;
      const card = event.target.closest("[data-ai-image-json]");
      if (!action || !card) return;

      const image = JSON.parse(card.dataset.aiImageJson || "{}");
      if (action === "details") {
        const studioConfig = await fetchStudioConfig(root);
        showImageDetails({ root, image, studioConfig });
      }

      if (action === "request-public") {
        await requestPublicImage(root, image, event.target);
      }
    });
  }

  async function requestPublicImage(root, image, button) {
    button.disabled = true;
    try {
      const response = await fetch(
        apiUrl(root.dataset.apiBase, "/api/customer-images"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: root.dataset.shop,
            generationId: image.id,
            customerId: root.dataset.customerId,
            customerEmail: root.dataset.customerEmail,
            intent: "request-public",
          }),
        },
      );
      const result = await readJson(response);
      if (!result.success) throw new Error(result.error || "Request failed.");
      button.outerHTML =
        '<span class="aim-chip aim-chip--static">Pending admin approval</span>';
    } catch (error) {
      button.textContent = error.message;
      button.disabled = false;
    }
  }

  function showImageDetails({ root, image, studioConfig }) {
    const prompt = escapeHtml(displayPrompt(image));
    const options = escapeHtml(
      selectedOptionsText(image) || "No options saved",
    );
    const creator = escapeHtml(
      image.customer?.displayName ||
        image.customer?.email ||
        "Community member",
    );
    const modal = document.createElement("div");
    modal.className = "aim-modal";
    const optionGroups = studioConfig?.optionGroups || [];
    modal.innerHTML = `
      <div class="aim-modal__panel">
        <button type="button" class="aim-modal__close" aria-label="Close">×</button>
        <img src="${image.imageUrl}" alt="${prompt}">
        <h3>${escapeHtml(shortTitle(displayPrompt(image)))}</h3>
        <p class="aim-modal__meta">${creator}</p>
        <p class="aim-modal__prompt">${prompt}</p>
        <p class="aim-modal__options">${options}</p>
        ${
          optionGroups.length
            ? `<div class="aim-modal__pickers">
                ${optionGroups
                  .map((group) => {
                    const values = Array.isArray(group.values)
                      ? group.values
                      : [];
                    return `
                      <label>
                        <span>${escapeHtml(group.name)}</span>
                        <select data-ai-community-option data-ai-option-name="${escapeHtml(group.name)}">
                          ${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}
                        </select>
                      </label>
                    `;
                  })
                  .join("")}
              </div>`
            : ""
        }
        <div class="aim-modal__actions">
          <button type="button" class="aim-button  aim-button--outline" data-ai-modal-action="use">Use this image</button>
          <button type="button" class="aim-button aim-button--filled" data-ai-modal-action="regenerate">Regenerate</button>
        </div>
      </div>
    `;
    modal
      .querySelector("[data-ai-modal-action='use']")
      ?.addEventListener("click", async () => {
        const selectedOptionsOverride =
          selectedCommunityOptions(modal) || selectedOptionsText(image);
        image.selectedOptionsOverride = selectedOptionsOverride;
        await addGeneratedImageToCart({
          root,
          studioConfig,
          form: null,
          selectedImage: image,
        });
        window.location.href = "/cart";
      });
    modal
      .querySelector("[data-ai-modal-action='regenerate']")
      ?.addEventListener("click", () => {
        const selectedOptionsOverride = selectedCommunityOptions(modal);
        const promptValue = displayPrompt(image);
        const url =
          root.dataset.configuratorUrl || "/pages/custom-configurator";
        const params = new URLSearchParams({
          referenceGeneration: image.id,
          prompt: promptValue,
        });
        if (selectedOptionsOverride)
          params.set("selectedOptions", selectedOptionsOverride);
        window.location.href = `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
      });
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(".aim-modal__close"))
        modal.remove();
    });
    document.body.appendChild(modal);
  }

  function selectedCommunityOptions(root) {
    const selections = Array.from(
      root.querySelectorAll("[data-ai-community-option]"),
    )
      .map((input) => `${input.dataset.aiOptionName}: ${input.value}`)
      .filter(Boolean);
    return selections.join(", ");
  }

  function previewImageHtml(imageUrl, prompt) {
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(prompt || "Generated AI image")}"><span>Generated by AI</span>`;
  }

  function previewStorageKey(root) {
    return [
      "aim-preview",
      root.dataset.shop || "",
      root.dataset.productId || root.dataset.productHandle || "product",
    ].join(":");
  }

  function storePreview(root, previewData) {
    try {
      window.sessionStorage?.setItem(
        previewStorageKey(root),
        JSON.stringify(previewData),
      );
    } catch {
      // Preview storage is an enhancement only.
    }
  }

  function clearStoredPreview(root) {
    try {
      window.sessionStorage?.removeItem(previewStorageKey(root));
    } catch {
      // Preview storage is an enhancement only.
    }
  }

  function restoreStoredPreview({
    root,
    preview,
    selectButton,
    previewToggle,
    productPreviewHtml,
    setSelectedImage,
    setGeneratedPreviewHtml,
  }) {
    let saved;
    try {
      saved = JSON.parse(
        window.sessionStorage?.getItem(previewStorageKey(root)) || "null",
      );
    } catch {
      saved = null;
    }

    if (!saved?.generation || !saved?.image) return;

    const html = previewImageHtml(saved.image, saved.prompt);
    setSelectedImage(saved.generation);
    setGeneratedPreviewHtml(html);
    renderGeneratedPreview(preview, saved.image, saved.prompt)
      .then(() => {
        if (previewToggle) previewToggle.hidden = !productPreviewHtml;
        if (previewToggle) setPreviewToggleState(root, "generated");
        if (selectButton) selectButton.hidden = false;
      })
      .catch(() => {
        try {
          window.sessionStorage?.removeItem(previewStorageKey(root));
        } catch {
          // Preview storage is an enhancement only.
        }
      });
  }

  function renderGeneratedPreview(preview, imageUrl, prompt) {
    return new Promise((resolve, reject) => {
      if (!preview) {
        reject(new Error("Preview container was not found."));
        return;
      }

      const image = new Image();
      const badge = document.createElement("span");
      image.alt = prompt || "Generated AI image";
      image.decoding = "async";
      image.loading = "eager";
      badge.textContent = "Generated by AI";

      image.addEventListener(
        "load",
        () => {
          preview.replaceChildren(image, badge);
          resolve();
        },
        { once: true },
      );
      image.addEventListener(
        "error",
        () => {
          reject(
            new Error(
              `Generated image was saved, but the preview URL could not be loaded: ${imageUrl}`,
            ),
          );
        },
        { once: true },
      );

      image.src = imageUrl;
      if (image.complete && image.naturalWidth > 0) {
        preview.replaceChildren(image, badge);
        resolve();
      }
    });
  }

  function shortTitle(prompt) {
    const first = String(prompt || "")
      .split(",")[0]
      .trim();
    return first.length > 24 ? `${first.slice(0, 24)}...` : first || "Artwork";
  }

  function setPreviewToggleState(root, view) {
    root.querySelectorAll("[data-ai-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.aiView === view);
    });
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
