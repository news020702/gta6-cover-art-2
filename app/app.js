// Neon Harbor — Midnight Cover Studio.
// A static web app that turns a photo and a caption into multi-panel
// GTA-style poster cover art, exported as a PNG. Everything runs offline:
// the only font is a file under app/, the sample portraits are original
// illustrations drawn in this repository, and photos the user adds are
// read on their own machine, never uploaded.

const SAMPLES = [
  { name: "Rex Marlowe", file: "samples/rex-marlowe.png" },
  { name: "Vera Night", file: "samples/vera-night.png" },
  { name: "Dex Cole", file: "samples/dex-cole.png" },
];

// Panel rects are fractions of the poster width and of the panel area
// (the top 80% of the poster; the bottom 20% is the title band).
const LAYOUTS = {
  harbor: {
    label: "Harbor Nights",
    panels: (W, H) => [
      { x: 0, y: 0, w: 0.62 * W, h: H },
      { x: 0.62 * W, y: 0, w: 0.38 * W, h: 0.5 * H },
      { x: 0.62 * W, y: 0.5 * H, w: 0.38 * W, h: 0.5 * H },
    ],
  },
  grid: {
    label: "Neon Grid",
    panels: (W, H) => [
      { x: 0, y: 0, w: 0.5 * W, h: 0.5 * H },
      { x: 0.5 * W, y: 0, w: 0.5 * W, h: 0.5 * H },
      { x: 0, y: 0.5 * H, w: 0.5 * W, h: 0.5 * H },
      { x: 0.5 * W, y: 0.5 * H, w: 0.5 * W, h: 0.5 * H },
    ],
  },
  strip: {
    label: "Midnight Strip",
    panels: (W, H) => [
      { x: 0, y: 0, w: W, h: 0.625 * H },
      { x: 0, y: 0.625 * H, w: W / 3, h: 0.375 * H },
      { x: W / 3, y: 0.625 * H, w: W / 3, h: 0.375 * H },
      { x: (2 * W) / 3, y: 0.625 * H, w: W / 3, h: 0.375 * H },
    ],
  },
};

const GRADES = {
  magenta: { label: "Magenta Nights", bg: "#150826", band: "#0d0518", accent: "#ff2e88", tint: "rgba(255,46,136,0.16)", filter: "none" },
  blue: { label: "Harbor Blue", bg: "#061224", band: "#040b18", accent: "#00c8ff", tint: "rgba(0,180,255,0.16)", filter: "none" },
  lime: { label: "Acid Lime", bg: "#0a1a08", band: "#060f04", accent: "#a4ff4f", tint: "rgba(120,255,60,0.14)", filter: "none" },
  violet: { label: "Violet Haze", bg: "#1a0b2e", band: "#100619", accent: "#a855f7", tint: "rgba(168,85,247,0.16)", filter: "none" },
  noir: { label: "Mono Noir", bg: "#0a0a0a", band: "#000000", accent: "#ff3b30", tint: "rgba(255,255,255,0.05)", filter: "grayscale(1) contrast(1.15)" },
};

const SIZES = {
  "1080x1080": [1080, 1080],
  "1080x1350": [1080, 1350],
  "1920x1080": [1920, 1080],
};

const DISPLAY_FONT = '"Bebas Neue", "Arial Narrow", sans-serif';

const state = {
  photos: [], // { name, img }
  panels: [], // { photo, zoom, ox, oy }
  layout: "harbor",
  grade: "magenta",
  title: "NEON HARBOR",
  tagline: "MIDNIGHT. NEON. NO BRAKES.",
  size: "1920x1080",
  selected: 0,
};

const canvas = document.getElementById("poster");
const ctx = canvas.getContext("2d");
const stageNote = document.getElementById("stageNote");

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load " + src));
    img.src = src;
  });
}

function panelRects() {
  const [W, H] = SIZES[state.size];
  const areaH = H * 0.8;
  const g = Math.max(4, Math.round(W * 0.006));
  return LAYOUTS[state.layout].panels(W, areaH).map((r) => ({
    x: r.x + g,
    y: r.y + g,
    w: r.w - 2 * g,
    h: r.h - 2 * g,
  }));
}

