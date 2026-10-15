import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ScrollExpand from "./ScrollExpand/ScrollExpand.jsx";
let root;
function Campaign() {
  const [compact, setCompact] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const resize = () => setCompact(window.innerWidth < 600);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return (
    <ScrollExpand
      src="/assets/campaign.png"
      alt="CROWNETIC campaign: washed charcoal streetwear against Kuala Lumpur concrete architecture"
      title={
        reduced ? (
          ""
        ) : (
          <h1>
            BUILT TO
            <br />
            STAND APART.
          </h1>
        )
      }
      scrollHint={reduced ? "" : "SCROLL TO OPEN THE ARCHIVE ↓"}
      useWindowScroll
      startWidth={compact ? 82 : 58}
      startHeight={64}
      startRadius={24}
      endRadius={12}
      mediaZoom={1.2}
      scrollDistance={1.05}
      holdDistance={0.18}
      overlayScrim={0.8}
      enabled={!reduced}
      className={`crownetic-scroll-campaign ${reduced ? "is-reduced" : ""}`}
    >
      <span className="eyebrow">CROWNETIC — COLLECTION 001</span>
      {reduced ? (
        <h1>
          BUILT TO
          <br />
          STAND APART.
        </h1>
      ) : (
        <h2>
          MADE FOR
          <br />
          YOUR ROTATION.
        </h2>
      )}
      <p>Independent by nature. Kuala Lumpur to everywhere.</p>
      <a href="#/shop" data-link className="button campaign-cta">
        EXPLORE THE DROP <span aria-hidden="true">→</span>
      </a>
    </ScrollExpand>
  );
}
export function mountScrollEffect() {
  const host = document.querySelector("#scroll-campaign");
  if (!host) return;
  root = createRoot(host);
  root.render(createElement(Campaign));
}
export function clearScrollEffect() {
  root?.unmount();
  root = undefined;
}
