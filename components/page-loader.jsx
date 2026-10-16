import { createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import MetallicPaint from "./MetallicPaint/MetallicPaint.jsx";
import { prepareMonogram } from "./prepare-monogram.js";
import "./page-loader.css";
let current = 0;
import logo from "../public/assets/loading-monogram.png";
class EffectBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function showPageLoader() {
  const id = ++current;
  document.querySelector("#page-loader")?.remove();
  const host = document.createElement("div");
  host.id = "page-loader";
  host.setAttribute("role", "status");
  host.setAttribute("aria-label", "Loading CROWNNETIC");
  host.setAttribute("aria-live", "polite");
  host.innerHTML = `<div class="page-loader-brand"><div class="loader-art"><img src="${logo}" alt="CROWNNETIC monogram" class="loader-static"><div class="loader-effect"></div></div><p>CROWNNETIC</p><span>OPENING THE ARCHIVE</span></div>`;
  document.body.append(host);
  document.querySelector("#app")?.setAttribute("aria-busy", "true");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let root;
  if (!reduced) {
    root = createRoot(host.querySelector(".loader-effect"));
    prepareMonogram(logo)
      .then((imageSrc) => {
        if (!host.isConnected) return;
        flushSync(() =>
          root.render(
            createElement(
              EffectBoundary,
              null,
              createElement(MetallicPaint, {
                imageSrc,
                color: "#ffffff",
                backgroundColor: "transparent",
                density: 2,
                softness: 0.14,
                dispersion: 0.2,
                distortion: 0.07,
                edgeBend: 0.6,
                angle: 70,
                speed: 1.2,
                scale: 0.78,
                mouseTilt: 0,
                intro: false,
              }),
            ),
          ),
        );
      })
      .catch(() => {});
  }
  return {
    id,
    host,
    root,
    started: performance.now(),
    minimum: reduced ? 100 : id === 1 ? 1500 : 1000,
  };
}
export async function hidePageLoader(loader) {
  const remaining = loader.minimum - (performance.now() - loader.started);
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining));
  loader.root?.unmount();
  loader.host.remove();
  if (loader.id === current)
    document.querySelector("#app")?.removeAttribute("aria-busy");
}