function rebuildPanels() {
  const count = LAYOUTS[state.layout].panels(1, 1).length;
  const old = state.panels;
  state.panels = Array.from({ length: count }, (_, i) => {
    const prev = old[i];
    return {
      photo: prev ? prev.photo % Math.max(1, state.photos.length) : i % Math.max(1, state.photos.length),
      zoom: prev ? prev.zoom : 1.15,
      ox: 0,
      oy: 0,
    };
  });
  state.selected = 0;
}

function drawCover(img, rect, zoom, ox, oy, filter) {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + ox;
  const dy = rect.y + (rect.h - dh) / 2 + oy;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (filter && filter !== "none") ctx.filter = filter;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.filter = "none";
  ctx.restore();
  return { dw, dh };
}

function clampOffset(panel, rect, dw, dh) {
  const maxOx = Math.max(0, (dw - rect.w) / 2);
  const maxOy = Math.max(0, (dh - rect.h) / 2);
  panel.ox = Math.max(-maxOx, Math.min(maxOx, panel.ox));
  panel.oy = Math.max(-maxOy, Math.min(maxOy, panel.oy));
}

function fitFont(text, maxWidth, startPx, family) {
  let px = startPx;
  ctx.font = `400 ${px}px ${family}`;
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = `400 ${px}px ${family}`;
  }
  return px;
}

function render(forExport = false) {
  const [W, H] = SIZES[state.size];
  const grade = GRADES[state.grade];
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const areaH = H * 0.8;
  const bandH = H * 0.2;

  ctx.fillStyle = grade.bg;
  ctx.fillRect(0, 0, W, H);

  const rects = panelRects();
  rects.forEach((rect, i) => {
    const panel = state.panels[i];
    const photo = state.photos[panel ? panel.photo : 0];
    if (photo && photo.img) {
      const { dw, dh } = drawCover(photo.img, rect, panel.zoom, panel.ox, panel.oy, grade.filter);
      clampOffset(panel, rect, dw, dh);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    // colour grade tint over the photo
    ctx.fillStyle = grade.tint;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    // hairline frame so the panels read apart
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = Math.max(1, W * 0.001);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    // selection outline, preview only — never in an export
    if (!forExport && i === state.selected) {
      ctx.strokeStyle = grade.accent;
      ctx.lineWidth = Math.max(3, W * 0.003);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  });

  // title band
  ctx.fillStyle = grade.band;
  ctx.fillRect(0, areaH, W, bandH);
  ctx.fillStyle = grade.accent;
  ctx.fillRect(0, areaH, W, Math.max(4, H * 0.006));

  const title = (state.title || "NEON HARBOR").toUpperCase();
  const tagline = (state.tagline || "").toUpperCase();
  const titlePx = fitFont(title, W * 0.92, Math.round(H * 0.115), DISPLAY_FONT);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = Math.round(H * 0.012);
  ctx.shadowOffsetY = Math.round(H * 0.004);
  ctx.fillText(title, W / 2, areaH + bandH * 0.46);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (tagline) {
    const tagPx = Math.round(H * 0.032);
    ctx.font = `400 ${tagPx}px ${DISPLAY_FONT}`;
    try { ctx.letterSpacing = `${Math.round(H * 0.006)}px`; } catch (e) { /* older canvas */ }
    ctx.fillStyle = grade.accent;
    ctx.fillText(tagline, W / 2, areaH + bandH * 0.82);
    try { ctx.letterSpacing = "0px"; } catch (e) { /* older canvas */ }
  }

  const [sw, sh] = SIZES[state.size];
  stageNote.textContent = `Poster ${sw} × ${sh} · ${LAYOUTS[state.layout].label} · ${GRADES[state.grade].label} · panel ${state.selected + 1} of ${rects.length} selected`;
}

function exportPNG() {
  render(true);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neon-harbor-${state.size}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}

function buildThumbs() {
  const wrap = document.getElementById("photoThumbs");
  wrap.innerHTML = "";
  state.photos.forEach((photo, idx) => {
    const fig = document.createElement("figure");
    if (state.panels[state.selected] && state.panels[state.selected].photo === idx) {
      fig.classList.add("selected");
    }
    const img = document.createElement("img");
    img.src = photo.img.src;
    img.alt = photo.name;
    const cap = document.createElement("figcaption");
    cap.textContent = photo.name;
    fig.append(img, cap);
    fig.addEventListener("click", () => {
      state.panels[state.selected].photo = idx;
      buildThumbs();
      render();
    });
    wrap.appendChild(fig);
  });
}

function buildChoices() {
  const layoutWrap = document.getElementById("layoutChoices");
  layoutWrap.innerHTML = "";
  Object.entries(LAYOUTS).forEach(([key, def]) => {
    const b = document.createElement("button");
    b.textContent = def.label;
    if (key === state.layout) b.classList.add("active");
    b.addEventListener("click", () => {
      state.layout = key;
      rebuildPanels();
      buildChoices();
      buildThumbs();
      render();
    });
    layoutWrap.appendChild(b);
  });

  const gradeWrap = document.getElementById("gradeChoices");
  gradeWrap.innerHTML = "";
  Object.entries(GRADES).forEach(([key, def]) => {
    const b = document.createElement("button");
    b.title = def.label;
    b.setAttribute("aria-label", def.label);
    b.style.background = `linear-gradient(135deg, ${def.bg} 0%, ${def.accent} 100%)`;
    if (key === state.grade) b.classList.add("active");
    b.addEventListener("click", () => {
      state.grade = key;
      buildChoices();
      render();
    });
    gradeWrap.appendChild(b);
  });
  document.getElementById("gradeName").textContent = GRADES[state.grade].label;
}

function posterPoint(evt) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - r.left) * canvas.width) / r.width,
    y: ((evt.clientY - r.top) * canvas.height) / r.height,
  };
}

