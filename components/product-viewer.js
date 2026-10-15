import { escapeHTML as e } from "../model.js";
import "./product-viewer.css";
export function productViewer(product) {
  const sprite = product.view_sprite;
  const views = [
    { key: "left", src: product.view_left, label: "Left" },
    { key: "front", src: product.image_url, label: "Front" },
    { key: "right", src: product.view_right, label: "Right" },
  ];
  return `<section class="product-angle-viewer" role="region" aria-label="Product angle viewer" tabindex="0" data-name="${e(product.name)}" data-sprite="${e(sprite || "")}" data-views="${e(JSON.stringify(views.map((v) => ({ ...v, src: sprite || v.src || "" }))))}"><div class="viewer-stage"><img class="angle-image" src="${e(sprite || product.image_url)}" alt="${e(product.name)} — front view" ${sprite ? 'style="width:300%;transform:translateX(-33.333333%)"' : ""} draggable="false"><span class="viewer-index" aria-live="polite">FRONT VIEW</span><button class="viewer-arrow previous" type="button" data-step="-1" aria-label="Previous angle">‹</button><button class="viewer-arrow next" type="button" data-step="1" aria-label="Next angle">›</button></div><p class="viewer-hint">${sprite || product.view_left || product.view_right ? "USE THE ARROWS · SWIPE OR DRAG TO TURN" : "FRONT VIEW · MORE ANGLES COMING SOON"}</p>${sprite ? '<p class="viewer-disclosure">Illustrative product views for the sample.</p>' : ""}</section>`;
}
export function mountProductViewer() {
  const viewer = document.querySelector(".product-angle-viewer");
  if (!viewer) return;
  const views = JSON.parse(viewer.dataset.views);
  const image = viewer.querySelector(".angle-image");
  let active = 1,
    start;
  const show = (index) => {
    if (!views[index].src) return;
    active = index;
    const view = views[index];
    image.src = view.src;
    image.alt = `${viewer.dataset.name} — ${view.key} view`;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      image.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: 180,
        easing: "ease-out",
      });
    if (viewer.dataset.sprite) {
      image.style.width = "300%";
      image.style.transform = `translateX(${(-index * 100) / 3}%)`;
    }
    viewer.querySelector(".viewer-index").textContent =
      `${view.key.toUpperCase()} VIEW`;
  };
  const move = (step) => {
    for (let offset = 1; offset <= 3; offset++) {
      const i = (active + step * offset + 9) % 3;
      if (views[i].src) {
        show(i);
        break;
      }
    }
  };
  const available = views.filter((v) => v.src).length;
  viewer.querySelectorAll("[data-step]").forEach((b) => {
    b.disabled = available < 2;
    b.addEventListener("click", () => move(Number(b.dataset.step)));
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  const stage = viewer.querySelector(".viewer-stage");
  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    start = { x: event.clientX, y: event.clientY };
    if (event.isTrusted && event.pointerId !== undefined)
      stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener("pointerup", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    start = undefined;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
  });
  stage.addEventListener("pointercancel", () => {
    start = undefined;
  });
}
