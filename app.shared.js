/* app.shared.js (compartido) */
(function () {
  const LOCALE = "es-CR";
  const CURRENCY = "CRC";

  function moneyCRC(value) {
    try {
      return new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: CURRENCY,
        maximumFractionDigits: 0
      }).format(Number(value));
    } catch {
      return `₡${Math.round(Number(value) || 0)}`;
    }
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function buildPhotoList(data) {
    // Si usted quiere listar archivos específicos, use data.photoFiles en el JSON del HTML.
    if (Array.isArray(data.photoFiles) && data.photoFiles.length) {
      return data.photoFiles.map((file) => ({
        src: `../../assets/imgs/${data.id}/${file}.webp`,
        alt: `${data.title} - foto ${file}`
      }));
    }

    const count = Math.max(1, Number(data.photoCount || 1));
    return Array.from({ length: count }, (_, i) => {
      const idx = pad2(i + 1);
      return {
        src: `../../assets/imgs/${data.id}/${idx}.webp`,
        alt: `${data.title} - foto ${idx}`
      };
    });
  }

  function buildWhatsAppLink(phoneE164, message) {
    const url = new URL(`https://wa.me/${phoneE164}`);
    url.searchParams.set("text", message);
    return url.toString();
  }

  function getActiveIndex(track) {
    const w = track.clientWidth || 1;
    const idx = Math.round(track.scrollLeft / w);
    return Math.max(0, idx);
  }

  function scrollToIndex(track, idx, smooth = true) {
    const w = track.clientWidth || 1;
    track.scrollTo({
      left: idx * w,
      behavior: smooth ? "smooth" : "auto"
    });
  }

  function initGallery({ data, photos }) {
    const track = document.getElementById("galleryTrack");
    const thumbs = document.getElementById("galleryThumbs");
    const counter = document.getElementById("galleryCounter");
    const openFullBtns = [...document.querySelectorAll('[data-ac-open-fullscreen="1"]')];
    const modalEl = document.getElementById("galleryModal");
    const modalBody = modalEl?.querySelector(".modal-body");
    const modalImg = document.getElementById("modalImage");
    const modalCounter = document.getElementById("modalCounter");

    if (!track || !thumbs || !counter) return;

    let activeIndex = 0;
    let scrollSyncLockUntil = 0;
    let modalLoadToken = 0;

    // Render slides
    track.innerHTML = photos.map((p, i) => `
      <div class="ac-gallery__slide">
        <img
          src="${escapeHTML(p.src)}"
          alt="${escapeHTML(p.alt)}"
          loading="${i === 0 ? "eager" : "lazy"}"
          fetchpriority="${i === 0 ? "high" : "auto"}"
          style="object-position:${escapeHTML(data.photoFocus || "50% 50%")};"
          onerror="this.src='https://placehold.co/1200x750/png?text=${encodeURIComponent(data.title)}'"
        />
      </div>
    `).join("");

    // Render thumbs (limit visual: 12, pero la galería sigue con todas)
    thumbs.innerHTML = photos.slice(0, Math.min(photos.length, 12)).map((p, i) => `
      <button class="ac-thumb ${i === 0 ? "is-active" : ""}" type="button" data-idx="${i}" aria-label="Ir a foto ${i + 1}">
        <img
          src="${escapeHTML(p.src)}"
          alt="${escapeHTML(data.title)} thumbnail ${i + 1}"
          loading="lazy"
          style="object-position:${escapeHTML(data.photoFocus || "50% 50%")};"
          onerror="this.src='https://placehold.co/320x200/png?text=Foto'"
        />
      </button>
    `).join("");

    function setModalImage(i) {
      if (!modalImg) return;
      const src = photos[i]?.src || photos[0]?.src || "";
      if (!src || modalImg.dataset.src === src) return;

      const token = ++modalLoadToken;
      const apply = () => {
        if (token !== modalLoadToken) return;
        modalImg.src = src;
        modalImg.dataset.src = src;
      };

      const preload = new Image();
      preload.decoding = "async";
      preload.src = src;
      if (typeof preload.decode === "function") preload.decode().then(apply).catch(apply);
      else {
        preload.onload = apply;
        preload.onerror = apply;
      }
    }

    function setActive(i) {
      const idx = Math.max(0, Math.min(photos.length - 1, Number(i) || 0));
      activeIndex = idx;

      counter.textContent = `Foto ${idx + 1} de ${photos.length}`;
      [...thumbs.querySelectorAll(".ac-thumb")].forEach((b) => {
        b.classList.toggle("is-active", Number(b.dataset.idx) === idx);
      });
      if (modalCounter) modalCounter.textContent = `Foto ${idx + 1} de ${photos.length}`;
      setModalImage(idx);
    }

    // Thumb click
    thumbs.addEventListener("click", (e) => {
      const btn = e.target.closest(".ac-thumb");
      if (!btn) return;
      const idx = Number(btn.dataset.idx || 0);
      scrollSyncLockUntil = performance.now() + 360;
      scrollToIndex(track, idx, true);
      setActive(idx);
    });

    // Track scroll
    let raf = 0;
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (performance.now() < scrollSyncLockUntil) return;
        const idx = getActiveIndex(track);
        setActive(idx);
      });
    }, { passive: true });

    // Fullscreen modal sync (Bootstrap modal optional)
    if (openFullBtns.length && modalImg) {
      openFullBtns.forEach((btn) => btn.addEventListener("click", () => {
        const idx = getActiveIndex(track);
        setActive(idx);
      }));
    }

    // En modal fullscreen, cerrar al tocar fuera de la foto.
    if (modalEl && modalBody && modalImg && window.bootstrap?.Modal) {
      modalBody.addEventListener("click", (e) => {
        if (e.target === modalBody) {
          window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }
      });
    }

    // Modal nav
    const prev = document.getElementById("btnPrev");
    const next = document.getElementById("btnNext");
    function step(delta) {
      const target = Math.max(0, Math.min(photos.length - 1, activeIndex + delta));
      if (target === activeIndex) return;

      // En fullscreen evitamos el "smooth" para no provocar cambios intermedios que parpadeen.
      const isModalOpen = Boolean(modalEl?.classList.contains("show"));
      const smooth = !isModalOpen;
      if (smooth) scrollSyncLockUntil = performance.now() + 360;
      scrollToIndex(track, target, smooth);
      setActive(target);
    }
    prev?.addEventListener("click", () => step(-1));
    next?.addEventListener("click", () => step(1));

    // Keyboard (cuando modal abierto o no, igual ayuda)
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });

    // Init
    setActive(0);
  }

  function initWhatsApp(data) {
    const waLinks = [
      document.getElementById("waTop"),
      document.getElementById("waMain"),
      document.getElementById("waSticky"),
    ].filter(Boolean);

    const msg = data.whatsappMessage
      || `Hola, me gustaría agendar una cita para ver: ${data.title} (${data.year}) - Código: ${data.code}. ¿Me puede indicar disponibilidad?`;

    const href = buildWhatsAppLink(data.whatsappPhoneE164, msg);
    waLinks.forEach(a => a.setAttribute("href", href));
  }

  function initCopyAndShare(data) {
    const copyBtn = document.getElementById("btnCopyCode");
    const shareBtn = document.getElementById("btnShare");

    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(data.code));
        copyBtn.textContent = "Código copiado";
        setTimeout(() => (copyBtn.textContent = "Copiar código"), 1200);
      } catch {
        // Fallback feo pero funcional
        alert(`Código: ${data.code}`);
      }
    });

    shareBtn?.addEventListener("click", async () => {
      const payload = {
        title: data.title,
        text: `${data.title} (${data.year}) - ${moneyCRC(data.price)} - Código: ${data.code}`,
        url: window.location.href
      };

      try {
        if (navigator.share) await navigator.share(payload);
        else {
          await navigator.clipboard.writeText(payload.url);
          shareBtn.textContent = "Link copiado";
          setTimeout(() => (shareBtn.textContent = "Compartir"), 1200);
        }
      } catch {
        // silencio administrativo
      }
    });
  }

  function initPrice(data) {
    const priceEl = document.getElementById("price");
    const priceStickyEl = document.getElementById("priceSticky");
    const negEl = document.getElementById("negotiableHint");

    if (priceEl) priceEl.textContent = moneyCRC(data.price);
    if (priceStickyEl) priceStickyEl.textContent = moneyCRC(data.price);
    if (negEl) negEl.textContent = data.negotiable ? "Negociable" : "Precio fijo (según publicación)";
  }

  function initVehiclePage() {
    const json = document.getElementById("vehicle-data");
    if (!json) return;

    let data;
    try { data = JSON.parse(json.textContent); }
    catch { return; }

    initPrice(data);
    initWhatsApp(data);
    initCopyAndShare(data);

    const photos = buildPhotoList(data);
    initGallery({ data, photos });
  }

  // Expose
  window.AutosCambar = window.AutosCambar || {};
  window.AutosCambar.initVehiclePage = initVehiclePage;
})();
