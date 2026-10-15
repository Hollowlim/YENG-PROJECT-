import { createElement, Component } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import MetallicPaint from "./MetallicPaint/MetallicPaint.jsx";
import logo from "../public/assets/logo-black.png";
import "./header-logo.css";

let root;
let generation = 0;
let imageTask;
// Trim only the transparent padding; preserve the supplied brand lettering.
function headerImage() {
  return imageTask ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1875;
        canvas.height = 275;
        canvas.getContext("2d").drawImage(image, 170, 238, 1875, 275, 0, 0, 1875, 275);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) { reject(error); }
    };
    image.onerror = reject;
    image.src = logo;
  });
}
class LogoBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
export function clearHeaderLogo() {
  generation++;
  root?.unmount();
  root = null;
}
export async function mountHeaderLogo() {
  const version = generation;
  const host = document.querySelector(".header-logo-effect");
  if (!host || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const imageSrc = await headerImage();
    if (version !== generation || !host.isConnected) return;
    root = createRoot(host);
    flushSync(() => root.render(createElement(LogoBoundary, null,
      createElement(MetallicPaint, {
        imageSrc, color: "#ffffff", backgroundColor: "transparent",
        scale: 1, density: 2, softness: 0.14, dispersion: 0.12,
        distortion: 0.07, edgeBend: 0.6, angle: 70, speed: 0.65,
        mouseTilt: 0, intro: false, dpr: 1.5,
      })
    )));
  } catch { /* Keep the original image if WebGL or image preparation fails. */ }
}
