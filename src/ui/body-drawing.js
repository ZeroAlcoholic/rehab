import {
  BODY_OUTLINE,
  REGION_PATHS,
  SKELETON,
  MUSCLE_FIBERS,
  REGION_LABELS,
  SURFACE_DETAILS,
} from "./body-geometry.js";
import { PROGRESS_LABELS } from "../domain/body-insights.js";
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...children);
  return n;
};
const shape = ({ tag = "path", ...attrs }) => svgEl(tag, attrs);
export function drawBody(model, { view, mode, regionId, skeleton, onSelect, rehabRegions=[] }) {
  const svg = svgEl("svg", {
    viewBox: "-40 0 320 535",
    role: "group",
    "aria-label": view === "front" ? "人體正面肌群圖" : "人體背面肌群圖",
  });
  const shadeId=`muscle-shade-${view}`;
  svg.append(svgEl('defs',{},svgEl('linearGradient',{id:shadeId,x1:0,y1:0,x2:1,y2:0},
    svgEl('stop',{offset:'0%','stop-color':'var(--accent)','stop-opacity':'.13'}),
    svgEl('stop',{offset:'40%','stop-color':'var(--surface)','stop-opacity':'.26'}),
    svgEl('stop',{offset:'100%','stop-color':'var(--accent)','stop-opacity':'.1'}))));
  svg.append(
    svgEl(
      "g",
      { class: "body-outline", "aria-hidden": true },
      ...BODY_OUTLINE.map(shape),
    ),
  );
  for (const [id, paths] of Object.entries(REGION_PATHS[view])) {
    const r = model.regions.find((r) => r.id === id),
      tone =
        mode === "progress"
          ? r.progress
          : mode === "session"
            ? r.primarySets
              ? "primary"
              : r.supportSets
                ? "support"
                : "none"
            : r.coverage;
    const description =
      mode === "progress"
        ? PROGRESS_LABELS[r.progress]
        : `主要 ${r.primarySets} 組、協同 ${r.supportSets} 組`;
    const g = svgEl(
      "g",
      {
        class: "body-region",
        role: "button",
        tabindex: 0,
        "data-region": id,
        "data-tone": tone,
        "data-coverage": r.recordCount ? "recorded" : "none",
        "aria-label": `${r.name}，${description}`,
        "aria-pressed": id === regionId,
      },
      ...paths.map(shape),
    );
    g.addEventListener("click", () => onSelect(id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(id, true);
      }
    });
    svg.append(g);
    svg.append(svgEl('g',{class:'body-surface-shade',fill:`url(#${shadeId})`,'aria-hidden':true},...paths.map(shape)));
    if(rehabRegions.includes(id))svg.append(svgEl('g',{class:'body-adjustment','data-adjust-region':id,'aria-hidden':true},...paths.map(shape)));
  }
  svg.append(
    svgEl(
      "g",
      { class: "body-fibers", "aria-hidden": true },
      ...MUSCLE_FIBERS[view].map(shape),
    ),
  );
  const bones = svgEl(
    "g",
    { class: "body-skeleton", "aria-hidden": true },
    ...SKELETON.shared.map(shape),
    ...SKELETON[view].map(shape),
    ...SKELETON.joints.map(([cx, cy]) => svgEl("circle", { cx, cy, r: 4 })),
  );
  if (!skeleton) bones.style.display = "none";
  svg.append(bones);
  svg.append(svgEl('g',{class:'body-surface-details','aria-hidden':true},...SURFACE_DETAILS.shared.map(shape),...SURFACE_DETAILS[view].map(shape)));
  const labels = svgEl("g", {
    class: "body-anatomy-labels",
    "aria-hidden": true,
  });
  for (const [id, x, y, tx, ty, name] of REGION_LABELS[view]) {
    const left = tx < 120;
    labels.append(
      svgEl("path", {
        d: `M${x} ${y} L${left ? 36 : 204} ${ty} L${left ? -34 : 274} ${ty}`,
      }),
      svgEl(
        "text",
        {
          x: left ? -34 : 274,
          y: ty - 5,
          "text-anchor": left ? "start" : "end",
        },
        name,
      ),
    );
  }
  svg.append(labels);
  return svg;
}
