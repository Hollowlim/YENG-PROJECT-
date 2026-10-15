import { createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ElectricLogo from "./ElectricLogo/ElectricLogo.jsx";
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
  host.setAttribute("aria-label", "Loading CROWNETIC");
  host.setAttribute("aria-live", "polite");
  host.innerHTML = `<div class="page-loader-brand"><div class="loader-art"><img src="${logo}" alt="CROWNETIC monogram" class="loader-static"><div class="loader-electric"></div></div><p>CROWNETIC</p><span>OPENING THE ARCHIVE</span></div>`;
  document.body.append(host);
  document.querySelector("#app")?.setAttribute("aria-busy", "true");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let root;
  if (!reduced) {
    root = createRoot(host.querySelector(".loader-electric"));
    flushSync(() =>
      root.render(
        createElement(
          EffectBoundary,
          null,
          createElement(ElectricLogo, {
            src: logo,
            color: "#ffffff",
            glowColor: "#dad2ff",
            scale: 0.7,
            intensity: 1.4,
            glow: 1.2,
            fill: 0.08,
            strands: 4,
            bend: 0.6,
            crackle: 1.5,
            arcs: 1,
            speed: 2.5,
            interactive: false,
            onRender: () => host.classList.add("effect-ready"),
          }),
        ),
      ),
    );
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
