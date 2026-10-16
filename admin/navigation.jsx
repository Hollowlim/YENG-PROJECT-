import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import RubberSegment from "../components/RubberSegment/RubberSegment.jsx";
import { adminSections } from "./pages.js";

let root;
let host;
const compactQuery = "(max-width: 700px), (pointer: coarse)";

function AdminNavigation({ view, onNavigate }) {
  const [selected, setSelected] = useState(view);
  const [compact, setCompact] = useState(() => matchMedia(compactQuery).matches);
  useEffect(() => setSelected(view), [view]);
  useEffect(() => {
    const media = matchMedia(compactQuery);
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return <RubberSegment
    items={adminSections}
    value={selected}
    onChange={(value) => {
      setSelected(value);
      onNavigate(`/admin?view=${value}`);
    }}
    trackColor="#101111"
    thumbColor="#edece5"
    textColor="#e9ede7"
    activeTextColor="#111411"
    size="lg"
    radius={12}
    inset={3}
    equalSlots
    stretch={100}
    squash={3}
    speed={1}
    glide={75}
    draggable={!compact}
    className="admin-rubber-control"
    aria-label="Admin sections"
  />;
}

export function getAdminNavigationHost() {
  return host?.isConnected ? host : null;
}

export function clearAdminNavigation() {
  root?.unmount();
  root = null;
  host = null;
}

export function mountAdminNavigation(onNavigate) {
  const nextHost = document.querySelector("[data-admin-portal] .admin-tabs");
  if (!nextHost) {
    clearAdminNavigation();
    return;
  }
  if (host !== nextHost) {
    clearAdminNavigation();
    host = nextHost;
    root = createRoot(host);
    host.classList.add("admin-tabs-enhanced");
  }
  const view = nextHost.closest("[data-admin-portal]").dataset.view;
  flushSync(() => root.render(<AdminNavigation view={view} onNavigate={onNavigate} />));
}
