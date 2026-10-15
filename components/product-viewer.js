import { escapeHTML as e } from "../model.js";
import "./product-viewer.css";
export function productViewer(product) {
  const sprite = product.view_sprite;
  const views = [
    { key: "left", src: product.view_left, label: "Left" },
    { key: "front", src: product.image_url, label: "Front" },
    { key: "right", src: product.view_right, label: "Right" },
  ];
  return `<section class="product-angle-viewer" role="region" aria-label="Product angle viewer" tabindex="0" data-name="${e(product.name)}" data-sprite="${e(sprite || "")}"><div class="viewer-stage"><img class="angle-image" src="${e(sprite || product.image_url)}" alt="${e(product.name)} — front view" ${sprite ? 'style="width:300%;transform:translateX(-33.333333%)"' : ""} draggable="false"><span class="viewer-index" aria-live="polite">FRONT VIEW</span><button class="viewer-arrow previous" type="button" data-step="-1" aria-label="Previous angle">‹</button><button class="viewer-arrow next" type="button" data-step="1" aria-label="Next angle">›</button></div><div class="viewer-controls" role="group" aria-label="Choose viewing angle">${views.map((v, i) => `<button type="button" class="angle-button ${v.key === "front" ? "active" : ""}" data-angle="${v.key}" data-source="${e(sprite || v.src || "")}" data-index="${i}" aria-label="${v.label} view" aria-pressed="${v.key === "front"}" ${!sprite && !v.src ? "disabled" : ""}>${v.label}</button>`).join("")}</div><p class="viewer-hint">${sprite || product.view_left || product.view_right ? "CLICK AN ANGLE · SWIPE OR DRAG TO TURN" : "FRONT VIEW · MORE ANGLES COMING SOON"}</p>${sprite ? '<p class="viewer-disclosure">Illustrative model views for the sample.</p>' : ""}</section>`;
}
export function mountProductViewer() {
  const viewer = document.querySelector(".product-angle-viewer");
  if (!viewer) return;
  const buttons = [...viewer.querySelectorAll("[data-angle]")];
  const image = viewer.querySelector(".angle-image");
  let active = 1,
    start;
  const show = (index) => {
    if (buttons[index].disabled) return;
    active = index;
    const button = buttons[index];
    image.src = button.dataset.source;
    image.alt = `${viewer.dataset.name} — ${button.dataset.angle} view`;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      image.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: 180,
        easing: "ease-out",
      });
    if (viewer.dataset.sprite) {
      image.style.width = "300%";
      image.style.transform = `translateX(${(-index * 100) / 3}%)`;
    }
    buttons.forEach((b, i) => {
      b.classList.toggle("active", i === index);
      b.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
    viewer.querySelector(".viewer-index").textContent =
      `${button.dataset.angle.toUpperCase()} VIEW`;
  };
  const move = (step) => {
    for (let offset = 1; offset <= 3; offset++) {
      const i = (active + step * offset + 9) % 3;
      if (!buttons[i].disabled) {
        show(i);
        break;
      }
    }
  };
  const available = buttons.filter((b) => !b.disabled).length;
  viewer.querySelectorAll("[data-step]").forEach((b) => {
    b.disabled = available < 2;
    b.addEventListener("click", () => move(Number(b.dataset.step)));
  });
  buttons.forEach((button, i) =>
    button.addEventListener("click", () => show(i)),
  );
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
