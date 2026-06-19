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

  function toProxyImageUrl(urlStr) {
    if (!urlStr) return urlStr;
    const match = String(urlStr).match(
      /\/ai-generated\/([^/?#]+\.(?:png|jpe?g|webp))/i,
    );
    if (match) {
      return `/apps/ai-image/ai-generated/${match[1]}`;
    }
    return urlStr;
  }

  async function downloadImage(imageUrl, fileName) {
    try {
      const response = await fetch(imageUrl, { mode: "cors" });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = fileName || "artwork.png";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.warn("Secure download failed, falling back to new tab", error);
      const a = document.createElement("a");
      a.href = imageUrl;
      a.target = "_blank";
      a.download = fileName || "artwork.png";
      a.click();
    }
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

  let globalLoadingCount = 0;
  let globalLoadingNode = null;

  function showGlobalLoading(message) {
    globalLoadingCount += 1;
    if (globalLoadingNode) {
      const label = globalLoadingNode.querySelector(
        "[data-ai-loading-message]",
      );
      if (label) label.textContent = message || "Loading...";
      return;
    }
    globalLoadingNode = document.createElement("div");
    globalLoadingNode.className = "aim-global-loading";
    globalLoadingNode.setAttribute("role", "status");
    globalLoadingNode.setAttribute("aria-live", "polite");
    globalLoadingNode.innerHTML = `
      <div class="aim-global-loading__panel">
        <div class="aim-spinner"></div>
        <strong data-ai-loading-message>${escapeHtml(message || "Loading...")}</strong>
        <span>Please wait while we prepare your view.</span>
      </div>`;
    document.body.appendChild(globalLoadingNode);
  }

  function hideGlobalLoading() {
    globalLoadingCount = Math.max(0, globalLoadingCount - 1);
    if (globalLoadingCount > 0 || !globalLoadingNode) return;
    globalLoadingNode.remove();
    globalLoadingNode = null;
  }

  function showActionToast(message) {
    const existing = document.querySelector("[data-ai-action-toast]");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "aim-action-toast";
    toast.dataset.aiActionToast = "true";
    toast.innerHTML = `<div class="aim-spinner" style="width:18px;height:18px;margin:0;border-width:2px"></div><span>${escapeHtml(message || "Working...")}</span>`;
    document.body.appendChild(toast);
    return toast;
  }

  function hideActionToast() {
    document.querySelector("[data-ai-action-toast]")?.remove();
  }

  function showGridLoading(grid, count) {
    if (!grid) return;
    grid.classList.add("aim-grid-loading");
    grid.innerHTML = Array.from(
      { length: count || 6 },
      () => '<div class="aim-grid-loading__card" aria-hidden="true"></div>',
    ).join("");
    grid.setAttribute("aria-busy", "true");
  }

  function renderDetailLoadingHtml(message) {
    return `
      <div class="aim-detail-loading" role="status" aria-live="polite">
        <div class="aim-detail-loading__status">
          <div class="aim-spinner"></div>
          <span>${escapeHtml(message || "Loading artwork details...")}</span>
        </div>
        <div class="aim-detail-loading__layout">
          <div class="aim-detail-loading__media"></div>
          <div class="aim-detail-loading__panel">
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>
      </div>`;
  }

  async function withCardLoading(card, label, task) {
    if (!card) return task();
    card.classList.add("is-loading-card");
    const toast = showActionToast(label || "Loading...");
    try {
      return await task();
    } finally {
      card.classList.remove("is-loading-card");
      hideActionToast();
    }
  }

  async function withActionLoading(target, label, task) {
    if (target?.tagName === "BUTTON") {
      return withButtonLoading(target, label, task);
    }
    if (target?.matches?.("[data-ai-image-json]")) {
      return withCardLoading(target, label, task);
    }
    showGlobalLoading(label || "Loading...");
    try {
      return await task();
    } finally {
      hideGlobalLoading();
    }
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

    const aiItems = (cart.items || []).filter((item) => aiLineImageUrl(item));
    if (!aiItems.length) {
      document.documentElement.dataset.aiCartLineImages = "no-ai-items";
      isEnhancing = false;
      return;
    }

    aiItems.forEach((item, index) => {
      const imageUrl = aiLineImageUrl(item);
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

      image.src = toProxyImageUrl(imageUrl);
      image.srcset = "";
      image.alt = prompt;
      image.classList.add("aim-cart-line-image");
      injectCartRedesignAction(line, item);

      // Apply preview wrapping for customized configurations (frames, matting, aspect-ratio, effects)
      let selections = null;
      try {
        const selectionsStr =
          item.properties?.["_AI Final Selections"] ||
          item.properties?.["_AI Final Options"];
        if (selectionsStr) {
          selections = JSON.parse(selectionsStr);
        }
      } catch {
        selections = null;
      }

      if (selections) {
        let wrapper = image.closest(".aim-cart-preview-container");
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.className = "aim-cart-preview-container";
          image.parentNode.insertBefore(wrapper, image);

          const stage = document.createElement("div");
          stage.className = "aim-preview-stage";

          const frame = document.createElement("div");
          frame.className = "aim-preview-frame";

          const mat = document.createElement("div");
          mat.className = "aim-preview-mat";

          wrapper.appendChild(stage);
          stage.appendChild(frame);
          frame.appendChild(mat);
          mat.appendChild(image);
        }

        wrapper.dataset.aiOrientation = selections.orientation || "square";
        if (selections.size) {
          wrapper.dataset.aiSize = selections.size;
        } else {
          delete wrapper.dataset.aiSize;
        }
        wrapper.dataset.aiFrame = selections.frame || "none";
        wrapper.dataset.aiFrameColor = selections.frameColor || "black";
        wrapper.dataset.aiEffect = selections.effect || "none";
      }
    });
    document.documentElement.dataset.aiCartLineImages = "ready";
    enhanceCartPreviewBlocks();
    isEnhancing = false;
  }

  function enhanceStaticImages() {
    const allLinks = Array.from(
      document.querySelectorAll("a, p, span, td, li, div"),
    );
    allLinks.forEach((el) => {
      const text = el.textContent || "";
      const hasVisibleAiUrl = text.includes("AI Image URL");
      if (el.children.length > 0 && !hasVisibleAiUrl) return;
      if (
        hasVisibleAiUrl ||
        text.includes("/ai-generated/") ||
        text.includes("_AI Image URL")
      ) {
        const match =
          text.match(
            /(https?:\/\/[^\s]+ai-generated[^\s]+\.(?:png|jpe?g|webp))/i,
          ) ||
          text.match(/AI Image URL:\s*(https?:\/\/[^\s]+)/i) ||
          text.match(
            /\/apps\/ai-image\/ai-generated\/[^\s]+\.(?:png|jpe?g|webp)/i,
          );
        const propWrapper = el.closest(
          'li, p, .product-option, [class*="option"], [class*="property"]',
        );
        if (
          text.includes("AI Image URL") ||
          text.includes("AI Image Preview")
        ) {
          if (propWrapper) {
            propWrapper.style.display = "none";
          } else if (!el.children.length) {
            el.style.display = "none";
          }
        }
        if (match) {
          const imageUrl = match[1] || match[0];

          const container = el.closest(
            'tr, li, .order-item, [class*="item"], [class*="line"]',
          );
          if (container) {
            const img = container.querySelector("img");
            if (img) {
              img.src = toProxyImageUrl(imageUrl);
              img.removeAttribute("srcset");
              img.removeAttribute("data-srcset");
              img.sizes = "";

              if (
                window.location.pathname.includes("/order") ||
                window.location.pathname.includes("/account")
              ) {
                img.classList.add("aim-order-line-image");
              } else {
                img.classList.add("aim-cart-line-image");
              }
            }
          }
        }
      }
    });
  }

  function aiLineImageUrl(item) {
    return (
      item?.properties?.["_AI Image URL"] ||
      item?.properties?.["AI Image Preview"] ||
      item?.properties?.["AI Image URL"] ||
      ""
    );
  }

  function parseFinalSelectionsFromProperties(properties) {
    if (!properties) return null;
    const raw =
      properties["_AI Final Selections"] ||
      properties["_AI Final Options"] ||
      properties["AI Final Selections"];
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  function wrapImageInFramedPreview(image, selections) {
    if (!image || !selections) return image;
    const wrapper = document.createElement("div");
    wrapper.className = "aim-cart-preview-container";
    wrapper.dataset.aiOrientation = selections.orientation || "square";
    if (selections.size) wrapper.dataset.aiSize = selections.size;
    wrapper.dataset.aiFrame = selections.frame || "gallery";
    wrapper.dataset.aiFrameColor = selections.frameColor || "white";
    wrapper.dataset.aiEffect = selections.effect || "none";

    const stage = document.createElement("div");
    stage.className = "aim-preview-stage";
    const frame = document.createElement("div");
    frame.className = "aim-preview-frame";
    const mat = document.createElement("div");
    mat.className = "aim-preview-mat";
    mat.appendChild(image);
    frame.appendChild(mat);
    stage.appendChild(frame);
    wrapper.appendChild(stage);
    return wrapper;
  }

  function enhanceCartPreviewBlocks() {
    document.querySelectorAll(".aim-cart-preview__item").forEach((item) => {
      const image = item.querySelector("img");
      if (!image || image.closest(".aim-cart-preview__thumb")) return;

      const selectionsRaw =
        item.dataset.aiFinalSelections ||
        item.querySelector("[data-ai-final-selections]")?.textContent;
      let selections = null;
      if (selectionsRaw) {
        try {
          selections = JSON.parse(selectionsRaw);
        } catch {
          selections = null;
        }
      }

      const thumb = document.createElement("div");
      thumb.className = "aim-cart-preview__thumb";
      const framed = selections
        ? wrapImageInFramedPreview(image.cloneNode(true), selections)
        : image.cloneNode(true);
      thumb.appendChild(framed);
      image.replaceWith(thumb);
    });
  }

  function injectCartRedesignAction(line, item) {
    if (!line || line.querySelector("[data-ai-redesign-cart]")) return;
    const prompt =
      item.properties?.["AI Prompt"] || item.properties?.["_AI Prompt"] || "";
    const generationId = item.properties?.["_AI Generation ID"] || "";
    const button = document.createElement("a");
    button.className = "aim-cart-redesign";
    button.dataset.aiRedesignCart = "true";
    button.textContent = "Redesign image";
    const params = new URLSearchParams();
    if (prompt) params.set("prompt", prompt);
    if (generationId) params.set("referenceGeneration", generationId);
    button.href = `/pages/custom-configurator${params.toString() ? `?${params}` : ""}`;
    const target =
      line.querySelector(
        ".cart-item__details, .cart__meta, [class*='details']",
      ) ||
      line.querySelector("td") ||
      line;
    target.appendChild(button);
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
    image.src = toProxyImageUrl(imageUrl);
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
    const finalOptions = finalSelectionsText(image);
    const selections = metadataFinalSelections(image);
    const imageUrl = toProxyImageUrl(image.imageUrl);
    const previewUrl = absoluteStorefrontUrl(imageUrl);

    const properties = {
      "_AI Image URL": previewUrl,
      "_AI Generation ID": image.id,
      "_AI Prompt": image.prompt,
      "_AI Product Variant": variantTitle,
      "_AI Custom Options": options,
      "_AI Final Options": finalOptions,
      "_AI Final Selections": JSON.stringify(selections),
      "_AI Cart Token": `${image.id || "draft"}-${Date.now()}`,
      "AI Prompt": prompt,
      "AI Options": finalOptions || options,
      "AI Image Preview": previewUrl,
      "AI Generated Image": "Attached",
    };

    return Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value),
    );
  }

  function absoluteStorefrontUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) {
      if (!/^https?:\/\/localhost(?::|\/|$)/i.test(url)) return url;
      const proxyUrl = toProxyImageUrl(url);
      return `${window.location.origin}${proxyUrl.startsWith("/") ? proxyUrl : `/${proxyUrl}`}`;
    }
    return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
  }

  function applyCartPropertiesToForm(form, properties) {
    Object.entries(properties).forEach(([name, value]) => {
      setCartProperty(form, name, value);
    });
  }

  // Extract numeric Shopify variant ID from GID (gid://shopify/ProductVariant/12345) or plain numeric string
  function extractNumericVariantId(value) {
    if (!value) return "";
    const str = String(value);
    const match = str.match(/\/(\d+)$/);
    if (match) return match[1];
    if (/^\d+$/.test(str)) return str;
    return "";
  }

  async function clearExistingAiCartLines() {
    try {
      const response = await fetch("/cart.js", {
        headers: { Accept: "application/json" },
      });
      const cart = await readJson(response);
      const updates = {};
      (cart.items || []).forEach((item) => {
        if (aiLineImageUrl(item)) {
          updates[item.key] = 0;
        }
      });
      if (!Object.keys(updates).length) return;
      await fetch("/cart/update.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ updates }),
      });
    } catch {
      // Cart cleanup is best-effort only.
    }
  }

  async function addGeneratedImageToCart({
    root,
    studioConfig,
    form,
    selectedImage,
  }) {
    const variant = selectedVariant(form);
    // Priority: product form variant > block setting > studio config > image's saved variantId
    const variantId =
      variant.numericId ||
      root.dataset.checkoutVariantId ||
      studioConfig.checkoutVariantId ||
      extractNumericVariantId(selectedImage?.variantId) ||
      "";
    const properties = cartProperties(
      selectedImage,
      selectedImage.variantTitle || variant.title,
    );

    if (!variantId) {
      throw new Error(
        "No product variant found. Please configure a Checkout Variant ID in the block settings, or generate the image from a product page.",
      );
    }

    await clearExistingAiCartLines();

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

      const generateButton = root.querySelector("[data-ai-generate]");
      const textarea = root.querySelector("[data-ai-prompt]");
      const status = root.querySelector("[data-ai-status]");
      const preview = root.querySelector("[data-ai-preview]");
      const form = productForm(root);

      // Wizard UI elements
      const orientationSelectBtns = root.querySelectorAll("[data-ai-orientation-select]");
      const effectSelectBtns = root.querySelectorAll("[data-ai-effect-select]");
      const previewFinaliseBtn = root.querySelector("[data-ai-preview-finalise]");
      const previewEditToggleBtn = root.querySelector("[data-ai-preview-edit-toggle]");
      const previewRegenerateBtn = root.querySelector("[data-ai-preview-regenerate]");
      const editPromptBox = root.querySelector("[data-ai-edit-prompt-box]");
      const tweakPromptTextarea = root.querySelector("[data-ai-tweak-prompt]");
      const tweakGenerateBtn = root.querySelector("[data-ai-tweak-generate]");
      const frameTypeSelect = root.querySelector("[data-ai-frame-type-select]");
      const frameColorGroup = root.querySelector("[data-ai-frame-color-group]");
      const frameColorSelect = root.querySelector("[data-ai-frame-color-select]");
      const editorBackBtn = root.querySelector("[data-ai-editor-back]");
      const checkoutBtn = root.querySelector("[data-ai-checkout-button]");

      let selectedImage = null;
      let draftVariants = [];
      let finalSelections = defaultFinalSelections();
      let generationRequest = null;

      root._setSelectedImage = (img) => {
        selectedImage = img;
        root._selectedImage = img;
      };
      root._setDraftVariants = (vars) => {
        draftVariants = vars;
        root._draftVariants = vars;
      };
      root._setFinalSelections = (sels) => {
        finalSelections = sels;
        root._finalSelections = sels;
      };

      setStudioStep(root, "prompt");

      const studioConfig = await fetchStudioConfig(root);
      prefillPromptFromUrl(textarea);
      prefillOptionsFromUrl(root);

      // Orientation Selector listener
      orientationSelectBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const val = btn.dataset.aiOrientationSelect;
          finalSelections.orientation = val;
          finalSelections.size = defaultSizeForOrientation(val);
          orientationSelectBtns.forEach(b => b.classList.toggle("is-active", b === btn));
        });
      });

      // Effect Selector listener
      effectSelectBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const val = btn.dataset.aiEffectSelect;
          finalSelections.effect = val;
          effectSelectBtns.forEach(b => b.classList.toggle("is-active", b === btn));
        });
      });

      // Generator logic helper
      async function triggerGeneration(promptText, btnElement) {
        if (generationRequest) return;
        
        const finalPrompt = promptText.trim();
        if (!finalPrompt) {
          status.textContent = "Enter an art direction first.";
          return;
        }

        const variant = selectedVariant(form);
        const selectedOptions = [];
        
        // Append chosen effect style to openai prompt
        let promptWithOptions = `${finalPrompt}\n\nCustom product: ${studioConfig.title || root.dataset.productTitle}.`;
        if (finalSelections.effect && finalSelections.effect !== "none") {
          promptWithOptions += ` Style: ${labelize(finalSelections.effect)} style.`;
        }
        if (finalSelections.orientation) {
          promptWithOptions += ` Layout: ${labelize(finalSelections.orientation)} orientation, ${finalSelections.orientation === 'portrait' ? '2:3' : finalSelections.orientation === 'landscape' ? '3:2' : '1:1'} aspect ratio.`;
        }
        promptWithOptions += ` Generate fast low-resolution draft concepts only. Do not apply size, frame, crop, or visual effect choices yet.`;

        const originalText = btnElement.textContent;
        btnElement.disabled = true;
        btnElement.classList.add("is-loading");
        btnElement.textContent = "Generating...";
        
        toggleGeneratorImageSections(root, true);
        setStudioStep(root, "generating");
        status.textContent = "Moderating prompt and generating artwork...";
        
        if (preview) {
          preview.classList.add("is-loading");
          preview.innerHTML = `
            <div class="aim-product-studio__empty aim-product-studio__empty--drafts">
              <div class="aim-spinner"></div>
              <span>Preparing your draft artwork...</span>
            </div>`;
        }

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
                originalPrompt: finalPrompt,
                visibility: "PRIVATE",
                draftCount: 1, // Defaulting to 1 draft for clean large view
                draftQuality: "low",
                draftSize: "1024x1024",
                apiBase: root.dataset.apiBase || "/apps/ai-image",
              }),
            },
          );
          const response = await generationRequest;
          const data = await readJson(response);
          if (!data.success) throw new Error(data.error || "Image generation failed.");
          if (!data.image) throw new Error("The AI app did not return a preview image.");

          const nextVariants = (data.variants || [data.generation]).filter(Boolean);
          root._setDraftVariants(nextVariants);
          root._setSelectedImage(
            mergeImageFinalSelections(
              draftVariants[0],
              finalSelections,
            )
          );
          
          if (tweakPromptTextarea) tweakPromptTextarea.value = finalPrompt;

          await renderGeneratedPreview(
            preview,
            selectedImage.imageUrl || data.image,
            finalPrompt,
          );
          applyPreviewPresentation(preview, finalSelections);
          
          setStudioStep(root, "preview");
          status.textContent = "Artwork generated successfully. Choose to edit, reset, or finalize your frame options.";
        } catch (error) {
          status.textContent = error.message;
          setStudioStep(root, "prompt");
          toggleGeneratorImageSections(root, false);
        } finally {
          if (preview) preview.classList.remove("is-loading");
          btnElement.disabled = false;
          btnElement.classList.remove("is-loading");
          btnElement.textContent = originalText;
          generationRequest = null;
        }
      }

      // Bind generate action
      generateButton.addEventListener("click", () => {
        triggerGeneration(textarea.value, generateButton);
      });

      // Step 2 Action Listeners
      previewFinaliseBtn?.addEventListener("click", () => {
        setStudioStep(root, "editor");
        
        // Render Size Selector dropdown dynamically matching orientation
        renderSizeSelector(root, preview, finalSelections);
        applyPreviewPresentation(preview, finalSelections);
      });

      previewEditToggleBtn?.addEventListener("click", () => {
        if (editPromptBox) {
          editPromptBox.hidden = !editPromptBox.hidden;
        }
      });

      previewRegenerateBtn?.addEventListener("click", () => {
        resetGeneratorState(root);
      });

      tweakGenerateBtn?.addEventListener("click", () => {
        triggerGeneration(tweakPromptTextarea.value, tweakGenerateBtn);
      });

      // Step 3 Frame Type Select
      frameTypeSelect?.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "canvas") {
          if (frameColorGroup) frameColorGroup.hidden = true;
          finalSelections.frame = "none";
          finalSelections.frameColor = "black";
        } else {
          if (frameColorGroup) frameColorGroup.hidden = false;
          finalSelections.frame = "gallery";
          finalSelections.frameColor = frameColorSelect ? frameColorSelect.value : "black";
        }
        applyPreviewPresentation(preview, finalSelections);
        storePreview(root, {
          generation: mergeImageFinalSelections(selectedImage, finalSelections),
          image: selectedImage.imageUrl,
          prompt: displayPrompt(selectedImage),
        });
      });

      // Step 3 Frame Color Select
      frameColorSelect?.addEventListener("change", (e) => {
        finalSelections.frameColor = e.target.value;
        applyPreviewPresentation(preview, finalSelections);
        storePreview(root, {
          generation: mergeImageFinalSelections(selectedImage, finalSelections),
          image: selectedImage.imageUrl,
          prompt: displayPrompt(selectedImage),
        });
      });

      // Step 3 Back Button
      editorBackBtn?.addEventListener("click", () => {
        setStudioStep(root, "preview");
      });

      // Step 3 Checkout Button (Add to Cart)
      checkoutBtn?.addEventListener("click", async () => {
        if (!selectedImage) return;

        const originalText = checkoutBtn.textContent;
        checkoutBtn.disabled = true;
        checkoutBtn.classList.add("is-loading");
        checkoutBtn.textContent = "Adding to cart...";
        status.textContent = "Saving artwork and opening cart...";

        try {
          const finalImageSelection = mergeImageFinalSelections(selectedImage, finalSelections);
          let responseImage = selectedImage;

          // Save the customer image record
          const response = await fetch(
            apiUrl(root.dataset.apiBase, "/api/customer-images"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shop: root.dataset.shop,
                generationId: selectedImage.id || null,
                generation: selectedImage.id ? null : finalImageSelection,
                finalSelections,
                customerId: root.dataset.customerId,
                customerEmail: root.dataset.customerEmail,
                intent: selectedImage.id ? null : "select-cart",
              }),
            },
          );
          const data = await readJson(response);
          if (!data.success) {
            throw new Error(data.error || "Could not save selected image.");
          }
          responseImage = data.image;
          
          storePreview(root, {
            generation: responseImage,
            image: responseImage.imageUrl,
            prompt: displayPrompt(responseImage),
          });

          const properties = cartProperties(
            responseImage,
            responseImage.variantTitle || selectedVariant(form).title,
          );
          applyCartPropertiesToForm(form, properties);

          status.textContent = "Adding custom item to cart...";
          await addGeneratedImageToCart({
            root,
            studioConfig,
            form,
            selectedImage: responseImage,
          });

          status.textContent = "Redirecting to cart...";
          window.location.replace("/cart");
        } catch (error) {
          status.textContent = error.message;
          checkoutBtn.disabled = false;
          checkoutBtn.classList.remove("is-loading");
          checkoutBtn.textContent = originalText;
        }
      });

      // Load stored preview if any
      const savedPreview = getStoredPreview(root);
      if (savedPreview?.generation) {
        selectedImage = savedPreview.generation;
        finalSelections = metadataFinalSelections(selectedImage);
        root._setSelectedImage(selectedImage);
        root._setFinalSelections(finalSelections);
        
        toggleGeneratorImageSections(root, true);
        setStudioStep(root, "preview");
        if (tweakPromptTextarea) tweakPromptTextarea.value = displayPrompt(selectedImage);
        
        await renderGeneratedPreview(preview, selectedImage.imageUrl, displayPrompt(selectedImage));
        applyPreviewPresentation(preview, finalSelections);
      }
    });

  // Size renderer helper
  function renderSizeSelector(root, preview, finalSelections) {
    const sizePlaceholder = root.querySelector("[data-ai-size-placeholder]");
    if (!sizePlaceholder) return;

    const sizes = sizeGroups()[finalSelections.orientation || "portrait"] || [];
    if (!sizes.some(s => s.value === finalSelections.size)) {
      finalSelections.size = sizes[0]?.value || "";
    }

    sizePlaceholder.innerHTML = `
      <label class="aim-select-field">
        <span>Dimensions</span>
        <select data-ai-size-select>
          ${sizes.map(size => `
            <option value="${size.value}" ${size.value === finalSelections.size ? "selected" : ""}>
              ${size.label}
            </option>
          `).join("")}
        </select>
      </label>
    `;

    const sizeSelect = sizePlaceholder.querySelector("[data-ai-size-select]");
    sizeSelect?.addEventListener("change", (e) => {
      finalSelections.size = e.target.value;
      applyPreviewPresentation(preview, finalSelections);
    });
  }

  enhanceCartLineImages();
  enhanceStaticImages();
  setTimeout(enhanceStaticImages, 500);
  setTimeout(enhanceStaticImages, 1500);
  window.addEventListener("pageshow", (event) => {
    resetTransientLoadingState();
    document
      .querySelectorAll("[data-ai-gallery].is-detail-active")
      .forEach((root) => {
        root.classList.remove("is-detail-active");
        root.querySelector("[data-ai-community-detail]")?.remove();
        const sectionHead = directCommunityChild(root, ".aim-section-head");
        const grid = directCommunityChild(root, "[data-ai-gallery-grid]");
        [sectionHead, grid].forEach((element) => {
          if (!element) return;
          element.hidden = false;
          element.style.display = "";
        });
      });
    document.querySelectorAll("[data-ai-image-generator]").forEach((root) => {
      if (
        event.persisted &&
        root.dataset.aiStudioStep === "editor" &&
        !root._userEditing
      ) {
        resetGeneratorState(root);
      }
    });
  });

  document.querySelectorAll("[data-ai-gallery]").forEach(async (root) => {
    const grid = root.querySelector("[data-ai-gallery-grid]");
    const isGeneratorCommunity = root.classList.contains(
      "aim-generator-community",
    );
    const isPinterest = root.classList.contains("aim-pinterest-gallery");
    const isImageOnlyGallery = isGeneratorCommunity || isPinterest;
    showGridLoading(grid, isImageOnlyGallery ? 8 : 6);
    let images = [];
    let studioConfig = {
      optionGroups: [],
      editorOptions: defaultEditorOptions(),
    };
    try {
      [images, studioConfig] = await Promise.all([
        fetchImages(
          root,
          isGeneratorCommunity ? "/api/customer-images" : "/api/gallery",
        ),
        fetchStudioConfig(root),
      ]);
    } finally {
      grid?.classList.remove("aim-grid-loading");
      grid?.removeAttribute("aria-busy");
    }
    grid?.classList.toggle("aim-moodboard-grid", !isImageOnlyGallery);
    grid?.classList.toggle("aim-inspiration-masonry", isImageOnlyGallery);
    grid?.classList.toggle(
      "aim-pinterest-grid",
      isPinterest || isGeneratorCommunity,
    );
    const galleryMode = isGeneratorCommunity
      ? "inspiration"
      : isPinterest
        ? "pinterest"
        : "community";
    grid.innerHTML = renderCards(images, {
      mode: galleryMode,
      optionGroups: studioConfig.optionGroups || [],
    });
    const generatorRoot = document.querySelector("[data-ai-image-generator]");
    if (generatorRoot && isGeneratorCommunity) {
      bindGeneratorCommunityActions(generatorRoot, root, grid);
    } else {
      bindImageCardActions(root, grid);
    }
  });

  document.querySelectorAll("[data-ai-user-images]").forEach(async (root) => {
    const grid = root.querySelector("[data-ai-user-images-grid]");
    showGridLoading(grid, 8);
    let images = [];
    try {
      images = await fetchImages(root, "/api/customer-images");
    } finally {
      grid?.classList.remove("aim-grid-loading");
      grid?.removeAttribute("aria-busy");
    }
    grid?.classList.add(
      "aim-library-grid",
      "aim-pinterest-grid",
      "aim-inspiration-masonry",
    );
    grid.innerHTML = renderCards(images, { mode: "user" });
    bindImageCardActions(root, grid);
  });

  document.querySelectorAll("[data-ai-reviews]").forEach(async (root) => {
    const list = root.querySelector("[data-ai-review-list]");
    const form = root.querySelector("[data-ai-review-form]");
    const imageSelect = root.querySelector("[data-ai-review-image]");
    const status = root.querySelector("[data-ai-review-status]");

    if (list) {
      list.innerHTML = `<p class="aim-empty"><span class="aim-spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></span> Loading reviews...</p>`;
    }
    const [reviews, images] = await Promise.all([
      fetchReviews(root),
      fetchImages(root, "/api/customer-images"),
    ]);

    if (list) list.innerHTML = renderReviews(reviews);
    if (imageSelect) {
      imageSelect.innerHTML = renderReviewImageOptions(images);
      form.hidden = !images.length;
    }

    form?.querySelectorAll("[data-ai-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        const rating = Number(button.dataset.aiRating) || 5;
        const input = form.querySelector("input[name='rating']");
        if (input) input.value = String(rating);
        form.querySelectorAll("[data-ai-rating]").forEach((star) => {
          star.classList.toggle(
            "is-active",
            Number(star.dataset.aiRating) <= rating,
          );
        });
      });
      button.addEventListener("mouseenter", () => {
        const rating = Number(button.dataset.aiRating) || 5;
        form.querySelectorAll("[data-ai-rating]").forEach((star) => {
          star.classList.toggle(
            "is-active",
            Number(star.dataset.aiRating) <= rating,
          );
        });
      });
    });
    form
      ?.querySelector("[data-ai-star-input]")
      ?.addEventListener("mouseleave", () => {
        const rating =
          Number(form.querySelector("input[name='rating']")?.value) || 5;
        form.querySelectorAll("[data-ai-rating]").forEach((star) => {
          star.classList.toggle(
            "is-active",
            Number(star.dataset.aiRating) <= rating,
          );
        });
      });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector("[type='submit']");
      await withButtonLoading(submitButton, "Submitting...", async () => {
        if (status) status.textContent = "Submitting review...";
        const formData = new FormData(form);
        try {
          const response = await fetch(
            apiUrl(root.dataset.apiBase, "/api/image-interactions"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shop: root.dataset.shop,
                customerId: root.dataset.customerId,
                customerEmail: root.dataset.customerEmail,
                generationId: formData.get("generationId"),
                rating: formData.get("rating"),
                comment: formData.get("comment"),
                intent: "review:create",
              }),
            },
          );
          const result = await readJson(response);
          if (!result.success) {
            throw new Error(result.error || "Review could not be submitted.");
          }
          form.reset();
          if (status)
            status.textContent = result.message || "Review submitted.";
          const newReviews = await fetchReviews(root);
          if (list) list.innerHTML = renderReviews(newReviews);
        } catch (error) {
          if (status) status.textContent = error.message;
        }
      });
    });
  });

  enhanceCartPreviewBlocks();

  async function fetchImages(root, path) {
    try {
      const params = new URLSearchParams({
        shop: root.dataset.shop || "",
        customerId: root.dataset.customerId || "",
        customerEmail: root.dataset.customerEmail || "",
        productId: root.dataset.productId || "",
        take: root.dataset.itemsLimit || "",
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

  async function loadGeneratorRecentImages({
    root,
    preview,
    textarea,
    studioConfig,
    setSelectedImage,
    setFinalSelections,
  }) {
    if (root.dataset.aiShowRecentImages !== "true") return;
    const images = await fetchImages(root, "/api/customer-images");
    const recentImages = images.slice(0, 12);
    if (!recentImages.length) {
      toggleGeneratorImageSections(root, false);
      return;
    }
    root._recentImages = recentImages;
    toggleGeneratorImageSections(root, false);
    setStudioStep(root, "prompt");
  }

  function toggleGeneratorImageSections(root, visible) {
    const emptyPanel = root.querySelector("[data-ai-empty-panel]");
    const previewContainer = root.querySelector("[data-ai-preview-container]");
    if (emptyPanel) emptyPanel.hidden = visible;
    if (previewContainer) previewContainer.hidden = !visible;
  }

  async function fetchReviews(root) {
    try {
      const params = new URLSearchParams({
        shop: root.dataset.shop || "",
        productId: root.dataset.productId || "",
        take: root.dataset.itemsLimit || "",
      });
      const response = await fetch(
        apiUrl(root.dataset.apiBase, `/api/image-interactions?${params}`),
      );
      const data = await readJson(response);
      return data.reviews || [];
    } catch {
      return [];
    }
  }

  async function fetchStudioConfig(root) {
    if (root && root._studioConfig) {
      return root._studioConfig;
    }
    const fallback = {
      title: root?.dataset?.productTitle || "Generate your own image",
      optionGroups: [],
      editorOptions: defaultEditorOptions(),
      promptTemplates: [
        "minimal gallery wall, premium print art, soft natural light",
        "bold abstract print, textured brushwork, curated interior styling",
        "calm spiritual artwork, refined color palette, elegant framed print",
      ],
    };

    try {
      const params = new URLSearchParams({ shop: root?.dataset?.shop || "" });
      const response = await fetch(
        apiUrl(
          root?.dataset?.apiBase,
          `/api/studio-config?${params.toString()}`,
        ),
      );
      const data = await readJson(response);
      const config = data.studioProduct || fallback;
      if (root) root._studioConfig = config;
      return config;
    } catch {
      return fallback;
    }
  }

  function renderStudioOptions(root, groups) {
    if (!root) return;
    if (!groups.length) {
      root.innerHTML = renderDefaultPromptOptions();
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

  function renderDefaultPromptOptions() {
    return `
      <label class="aim-field">
        <span>Style</span>
        <select data-ai-option data-ai-option-name="Style" data-ai-option-prompt="Style">
          <option value="Realistic" selected>Realistic</option>
          <option value="Watercolor">Watercolor</option>
          <option value="Abstract">Abstract</option>
          <option value="Minimal">Minimal</option>
        </select>
      </label>
      <label class="aim-field">
        <span>Mood</span>
        <select data-ai-option data-ai-option-name="Mood" data-ai-option-prompt="Mood">
          <option value="Calm" selected>Calm</option>
          <option value="Warm">Warm</option>
          <option value="Dramatic">Dramatic</option>
          <option value="Playful">Playful</option>
        </select>
      </label>
      <fieldset class="aim-option-fieldset">
        <legend>Color Palette</legend>
        <div class="aim-color-options">
          ${[
            ["warm neutral", "#ead8b9"],
            ["olive and cream", "#78865b"],
            ["blue gray", "#4f6f7f"],
            ["soft gray", "#9ea5a9"],
            ["charcoal", "#3b3d40"],
          ]
            .map(
              ([value, color], index) => `
                <label class="aim-color-swatch ${index === 0 ? "is-active" : ""}">
                  <input type="radio" name="ai-color-palette" value="${escapeHtml(value)}" data-ai-option data-ai-option-name="Color Palette" data-ai-option-prompt="Color palette" ${index === 0 ? "checked" : ""}>
                  <span style="--aim-swatch:${escapeHtml(color)}"></span>
                </label>`,
            )
            .join("")}
        </div>
      </fieldset>
      <fieldset class="aim-option-fieldset">
        <legend>Aspect Ratio</legend>
        <div class="aim-aspect-options">
          ${[
            ["1:1", "Square"],
            ["4:3", "Classic"],
            ["3:2", "Landscape"],
            ["16:9", "Wide"],
            ["9:16", "Portrait"],
          ]
            .map(
              ([value, label], index) => `
                <label class="aim-aspect-option ${index === 0 ? "is-active" : ""}">
                  <input type="radio" name="ai-aspect-ratio" value="${escapeHtml(value)}" data-ai-option data-ai-option-name="Aspect Ratio" data-ai-option-prompt="Aspect ratio" ${index === 0 ? "checked" : ""}>
                  <span>${escapeHtml(value)}</span>
                  <small>${escapeHtml(label)}</small>
                </label>`,
            )
            .join("")}
        </div>
      </fieldset>
    `;
  }

  function renderPromptTools(root, templates) {
    if (!root) return;
    const promptIdeas = (templates || []).length
      ? templates
      : [
          "Serene mountain retreat with soft morning light",
          "Minimal gallery wall with neutral botanical artwork",
          "Warm living room artwork in earthy tones",
          "Coastal abstract print with calm natural colors",
        ];
    root.innerHTML = promptIdeas
      .map(
        (template) =>
          `<button type="button" class="aim-chip aim-prompt-card" data-ai-template="${escapeHtml(template)}">
            <span>${escapeHtml(shortTemplateLabel(template))}</span>
          </button>`,
      )
      .join("");
  }

  function selectedStudioOptions(root) {
    return Array.from(root.querySelectorAll("[data-ai-option]"))
      .filter((input) => {
        if (input.type === "radio" || input.type === "checkbox") {
          return input.checked;
        }
        return true;
      })
      .map((input) => ({
        name: input.dataset.aiOptionName || "",
        promptLabel:
          input.dataset.aiOptionPrompt || input.dataset.aiOptionName || "",
        value: input.value || "",
      }));
  }

  function draftSizeFromOptions(options) {
    const aspect = (options || []).find(
      (option) => option.name === "Aspect Ratio",
    )?.value;
    return (
      {
        "1:1": "1024x1024",
        "4:3": "1536x1024",
        "3:2": "1536x1024",
        "16:9": "1536x1024",
        "9:16": "1024x1536",
      }[aspect] || "1024x1024"
    );
  }

  function selectedOptionsText(image) {
    try {
      const metadata = JSON.parse(image.metadata || "{}");
      const savedOptions = (metadata.selectedOptions || [])
        .map((option) => `${option.name}: ${option.value}`)
        .join(", ");
      return finalSelectionsText(image) || savedOptions;
    } catch {
      return "";
    }
  }

  function finalSelectionsText(image) {
    const selections = metadataFinalSelections(image);
    const parts = [
      selections.size ? `Size: ${sizeLabel(selections.size)}` : "Size: Free",
      selections.orientation
        ? `Orientation: ${labelize(selections.orientation)}`
        : "",
      selections.frame && selections.frame !== "none"
        ? `Frame: ${labelize(selections.frame)}`
        : "Frame: None",
      selections.frameColor && selections.frame !== "none"
        ? `Frame color: ${labelize(selections.frameColor)}`
        : "",
      selections.effect && selections.effect !== "none"
        ? `Effect: ${labelize(selections.effect)}`
        : "Effect: None",
    ].filter(Boolean);
    return parts.join(", ");
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
      if (!name || !map[name]) return;
      if (select.type === "radio" || select.type === "checkbox") {
        select.checked = select.value === map[name];
      } else {
        select.value = map[name];
      }
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
    if (!images.length) {
      const msg =
        options && options.mode === "user"
          ? "No generated AI images yet."
          : options &&
              (options.mode === "inspiration" || options.mode === "pinterest")
            ? "Generate your first artwork to see it here."
            : "No approved AI images yet.";
      return `<p class="aim-empty">${msg}</p>`;
    }
    if (options.mode === "community") {
      return renderMoodboardCards(images);
    }

    if (options.mode === "inspiration" || options.mode === "pinterest") {
      return renderInspirationImages(images, options.mode);
    }

    if (options.mode === "user") {
      return renderUserGalleryImages(images);
    }

    return "";
  }

  function renderMoodboardCards(images) {
    return groupImagesByCreator(images)
      .map((group) => {
        const lead = group[0];
        const prompt = displayPrompt(lead);
        const imageJson = escapeHtml(
          JSON.stringify({ ...lead, groupedImages: group }),
        );
        const creator = escapeHtml(
          lead.customer?.displayName ||
            lead.customer?.email?.split("@")[0] ||
            "orvella.creator",
        );
        const creatorId = escapeHtml(
          lead.customer?.shopifyCustomerId || lead.customerId || "",
        );
        const title = escapeHtml(shortTitle(prompt));
        const tags = moodboardTags(lead);
        const mosaicCount = Math.min(group.length, 4);
        return `
          <article class="aim-moodboard-card"
            data-generation-id="${escapeHtml(lead.id)}"
            data-ai-creator-id="${creatorId}"
            data-ai-image-json="${imageJson}"
            data-ai-card-action="details">
            <div class="aim-moodboard-card__user">
              <span>${escapeHtml(creatorInitial(creator))}</span>
              <strong>@${creator}</strong>
            </div>
            <div class="aim-moodboard-card__mosaic aim-moodboard-card__mosaic--${mosaicCount}">
              ${group
                .slice(0, 4)
                .map(
                  (image, index) => `
                    <img class="aim-moodboard-card__image-${index + 1}" src="${escapeHtml(toProxyImageUrl(image.imageUrl))}" alt="${escapeHtml(displayPrompt(image) || "Generated artwork")}" loading="lazy">
                  `,
                )
                .join("")}
            </div>
            <div class="aim-moodboard-card__meta">
              <strong>${title}</strong>
              <span>${group.length} artwork${group.length === 1 ? "" : "s"}</span>
            </div>
            <div class="aim-moodboard-card__tags">
              ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function groupImagesByCreator(images) {
    const groups = new Map();
    images.forEach((image) => {
      const key =
        image.customer?.shopifyCustomerId ||
        image.customer?.email ||
        image.customerId ||
        image.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(image);
    });
    return Array.from(groups.values());
  }

  function renderUserGalleryImages(images) {
    return images
      .map((image) => {
        const imageJson = escapeHtml(JSON.stringify(image));
        const badge = renderCommunityBadge(image);
        return `
          <article class="aim-inspiration-card aim-user-gallery-card" data-generation-id="${escapeHtml(image.id)}" data-ai-image-json="${imageJson}" data-ai-card-action="details">
            <img src="${escapeHtml(toProxyImageUrl(image.imageUrl))}" alt="${escapeHtml(displayPrompt(image) || "Your artwork")}" loading="lazy">
            ${badge}
            <button type="button" class="aim-card-download-btn" data-ai-card-action="download" title="Download image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <div class="aim-inspiration-card__actions">
              <button type="button" data-ai-card-action="details">View Details</button>
              ${image.visibility !== "PUBLIC" || image.moderationStatus !== "APPROVED" ? '<button type="button" data-ai-card-action="request-public">Request public</button>' : ""}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderCommunityBadge(image) {
    if (
      image.visibility === "PUBLIC" &&
      image.moderationStatus === "APPROVED"
    ) {
      return '<span class="aim-image-badge aim-image-badge--live">Live in community</span>';
    }
    if (image.visibility === "PUBLIC" && image.moderationStatus === "PENDING") {
      return '<span class="aim-image-badge aim-image-badge--pending">Pending approval</span>';
    }
    return '<span class="aim-image-badge aim-image-badge--private">Private</span>';
  }

  function renderInspirationImages(images, mode) {
    return images
      .map((image) => {
        const imageJson = escapeHtml(JSON.stringify(image));
        const prompt = escapeHtml(displayPrompt(image) || "Generated artwork");
        const communityLabel =
          mode === "pinterest" ? "View community" : "Go to community";
        return `
          <article class="aim-inspiration-card" data-generation-id="${escapeHtml(image.id)}" data-ai-image-json="${imageJson}">
            <img src="${escapeHtml(toProxyImageUrl(image.imageUrl))}" alt="${prompt}" loading="lazy">
            <div class="aim-inspiration-card__actions">
              <button type="button" data-ai-card-action="community">${communityLabel}</button>
              <button type="button" data-ai-card-action="preview">Use for preview</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function chunkImages(images, size) {
    const chunks = [];
    for (let index = 0; index < images.length; index += size) {
      chunks.push(images.slice(index, index + size));
    }
    return chunks;
  }

  function moodboardTags(image) {
    const selections = metadataFinalSelections(image);
    return [
      selections.effect && selections.effect !== "none"
        ? labelize(selections.effect)
        : "Artwork",
      selections.orientation ? labelize(selections.orientation) : "Custom",
      selections.frame && selections.frame !== "none"
        ? labelize(selections.frame)
        : "Frameless",
    ].slice(0, 3);
  }

  function creatorInitial(name) {
    return (
      String(name || "O")
        .trim()
        .charAt(0)
        .toUpperCase() || "O"
    );
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

  function renderReviews(reviews) {
    if (!reviews.length) {
      return '<p class="aim-empty">No approved reviews yet.</p>';
    }

    return reviews
      .map((review) => {
        const prompt = displayPrompt(review.image || {});
        const body = String(review.body || "");
        const isReply = body.startsWith("Reply to ");
        return `
          <article class="aim-review ${isReply ? "is-reply" : ""}">
            <img src="${escapeHtml(toProxyImageUrl(review.image?.imageUrl || ""))}" alt="${escapeHtml(prompt || "Generated image")}" loading="lazy">
            <div>
              <div class="aim-stars">${"★".repeat(Number(review.rating) || 5)}</div>
              <strong>${escapeHtml(review.customer?.displayName || "Customer")}</strong>
              <p>${escapeHtml(body)}</p>
              <small>${escapeHtml(shortTitle(prompt))}</small>
              <button type="button" class="aim-review-reply" data-ai-review-reply="${escapeHtml(review.customer?.displayName || "Customer")}">Reply</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderReviewImageOptions(images) {
    if (!images.length) {
      return '<option value="">Generate an image before reviewing</option>';
    }

    return images
      .map(
        (image) =>
          `<option value="${escapeHtml(image.id)}">${escapeHtml(shortTitle(displayPrompt(image)))}</option>`,
      )
      .join("");
  }

  function bindImageCardActions(root, grid) {
    if (grid._actionsBound) return;
    grid._actionsBound = true;
    grid.addEventListener("click", async (event) => {
      const actionEl = event.target.closest("[data-ai-card-action]");
      const action = actionEl?.dataset.aiCardAction;
      const card = event.target.closest("[data-ai-image-json]");
      if (!card) return;

      const image = JSON.parse(card.dataset.aiImageJson || "{}");

      if (action === "community") {
        const communityUrl =
          root.dataset.communityUrl ||
          root.dataset.configuratorUrl ||
          "/pages/community-gallery";
        window.location.href = communityUrl;
        return;
      }

      if (action === "preview") {
        await withActionLoading(
          actionEl?.tagName === "BUTTON" ? actionEl : card,
          "Opening editor...",
          () => useImageInGeneratorOrCart(root, image),
        );
        return;
      }

      if (action === "request-public") {
        await withButtonLoading(actionEl, "Requesting...", () =>
          requestPublicImage(root, image, actionEl),
        );
        return;
      }

      if (action === "download") {
        event.stopPropagation();
        const fileName = `${image.id || "artwork"}.png`;
        const imageUrl = image.imageUrl;
        if (imageUrl) {
          await withButtonLoading(actionEl, "Downloading...", async () => {
            await downloadImage(imageUrl, fileName);
          });
        }
        return;
      }

      if (action === "details" || card.dataset.aiCardAction === "details") {
        if (
          event.target.closest(".aim-inspiration-card__actions") &&
          action !== "details"
        )
          return;
        const button = actionEl?.tagName === "BUTTON" ? actionEl : null;
        const task = async () => {
          const studioConfig = await fetchStudioConfig(root);
          const creatorId =
            card.dataset.aiCreatorId ||
            image.customer?.shopifyCustomerId ||
            image.customerId;
          let creatorImages = image.groupedImages || [];
          if (creatorId && !creatorImages.length) {
            const fetched = await fetchCreatorImages(root, creatorId);
            if (fetched.length) creatorImages = fetched;
          }
          await showImageDetails({
            root,
            image: { ...image, groupedImages: creatorImages },
            studioConfig,
          });
        };
        if (button) {
          await withButtonLoading(button, "Opening...", task);
        } else {
          await withCardLoading(card, "Loading details...", task);
        }
      }
    });
  }

  async function useImageInGeneratorOrCart(root, image) {
    const generator = document.querySelector("[data-ai-image-generator]");
    if (generator) {
      await applyImageToGenerator(generator, image);
      return;
    }

    const configuratorUrl = root.dataset.configuratorUrl;
    if (configuratorUrl) {
      const params = new URLSearchParams({
        referenceGeneration: image.id || "",
        prompt: displayPrompt(image),
      });
      window.location.href = `${configuratorUrl}${configuratorUrl.includes("?") ? "&" : "?"}${params.toString()}`;
      return;
    }

    const studioConfig = await fetchStudioConfig(root);
    await addGeneratedImageToCart({
      root,
      studioConfig,
      form: null,
      selectedImage: image,
    });
    window.location.href = "/cart";
  }

  async function applyImageToGenerator(generatorRoot, image) {
    const preview = generatorRoot.querySelector("[data-ai-preview]");
    const selectButton = generatorRoot.querySelector("[data-ai-select]");
    const textarea = generatorRoot.querySelector("[data-ai-prompt]");
    let variants = [];
    if (
      generatorRoot._draftVariants &&
      generatorRoot._draftVariants.length >= 2
    ) {
      const generated = generatorRoot._draftVariants.slice(0, 2);
      variants = [...generated, image];
    } else {
      variants = image.groupedImages?.length ? image.groupedImages : [image];
    }
    const currentSelections =
      generatorRoot._finalSelections || defaultFinalSelections();
    const nextImage = mergeImageFinalSelections(image, currentSelections);
    generatorRoot._userEditing = true;
    if (selectButton) selectButton.hidden = false;
    if (textarea) textarea.value = displayPrompt(image);
    generatorRoot._setSelectedImage(nextImage);
    generatorRoot._setDraftVariants(variants);
    generatorRoot._setFinalSelections(currentSelections);
    setStudioStep(generatorRoot, "editor");
    toggleGeneratorImageSections(generatorRoot, true);
    if (preview) {
      applyPreviewPresentation(preview, currentSelections);
      await renderGeneratedPreview(
        preview,
        image.imageUrl,
        displayPrompt(image),
      ).catch((err) => {
        console.warn("Preview image load failed", err);
      });
    }
    const studioConfig = await fetchStudioConfig(generatorRoot);
    renderDraftEditor({
      root: generatorRoot,
      variants,
      selectedImage: nextImage,
      finalSelections: currentSelections,
      preview,
      prompt: displayPrompt(image),
      editorOptions: studioConfig.editorOptions,
      setSelectedImage(nextImg) {
        generatorRoot._setSelectedImage(nextImg);
      },
      setFinalSelections(nextSels) {
        generatorRoot._setFinalSelections(nextSels);
      },
    });
    generatorRoot.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindGeneratorCommunityActions(generatorRoot, galleryRoot, grid) {
    if (grid._generatorCommunityActionsBound) return;
    grid._generatorCommunityActionsBound = true;
    grid.addEventListener("click", async (event) => {
      const actionEl = event.target.closest("[data-ai-card-action]");
      const card = event.target.closest("[data-ai-image-json]");
      if (!card) return;

      const image = JSON.parse(card.dataset.aiImageJson || "{}");
      if (!image.imageUrl) return;
      const action = actionEl?.dataset.aiCardAction;

      if (action === "community") {
        const communityUrl =
          galleryRoot.dataset.communityUrl ||
          galleryRoot.dataset.configuratorUrl ||
          "/pages/community-gallery";
        window.location.href = communityUrl;
        return;
      }

      if (action === "preview") {
        generatorRoot._userEditing = true;
        await withButtonLoading(actionEl, "Loading preview...", () =>
          applyImageToGenerator(generatorRoot, image),
        );
        return;
      }
    });
  }

  async function fetchCreatorImages(root, creatorId) {
    try {
      const params = new URLSearchParams({
        shop: root.dataset.shop || "",
        creatorId: creatorId || "",
        take: root.dataset.itemsLimit || "40",
      });
      const response = await fetch(
        apiUrl(root.dataset.apiBase, `/api/gallery?${params.toString()}`),
      );
      const data = await readJson(response);
      return data.images || [];
    } catch {
      return [];
    }
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

  async function showImageDetails({ root, image, studioConfig }) {
    return renderInlineImageDetails({ root, image, studioConfig });
  }

  async function renderInlineImageDetails({ root, image, studioConfig }) {
    const groupedImages =
      Array.isArray(image.groupedImages) && image.groupedImages.length
        ? image.groupedImages
        : [image];
    const initialImage = image || groupedImages[0];
    let activeImage = initialImage;
    const prompt = escapeHtml(displayPrompt(activeImage));
    const options = escapeHtml(
      selectedOptionsText(activeImage) || "No options saved",
    );
    const creator = escapeHtml(
      activeImage.customer?.displayName ||
        activeImage.customer?.email?.split("@")[0] ||
        "Community member",
    );
    let detail = root.querySelector("[data-ai-community-detail]");
    if (!detail) {
      detail = document.createElement("div");
      detail.className = "aim-community-detail";
      detail.dataset.aiCommunityDetail = "true";
      root.insertBefore(detail, root.firstElementChild);
    }

    setCommunityDetailActive(root, true);
    detail.hidden = false;
    detail.innerHTML = renderDetailLoadingHtml("Loading artwork details...");
    window.requestAnimationFrame(() => {
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    detail.dataset.aiActiveImageId = activeImage.id;
    const isOwnImage =
      !!root.closest("[data-ai-user-images]") ||
      (root.dataset.customerId &&
        String(image.customerId) === String(root.dataset.customerId)) ||
      (root.dataset.customerId &&
        image.customer?.shopifyCustomerId &&
        String(image.customer.shopifyCustomerId).includes(
          String(root.dataset.customerId),
        ));

    const optionGroups = studioConfig?.optionGroups || [];

    const hasGenerator = !!document.querySelector("[data-ai-image-generator]");
    const useBtnLabel = hasGenerator ? "Use for preview" : "Use this image";

    detail.innerHTML = `
      <div class="aim-community-detail__nav">
        <button type="button" class="aim-button aim-button--outline" data-ai-detail-back>Back to gallery</button>
      </div>
      <div class="aim-community-detail__layout">
        <div class="aim-community-detail__media">
          <img src="${escapeHtml(toProxyImageUrl(activeImage.imageUrl))}" alt="${prompt}" data-ai-detail-main-image>
          <button type="button" class="aim-image-zoom-button" data-ai-detail-zoom>View larger</button>
        </div>
        <div class="aim-community-detail__panel">
          <p class="aim-eyebrow">Creator profile</p>
          <h2 class="aim-heading" data-ai-detail-title>${escapeHtml(shortTitle(displayPrompt(activeImage)))}</h2>
          <p class="aim-modal__meta">@${creator}</p>
          <p class="aim-modal__prompt" data-ai-detail-prompt>${prompt}</p>
          <p class="aim-modal__options" data-ai-detail-options>${options}</p>
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
            <button type="button" class="aim-button aim-button--outline" data-ai-detail-action="use">${useBtnLabel}</button>
            <button type="button" class="aim-button aim-button--filled" data-ai-detail-action="regenerate">Regenerate similar</button>
            ${
              isOwnImage
                ? `
              <button type="button" class="aim-button aim-button--outline" data-ai-detail-action="download" style="grid-column: span 2; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Artwork
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>
      ${
        groupedImages.length > 1
          ? `<section class="aim-creator-gallery">
              <div class="aim-section-head">
                <div>
                  <p class="aim-eyebrow">All artworks</p>
                  <h3>${groupedImages.length} images by @${creator}</h3>
                </div>
              </div>
              <div class="aim-creator-gallery__grid" data-ai-creator-grid>
                ${groupedImages
                  .map(
                    (item, index) => `
                      <button type="button" class="aim-creator-gallery__item ${item.id === activeImage.id ? "is-active" : ""}" data-ai-creator-index="${index}" aria-label="Preview artwork ${index + 1}">
                        <img src="${escapeHtml(toProxyImageUrl(item.imageUrl))}" alt="${escapeHtml(displayPrompt(item) || "Generated artwork")}" loading="lazy">
                      </button>
                    `,
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }
      <section class="aim-detail-reviews">
        <div class="aim-section-head">
          <div>
            <p class="aim-eyebrow">Reviews</p>
            <h3>Comments from customers</h3>
          </div>
        </div>
        <div class="aim-review-list" data-ai-detail-review-list>
          <p class="aim-empty"><span class="aim-spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></span> Loading comments...</p>
        </div>
        <div class="aim-review-pagination" data-ai-review-pagination></div>
        <form class="aim-review-form aim-review-form--inline" data-ai-detail-review-form>
          <div class="aim-star-input" data-ai-star-input>
            ${[1, 2, 3, 4, 5].map((rating) => `<button type="button" class="is-active" data-ai-rating="${rating}" aria-label="${rating} stars">★</button>`).join("")}
          </div>
          <input type="hidden" name="rating" value="5">
          <textarea name="comment" rows="3" placeholder="Add a comment"></textarea>
          <button type="submit" class="aim-button aim-button--primary">Post comment</button>
          <p class="aim-status" data-ai-detail-review-status></p>
        </form>
      </section>
    `;

    fetchImageReviews(root, activeImage.id)
      .then((reviews) => {
        renderReviewPage(detail, reviews, 0);
      })
      .catch(() => {
        renderReviewPage(detail, [], 0);
      });

    window.requestAnimationFrame(() => {
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    detail
      .querySelector("[data-ai-detail-back]")
      ?.addEventListener("click", () => {
        resetGalleryDetail(root, detail);
      });
    detail
      .querySelector("[data-ai-detail-zoom]")
      ?.addEventListener("click", () => {
        showImageLightbox(activeImage.imageUrl, displayPrompt(activeImage));
      });
    detail
      .querySelector("[data-ai-detail-main-image]")
      ?.addEventListener("click", () => {
        showImageLightbox(activeImage.imageUrl, displayPrompt(activeImage));
      });
    detail.querySelectorAll("[data-ai-creator-index]").forEach((button) => {
      button.addEventListener("click", async () => {
        const next = groupedImages[Number(button.dataset.aiCreatorIndex)];
        if (!next) return;

        detail.querySelectorAll("[data-ai-creator-index]").forEach((thumb) => {
          thumb.classList.toggle("is-active", thumb === button);
        });

        const mediaImage = detail.querySelector("[data-ai-detail-main-image]");
        if (mediaImage) {
          mediaImage.style.opacity = "0.45";
          await new Promise((resolve) => {
            const temp = new Image();
            temp.onload = () => resolve();
            temp.onerror = () => resolve();
            temp.src = toProxyImageUrl(next.imageUrl);
          });
          mediaImage.src = toProxyImageUrl(next.imageUrl);
          mediaImage.alt = displayPrompt(next) || "Generated artwork";
          mediaImage.style.opacity = "1";
        }

        activeImage = next;
        image = { ...next, groupedImages };
        detail.dataset.aiActiveImageId = next.id;

        const title = detail.querySelector("[data-ai-detail-title]");
        const promptText = detail.querySelector("[data-ai-detail-prompt]");
        const optionsText = detail.querySelector("[data-ai-detail-options]");
        if (title) title.textContent = shortTitle(displayPrompt(next));
        if (promptText) promptText.textContent = displayPrompt(next);
        if (optionsText)
          optionsText.textContent =
            selectedOptionsText(next) || "No options saved";

        const reviewList = detail.querySelector("[data-ai-detail-review-list]");
        if (reviewList) {
          reviewList.innerHTML = `<p class="aim-empty"><span class="aim-spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></span> Loading comments...</p>`;
        }
        const reviews = await fetchImageReviews(root, next.id);
        renderReviewPage(detail, reviews, 0);
      });
    });
    detail
      .querySelector("[data-ai-detail-action='download']")
      ?.addEventListener("click", async (event) => {
        const fileName = `${activeImage.id || "artwork"}.png`;
        const imageUrl = activeImage.imageUrl;
        if (imageUrl) {
          await withButtonLoading(
            event.currentTarget,
            "Downloading...",
            async () => {
              await downloadImage(imageUrl, fileName);
            },
          );
        }
      });
    detail
      .querySelector("[data-ai-detail-action='use']")
      ?.addEventListener("click", async (event) => {
        const generator = document.querySelector("[data-ai-image-generator]");
        if (generator) {
          generator._userEditing = true;
          await withButtonLoading(
            event.currentTarget,
            "Loading...",
            async () => {
              await applyImageToGenerator(generator, image);
            },
          );
          resetGalleryDetail(root, detail);
          return;
        }

        await withButtonLoading(event.currentTarget, "Adding...", async () => {
          const selectedOptionsOverride =
            selectedCommunityOptions(detail) || selectedOptionsText(image);
          image.selectedOptionsOverride = selectedOptionsOverride;
          await addGeneratedImageToCart({
            root,
            studioConfig,
            form: null,
            selectedImage: image,
          });
          window.location.href = "/cart";
        });
      });
    detail
      .querySelector("[data-ai-detail-action='regenerate']")
      ?.addEventListener("click", (event) => {
        const btn = event.currentTarget;
        btn.dataset.aiOriginalText = btn.textContent;
        btn.classList.add("is-loading");
        btn.disabled = true;
        btn.textContent = "Opening...";
        const selectedOptionsOverride = selectedCommunityOptions(detail);
        const url =
          root.dataset.configuratorUrl || "/pages/custom-configurator";
        const params = new URLSearchParams({
          referenceGeneration: image.id,
          prompt: displayPrompt(image),
        });
        if (selectedOptionsOverride)
          params.set("selectedOptions", selectedOptionsOverride);
        window.location.href = `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
      });
    bindInlineReviewForm(root, detail);
  }

  function resetGalleryDetail(root, detail) {
    setCommunityDetailActive(root, false);
    resetTransientLoadingState(root);
    detail?.remove();
    root.querySelectorAll("[data-ai-card-action]").forEach((button) => {
      if (button.dataset.aiOriginalText) {
        button.textContent = button.dataset.aiOriginalText;
        delete button.dataset.aiOriginalText;
      }
      button.classList.remove("is-loading");
      button.disabled = false;
    });
    window.requestAnimationFrame(() => {
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function directCommunityChild(root, selector) {
    return Array.from(root.children || []).find((child) =>
      child.matches?.(selector),
    );
  }

  function setCommunityDetailActive(root, active) {
    root.classList.toggle("is-detail-active", active);
    const sectionHead = directCommunityChild(root, ".aim-section-head");
    const grid = directCommunityChild(root, "[data-ai-gallery-grid]");
    const detail = directCommunityChild(root, "[data-ai-community-detail]");

    [sectionHead, grid].forEach((element) => {
      if (!element) return;
      element.hidden = active;
      element.style.display = active ? "none" : "";
    });

    if (detail) {
      detail.hidden = !active;
      detail.style.display = active ? "" : "none";
    }
  }

  function resetTransientLoadingState(scope) {
    const root = scope?.querySelectorAll ? scope : document;
    root.querySelectorAll(".is-loading").forEach((element) => {
      element.classList.remove("is-loading");
      element.disabled = false;
      if (element.dataset.aiOriginalText) {
        element.textContent = element.dataset.aiOriginalText;
        delete element.dataset.aiOriginalText;
      }
    });
    root.querySelectorAll("button").forEach((button) => {
      const text = String(button.textContent || "").trim();
      if (text === "Opening..." || text === "Loading...") {
        if (button.dataset.aiOriginalText) {
          button.textContent = button.dataset.aiOriginalText;
          delete button.dataset.aiOriginalText;
        }
        button.classList.remove("is-loading");
        button.disabled = false;
      }
    });
  }

  function resetGeneratorState(root) {
    if (!root) return;
    root._userEditing = false;
    root._setSelectedImage?.(null);
    root._setDraftVariants?.([]);
    root._setFinalSelections?.(defaultFinalSelections());
    clearStoredPreview(root);
    setStudioStep(root, "prompt");
    toggleGeneratorImageSections(root, false);
    
    const preview = root.querySelector("[data-ai-preview]");
    const status = root.querySelector("[data-ai-status]");
    const generateButton = root.querySelector("[data-ai-generate]");
    const promptInput = root.querySelector("[data-ai-prompt]");
    const tweakInput = root.querySelector("[data-ai-tweak-prompt]");
    const editPromptBox = root.querySelector("[data-ai-edit-prompt-box]");
    
    if (promptInput) promptInput.value = "";
    if (tweakInput) tweakInput.value = "";
    if (editPromptBox) editPromptBox.hidden = true;
    
    root.querySelectorAll("[data-ai-orientation-select]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.aiOrientationSelect === "portrait");
    });
    root.querySelectorAll("[data-ai-effect-select]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.aiEffectSelect === "none");
    });
    
    if (preview) {
      preview.classList.remove("is-loading");
      preview.innerHTML = emptyPreviewStateHtml(root);
    }
    if (status) status.textContent = "";
    if (generateButton) {
      generateButton.disabled = false;
      generateButton.classList.remove("is-loading");
      if (generateButton.dataset.aiOriginalText) {
        generateButton.textContent = generateButton.dataset.aiOriginalText;
      }
    }
    resetTransientLoadingState(root);
  }

  function showImageLightbox(imageUrl, prompt) {
    const modal = document.createElement("div");
    modal.className = "aim-lightbox";
    modal.innerHTML = `
      <button type="button" class="aim-lightbox__close" aria-label="Close">×</button>
      <img src="${escapeHtml(toProxyImageUrl(imageUrl))}" alt="${escapeHtml(prompt || "Generated image")}">
    `;
    modal.addEventListener("click", (event) => {
      if (
        event.target === modal ||
        event.target.closest(".aim-lightbox__close")
      ) {
        modal.remove();
      }
    });
    document.body.appendChild(modal);
  }

  async function fetchImageReviews(root, generationId) {
    try {
      const params = new URLSearchParams({
        shop: root.dataset.shop || "",
        generationId: generationId || "",
        take: "50",
      });
      const response = await fetch(
        apiUrl(root.dataset.apiBase, `/api/image-interactions?${params}`),
      );
      const data = await readJson(response);
      return data.reviews || [];
    } catch {
      return [];
    }
  }

  function bindInlineReviewForm(root, detail) {
    const form = detail.querySelector("[data-ai-detail-review-form]");
    const ratingInput = form?.querySelector("input[name='rating']");
    const status = detail.querySelector("[data-ai-detail-review-status]");
    let replyTarget = "";
    detail.addEventListener("click", (event) => {
      const reply = event.target.closest("[data-ai-review-reply]");
      if (!reply || !form) return;
      replyTarget = reply.dataset.aiReviewReply || "Customer";
      const textarea = form.querySelector("textarea[name='comment']");
      if (textarea) {
        textarea.placeholder = `Reply to ${replyTarget}`;
        textarea.focus();
      }
    });
    detail.querySelectorAll("[data-ai-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        const rating = Number(button.dataset.aiRating) || 5;
        if (ratingInput) ratingInput.value = String(rating);
        detail.querySelectorAll("[data-ai-rating]").forEach((star) => {
          star.classList.toggle(
            "is-active",
            Number(star.dataset.aiRating) <= rating,
          );
        });
      });
      button.addEventListener("mouseenter", () => {
        const rating = Number(button.dataset.aiRating) || 5;
        detail.querySelectorAll("[data-ai-rating]").forEach((star) => {
          star.classList.toggle(
            "is-active",
            Number(star.dataset.aiRating) <= rating,
          );
        });
      });
    });
    detail
      .querySelector("[data-ai-star-input]")
      ?.addEventListener("mouseleave", () => {
        const rating = Number(ratingInput?.value) || 5;
        detail.querySelectorAll("[data-ai-rating]").forEach((star) => {
          star.classList.toggle(
            "is-active",
            Number(star.dataset.aiRating) <= rating,
          );
        });
      });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const activeGenId = detail.dataset.aiActiveImageId;
      const submitButton = form.querySelector("[type='submit']");
      await withButtonLoading(submitButton, "Posting...", async () => {
        const formData = new FormData(form);
        if (status) status.textContent = "Posting comment...";
        try {
          const response = await fetch(
            apiUrl(root.dataset.apiBase, "/api/image-interactions"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shop: root.dataset.shop,
                customerId: root.dataset.customerId,
                customerEmail: root.dataset.customerEmail,
                generationId: activeGenId,
                rating: formData.get("rating"),
                comment: replyTarget
                  ? `Reply to ${replyTarget}: ${formData.get("comment")}`
                  : formData.get("comment"),
                intent: "review:create",
              }),
            },
          );
          const result = await readJson(response);
          if (!result.success) {
            throw new Error(result.error || "Comment could not be posted.");
          }
          form.reset();
          replyTarget = "";
          const textarea = form.querySelector("textarea[name='comment']");
          if (textarea) textarea.placeholder = "Add a comment";
          if (ratingInput) ratingInput.value = "5";
          renderReviewPage(
            detail,
            await fetchImageReviews(root, activeGenId),
            0,
          );
          if (status) status.textContent = "Comment posted.";
        } catch (error) {
          if (status) status.textContent = error.message;
        }
      });
    });
  }

  function renderReviewPage(detail, reviews, page) {
    const perPage = 5;
    const safeReviews = Array.isArray(reviews) ? reviews : [];
    const maxPage = Math.max(0, Math.ceil(safeReviews.length / perPage) - 1);
    const nextPage = Math.max(0, Math.min(maxPage, page));
    const list = detail.querySelector("[data-ai-detail-review-list]");
    const pagination = detail.querySelector("[data-ai-review-pagination]");
    if (list) {
      list.innerHTML = renderReviews(
        safeReviews.slice(nextPage * perPage, nextPage * perPage + perPage),
      );
    }
    if (!pagination) return;
    pagination.innerHTML =
      safeReviews.length > perPage
        ? `
          <button type="button" class="aim-button aim-button--outline" data-ai-review-page="${nextPage - 1}" ${nextPage === 0 ? "disabled" : ""}>Previous</button>
          <span>Page ${nextPage + 1} of ${maxPage + 1}</span>
          <button type="button" class="aim-button aim-button--outline" data-ai-review-page="${nextPage + 1}" ${nextPage === maxPage ? "disabled" : ""}>Next</button>
        `
        : "";
    pagination.querySelectorAll("[data-ai-review-page]").forEach((button) => {
      button.addEventListener("click", () => {
        renderReviewPage(
          detail,
          safeReviews,
          Number(button.dataset.aiReviewPage),
        );
      });
    });
  }

  function showImageDetailsModalUnused({ root, image, studioConfig }) {
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
        <img src="${escapeHtml(toProxyImageUrl(image.imageUrl))}" alt="${prompt}">
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
        ${
          root.dataset.customerId
            ? `<form class="aim-modal__review" data-ai-modal-review>
                <strong>Add a review</strong>
                <select name="rating">
                  <option value="5">5 stars</option>
                  <option value="4">4 stars</option>
                  <option value="3">3 stars</option>
                  <option value="2">2 stars</option>
                  <option value="1">1 star</option>
                </select>
                <textarea name="comment" rows="3" placeholder="Share a short review"></textarea>
                <button type="submit" class="aim-button aim-button--primary">Submit review</button>
                <p class="aim-status" data-ai-modal-review-status></p>
              </form>`
            : ""
        }
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
    modal
      .querySelector("[data-ai-modal-review]")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const status = modal.querySelector("[data-ai-modal-review-status]");
        const formData = new FormData(form);
        if (status) status.textContent = "Submitting review...";
        try {
          const response = await fetch(
            apiUrl(root.dataset.apiBase, "/api/image-interactions"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shop: root.dataset.shop,
                customerId: root.dataset.customerId,
                customerEmail: root.dataset.customerEmail,
                generationId: image.id,
                rating: formData.get("rating"),
                comment: formData.get("comment"),
                intent: "review:create",
              }),
            },
          );
          const result = await readJson(response);
          if (!result.success) {
            throw new Error(result.error || "Review could not be submitted.");
          }
          form.reset();
          if (status)
            status.textContent = result.message || "Review submitted.";
        } catch (error) {
          if (status) status.textContent = error.message;
        }
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

  function defaultFinalSelections() {
    return {
      orientation: "portrait",
      size: "16x24",
      frame: "none",
      frameColor: "black",
      effect: "none",
    };
  }

  function metadataFinalSelections(image) {
    try {
      const metadata = JSON.parse(image?.metadata || "{}");
      return {
        ...defaultFinalSelections(),
        ...(metadata.finalSelections || {}),
      };
    } catch {
      return defaultFinalSelections();
    }
  }

  function mergeImageFinalSelections(image, selections) {
    let metadata = {};
    try {
      metadata = JSON.parse(image?.metadata || "{}");
    } catch {
      metadata = {};
    }

    return {
      ...image,
      metadata: JSON.stringify({
        ...metadata,
        draft: false,
        generationType: "final",
        finalSelections: {
          ...defaultFinalSelections(),
          ...(selections || {}),
        },
      }),
    };
  }

  function renderDraftEditor({
    root,
    variants,
    selectedImage,
    finalSelections,
    preview,
    prompt,
    editorOptions,
    setSelectedImage,
    setFinalSelections,
  }) {
    const sizePlaceholder = root.querySelector("[data-ai-size-placeholder]");
    const framePlaceholder = root.querySelector("[data-ai-frame-placeholder]");
    const thumbsContainer = root.querySelector(
      "[data-ai-draft-thumbs-container]",
    );
    const selectButton = root.querySelector("[data-ai-select]");

    if (!selectedImage) return;
    toggleGeneratorImageSections(root, true);
    if (selectButton) selectButton.hidden = false;

    const current = {
      ...defaultFinalSelections(),
      ...(finalSelections || {}),
    };
    const selectedUrl = selectedImage.imageUrl;
    const options = normalizeEditorOptions(editorOptions);
    applyPreviewPresentation(preview, current);

    // 1. Render size controls (Orientation and Size)
    if (sizePlaceholder) {
      sizePlaceholder.innerHTML = `
        ${renderEditorSelect("orientation", current.orientation, [
          { value: "landscape", label: "Landscape" },
          { value: "portrait", label: "Portrait" },
          { value: "square", label: "Square" },
        ])}
        ${renderEditorSelect("size", current.size, sizeEditorOptions(current.orientation))}
      `;
    }

    // 2. Render frame controls (FramePreset and Effect)
    if (framePlaceholder) {
      framePlaceholder.innerHTML = `
        ${renderEditorSelect("framePreset", framePresetValue(current), framePresetOptions(options))}
        ${renderEditorSelect("effect", current.effect, options.effect)}
      `;
    }

    // 3. Render horizontal thumbnails below full-width preview
    if (thumbsContainer) {
      thumbsContainer.innerHTML = `
        <div class="aim-draft-editor__variants aim-draft-masonry">
          ${(variants || [])
            .slice(0, 5)
            .map(
              (variant, index) => `
                <button type="button" class="aim-draft-thumb ${variant.imageUrl === selectedUrl ? "is-active" : ""}" data-ai-draft-index="${index}" aria-label="Draft ${index + 1}">
                  <img src="${escapeHtml(toProxyImageUrl(variant.imageUrl))}" alt="Draft ${index + 1}">
                </button>
              `,
            )
            .join("")}
        </div>
      `;

      thumbsContainer
        .querySelectorAll("[data-ai-draft-index]")
        .forEach((button) => {
          button.addEventListener("click", async () => {
            const nextVariant = variants[Number(button.dataset.aiDraftIndex)];
            if (!nextVariant) return;
            const nextImage = mergeImageFinalSelections(nextVariant, current);
            setSelectedImage?.(nextImage);
            await renderGeneratedPreview(preview, nextImage.imageUrl, prompt);
            highlightPreview(preview);
            storePreview(root, {
              generation: nextImage,
              variants,
              image: nextImage.imageUrl,
              prompt,
            });
            renderDraftEditor({
              root,
              variants,
              selectedImage: nextImage,
              finalSelections: current,
              preview,
              prompt,
              editorOptions,
              setSelectedImage,
              setFinalSelections,
            });
          });
        });
    }

    // 4. Bind reset action once
    const resetButton = root.querySelector("[data-ai-editor-reset]");
    if (resetButton && !resetButton._bound) {
      resetButton._bound = true;
      resetButton.addEventListener("click", () => {
        resetGeneratorState(root);
      });
    }

    // 5. Bind control changes inside placeholders
    const controls = [
      ...(sizePlaceholder
        ? sizePlaceholder.querySelectorAll("[data-ai-select-control]")
        : []),
      ...(framePlaceholder
        ? framePlaceholder.querySelectorAll("[data-ai-select-control]")
        : []),
    ];

    controls.forEach((input) => {
      input.addEventListener("change", () => {
        const nextSelections = {
          ...current,
          [input.dataset.aiSelectControl]: input.value,
        };
        if (input.dataset.aiSelectControl === "orientation") {
          nextSelections.size = defaultSizeForOrientation(input.value);
        }
        if (input.dataset.aiSelectControl === "size") {
          nextSelections.orientation = orientationForSize(input.value);
        }
        if (input.dataset.aiSelectControl === "framePreset") {
          const preset = parseFramePreset(input.value);
          nextSelections.frame = preset.frame;
          nextSelections.frameColor = preset.frameColor;
          delete nextSelections.framePreset;
        }
        const nextImage = mergeImageFinalSelections(
          selectedImage,
          nextSelections,
        );
        setSelectedImage?.(nextImage);
        setFinalSelections?.(nextSelections);
        applyPreviewPresentation(preview, nextSelections);
        highlightPreview(preview);
        storePreview(root, {
          generation: nextImage,
          variants,
          image: nextImage.imageUrl,
          prompt,
        });
        renderDraftEditor({
          root,
          variants,
          selectedImage: nextImage,
          finalSelections: nextSelections,
          preview,
          prompt,
          editorOptions,
          setSelectedImage,
          setFinalSelections,
        });
      });
    });
  }

  function renderSegmentedControl(name, value, options) {
    return `
      <div class="aim-segment-field">
        <span>${escapeHtml(editorOptionGroupLabel(name))}</span>
        <div class="aim-segment-group" data-ai-segment-group="${escapeHtml(name)}">
          ${options
            .map((option) => {
              const optionValue = option.value;
              const label = option.label || labelize(optionValue);
              return `
                <button type="button" class="aim-segment ${optionValue === value ? "is-active" : ""}" data-ai-segment="${escapeHtml(name)}" data-ai-value="${escapeHtml(optionValue)}">
                  ${escapeHtml(label)}
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderEditorSelect(name, value, options) {
    return `
      <label class="aim-select-field">
        <span>${escapeHtml(editorOptionGroupLabel(name))}</span>
        <select data-ai-select-control="${escapeHtml(name)}">
          ${options
            .map(
              (option) =>
                `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label || labelize(option.value))}</option>`,
            )
            .join("")}
        </select>
      </label>
    `;
  }

  function editorOptionGroupLabel(name) {
    return (
      {
        orientation: "Orientation",
        size: "Size",
        framePreset: "Frame",
        frame: "Frame",
        frameColor: "Frame color",
        effect: "Effect",
      }[name] || labelize(name)
    );
  }

  function defaultEditorOptions() {
    return {
      orientation: [
        { value: "landscape", label: "Landscape" },
        { value: "portrait", label: "Portrait" },
        { value: "square", label: "Square" },
      ],
      frame: [
        { value: "none", label: "Stretched Canvas" },
        { value: "gallery", label: "Floating Frame" },
      ],
      frameColor: [
        { value: "black", label: "Matte Black" },
        { value: "walnut", label: "Walnut" },
        { value: "oak", label: "Natural Oak" },
      ],
      effect: [
        { value: "none", label: "Clean" },
        { value: "abstract", label: "Abstract" },
        { value: "minimalist", label: "Minimalist" },
        { value: "retro", label: "Retro" },
        { value: "nature", label: "Nature" },
        { value: "oil-painting", label: "Oil Painting" },
      ],
    };
  }

  function orientationEditorOptions() {
    return [
      { value: "landscape", label: "Landscape" },
      { value: "portrait", label: "Portrait" },
      { value: "square", label: "Square" },
    ];
  }

  function sizeGroups() {
    return {
      landscape: [
        { value: "24x16", label: "24” × 16”" },
        { value: "36x24", label: "36” × 24”" },
        { value: "45x30", label: "45” × 30”" },
        { value: "60x40", label: "60” × 40”" },
      ],
      portrait: [
        { value: "16x24", label: "16” × 24”" },
        { value: "24x36", label: "24” × 36”" },
        { value: "30x45", label: "30” × 45”" },
        { value: "40x60", label: "40” × 60”" },
      ],
      square: [
        { value: "18x18", label: "18” × 18”" },
        { value: "24x24", label: "24” × 24”" },
        { value: "36x36", label: "36” × 36”" },
        { value: "48x48", label: "48” × 48”" },
      ],
    };
  }

  function sizeEditorOptions(orientation) {
    const groups = sizeGroups();
    if (orientation && groups[orientation]) {
      return groups[orientation];
    }
    return [
      ...groups.free,
      ...groups.square,
      ...groups.portrait,
      ...groups.landscape,
    ];
  }

  function defaultSizeForOrientation(orientation) {
    return sizeEditorOptions(orientation)[0]?.value || "";
  }

  function framePresetValue(selections) {
    if (!selections.frame || selections.frame === "none") return "none:black";
    return `${selections.frame}:${selections.frameColor || "black"}`;
  }

  function framePresetOptions(options) {
    const frames = (options.frame || defaultEditorOptions().frame).filter(
      (frame) => frame.value !== "none",
    );
    const colors = options.frameColor || defaultEditorOptions().frameColor;
    return [
      { value: "none:black", label: "No frame" },
      ...frames.flatMap((frame) =>
        colors.map((color) => ({
          value: `${frame.value}:${color.value}`,
          label: `${frame.label || labelize(frame.value)} - ${color.label || labelize(color.value)}`,
        })),
      ),
    ];
  }

  function parseFramePreset(value) {
    const [frame = "none", frameColor = "black"] = String(value || "").split(
      ":",
    );
    return { frame, frameColor };
  }

  function normalizeEditorOptions(options) {
    const defaults = defaultEditorOptions();
    const normalized = { ...defaults };
    Object.keys(defaults).forEach((key) => {
      const values = options?.[key];
      if (!Array.isArray(values) || !values.length) return;
      const cleanValues = values
        .map((option) => ({
          value: String(option?.value || "").trim(),
          label: String(option?.label || option?.value || "").trim(),
        }))
        .filter((option) => option.value && option.label);
      if (cleanValues.length) normalized[key] = cleanValues;
    });
    return normalized;
  }

  function applyPreviewPresentation(preview, selections) {
    if (!preview) return;
    const current = {
      ...defaultFinalSelections(),
      ...(selections || {}),
    };
    current.orientation =
      current.orientation || orientationForSize(current.size);
    preview.dataset.aiOrientation = current.orientation;
    if (current.size) {
      preview.dataset.aiSize = current.size;
    } else {
      delete preview.dataset.aiSize;
    }
    preview.dataset.aiFrame = current.frame;
    preview.dataset.aiFrameColor = current.frameColor;
    preview.dataset.aiEffect = current.effect;
  }

  function orientationForSize(size) {
    const [width, height] = String(size || "")
      .split("x")
      .map(Number);
    if (!width || !height) return "landscape";
    if (width === height) return "square";
    return width > height ? "landscape" : "portrait";
  }

  function sizeLabel(size) {
    return String(size || "")
      .replace("x", " x ")
      .replace(/\b(\d+)\b/g, "$1 in");
  }

  function setStudioStep(root, step) {
    root.dataset.aiStudioStep = step;
    root.classList.toggle("is-prompt-screen", step === "prompt" || step === "generating");
    root.classList.toggle("is-preview-screen", step === "preview");
    root.classList.toggle("is-editor-screen", step === "editor");
    root.classList.toggle("is-generating", step === "generating");

    const promptContainer = root.querySelector(".aim-prompt-content");
    const previewContainer = root.querySelector("[data-ai-preview-controls-container]");
    const editorContainer = root.querySelector("[data-ai-editor-controls-container]");

    if (promptContainer) promptContainer.hidden = (step !== "prompt" && step !== "generating");
    if (previewContainer) previewContainer.hidden = (step !== "preview");
    if (editorContainer) editorContainer.hidden = (step !== "editor");
  }

  function syncPromptShowcase(root) {
    if (!root) return;
    const image = root.querySelector("[data-ai-prompt-showcase-image]");
    const editButton = root.querySelector("[data-ai-edit-preview]");
    const selected = root._selectedImage || root._draftVariants?.[0] || null;
    const imageUrl =
      selected?.imageUrl || selected?.pendingImage?.imageUrl || "";

    if (image && imageUrl) {
      image.src = toProxyImageUrl(imageUrl);
      root.classList.add("has-prompt-preview");
    } else if (image && root.dataset.aiDefaultPromptPreview) {
      image.src = root.dataset.aiDefaultPromptPreview;
      root.classList.remove("has-prompt-preview");
    } else {
      root.classList.toggle("has-prompt-preview", !!imageUrl);
    }

    if (editButton) {
      editButton.hidden = !selected;
    }
  }

  async function withButtonLoading(button, label, task) {
    if (!button) return task();
    const originalText = button.textContent;
    button.dataset.aiOriginalText = originalText;
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = label || "Loading...";
    try {
      return await task();
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.textContent = originalText;
      delete button.dataset.aiOriginalText;
    }
  }

  function highlightPreview(preview) {
    if (!preview) return;
    preview.classList.remove("is-selected");
    window.requestAnimationFrame(() => {
      preview.classList.add("is-selected");
      window.setTimeout(() => preview.classList.remove("is-selected"), 850);
    });
  }

  function labelize(value) {
    return String(value || "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function previewImageHtml(imageUrl, prompt) {
    return `<div class="aim-preview-stage"><div class="aim-preview-frame"><div class="aim-preview-mat"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(prompt || "Generated AI image")}"></div></div></div><span>orvellastudio.com</span>`;
  }

  function emptyPreviewStateHtml(root) {
    return `
      <div class="aim-product-studio__empty aim-product-studio__empty--studio">
        <div class="aim-empty-art" aria-hidden="true">
          <div class="aim-empty-art__plant"></div>
          <div class="aim-empty-art__easel">
            <div class="aim-empty-art__canvas">
              <span></span>
            </div>
          </div>
          <div class="aim-empty-art__tools"></div>
        </div>
        <strong>${escapeHtml(root.dataset.previewLabel || "Your creativity starts here")}</strong>
        <p>Describe your idea in the left panel and let AI bring it to life.</p>
      </div>`;
  }

  function previewStorageKey(root) {
    return [
      "aim-preview",
      root.dataset.shop || "",
      root.dataset.productId || root.dataset.productHandle || "product",
    ].join(":");
  }

  function getStoredPreview(root) {
    try {
      return JSON.parse(
        window.sessionStorage?.getItem(previewStorageKey(root)) || "null",
      );
    } catch {
      return null;
    }
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
      Object.keys(window.sessionStorage || {})
        .filter((key) => key.startsWith("aim-preview:"))
        .forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
      // Preview storage is an enhancement only.
    }
  }

  function resetGeneratorPreview({
    root,
    preview,
    selectButton,
    addToCartButton,
    status,
    emptyPreviewHtml,
  }) {
    clearStoredPreview(root);
    if (preview) {
      preview.classList.remove("is-loading");
      preview.innerHTML = emptyPreviewHtml;
    }
    if (selectButton) selectButton.hidden = true;
    if (addToCartButton) {
      addToCartButton.hidden = true;
      addToCartButton.disabled = false;
    }
    if (status) status.textContent = "";
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
      const stage = document.createElement("div");
      const frame = document.createElement("div");
      const mat = document.createElement("div");
      stage.className = "aim-preview-stage";
      frame.className = "aim-preview-frame";
      mat.className = "aim-preview-mat";
      image.alt = prompt || "Generated AI image";
      image.decoding = "async";
      image.loading = "eager";
      badge.textContent = "orvellastudio.com";

      image.addEventListener(
        "load",
        () => {
          mat.replaceChildren(image);
          frame.replaceChildren(mat);
          stage.replaceChildren(frame);
          preview.replaceChildren(stage, badge);
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

      image.src = toProxyImageUrl(imageUrl);
      if (image.complete && image.naturalWidth > 0) {
        mat.replaceChildren(image);
        frame.replaceChildren(mat);
        stage.replaceChildren(frame);
        preview.replaceChildren(stage, badge);
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