function wireEvents() {
  document.getElementById("exportBtn").addEventListener("click", exportPNG);
  document.getElementById("sizeSelect").addEventListener("change", (e) => {
    state.size = e.target.value;
    render();
  });
  document.getElementById("titleInput").addEventListener("input", (e) => {
    state.title = e.target.value;
    render();
  });
  document.getElementById("taglineInput").addEventListener("input", (e) => {
    state.tagline = e.target.value;
    render();
  });
  document.getElementById("zoomRange").addEventListener("input", (e) => {
    const panel = state.panels[state.selected];
    if (panel) {
      panel.zoom = parseFloat(e.target.value);
      render();
    }
  });
  document.getElementById("fillAllBtn").addEventListener("click", () => {
    const photo = state.panels[state.selected].photo;
    state.panels.forEach((p) => { p.photo = photo; });
    buildThumbs();
    render();
  });
  document.getElementById("resetPanelBtn").addEventListener("click", () => {
    const panel = state.panels[state.selected];
    if (panel) {
      panel.zoom = 1.15;
      panel.ox = 0;
      panel.oy = 0;
      document.getElementById("zoomRange").value = "1.15";
      render();
    }
  });
  document.getElementById("fileInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const img = await loadImage(dataUrl);
      state.photos.push({ name: file.name.replace(/\.[^.]+$/, "") || "Your photo", img });
    }
    if (files.length) {
      state.panels[state.selected].photo = state.photos.length - 1;
      buildThumbs();
      render();
    }
    e.target.value = "";
  });

  let dragging = false;
  let dragStart = null;
  canvas.addEventListener("pointerdown", (e) => {
    const pt = posterPoint(e);
    const rects = panelRects();
    const hit = rects.findIndex((r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h);
    if (hit < 0) return;
    state.selected = hit;
    const panel = state.panels[hit];
    dragStart = { x: pt.x, y: pt.y, ox: panel.ox, oy: panel.oy };
    dragging = true;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
    document.getElementById("zoomRange").value = String(panel.zoom);
    buildThumbs();
    render();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || !dragStart) return;
    const pt = posterPoint(e);
    const panel = state.panels[state.selected];
    panel.ox = dragStart.ox + (pt.x - dragStart.x);
    panel.oy = dragStart.oy + (pt.y - dragStart.y);
    render();
  });
  const endDrag = () => {
    dragging = false;
    dragStart = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

async function init() {
  for (const sample of SAMPLES) {
    const img = await loadImage(sample.file);
    state.photos.push({ name: sample.name, img });
  }
  rebuildPanels();
  buildThumbs();
  buildChoices();
  wireEvents();
  try {
    await document.fonts.load('100px "Bebas Neue"');
  } catch (e) { /* fall back to the next font in the stack */ }
  render();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => render());
  }
  window.__shotReady = true;
  window.__neonHarbor = { state, render, exportPNG };
}

init();
