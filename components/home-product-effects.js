import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ReflectiveCard from "./ReflectiveCard/ReflectiveCard.jsx";
import "./home-product-effects.css";

let roots = [];
export function clearProductEffects() {
  for (const root of roots) root.unmount();
  roots = [];
}
export function mountProductEffects() {
  for (const host of document.querySelectorAll(
    ".home-products .product-image",
  )) {
    // Retain the storefront's already-escaped photo, badge and shopping link.
    const content = host.innerHTML;
    const root = createRoot(host);
    roots.push(root);
    root.render(
      createElement(
        ReflectiveCard,
        {
          name: "Alexander Doe",
          role: "Senior Developer",
          videoSrc:
            location.protocol === "file:" ||
            location.pathname.endsWith("index.html") ||
            !location.pathname.endsWith("source.html")
              ? "./public/videos/reflection.mp4"
              : "/videos/reflection.mp4",
          webcam: false,
          tint: "#ffffff",
          metalness: 1,
          roughness: 0.3,
          blurStrength: 6,
          shine: 1,
          glare: 0.5,
          theme: "light",
          width: "100%",
          height: "100%",
          radius: 14,
          intro: false,
          className: "crownetic-reflective-product",
        },
        createElement("div", {
          className: "reflective-product-photo",
          dangerouslySetInnerHTML: { __html: content },
        }),
      ),
    );
  }
}
