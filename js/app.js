/* app.js — Tilt, map style, settings, language, schedule download, lazy-loading of the 3D library */
/* ---------- 3D map tilt ---------- */
function setMapTilt(value) {
  const tilt = Math.max(0, Math.min(60, Number(value) || 0));
  $("map").style.setProperty("--map-tilt", tilt + "deg");
  $("map").classList.toggle("map-tilted", tilt > 0);
  $("tiltValue").textContent = tilt + "°";
  schedulePokestopRender();
}
$("mapTilt").oninput = () => setMapTilt($("mapTilt").value);
$("resetTilt").onclick = () => { $("mapTilt").value = 35; setMapTilt(35); };

/* ---------- Map style ---------- */
let savedStyle = "digi"; try { savedStyle = localStorage.getItem("mapStyle") || "digi"; } catch (e) {}
if (savedStyle === "poke") savedStyle = "digi";
try { tod.mode = localStorage.getItem("tod") || "auto"; } catch (e) {}
$("todSel").value = tod.mode;
$("todSel").onchange = () => { tod.mode = $("todSel").value; try { localStorage.setItem("tod", tod.mode); } catch (e) {} applyTod(); track("time_of_day", { mode: tod.mode }); };
if (hasMap) { $("mapStyle").value = savedStyle; setMapStyle(savedStyle); $("mapStyle").onchange = () => { setMapStyle($("mapStyle").value); track("map_style", { style: $("mapStyle").value }); }; }
/* 3D libraries (three.js is ~600 KB) are fetched AFTER the app is on screen, so the first load is much lighter */
function loadScript(src) { return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }); }
function loadThree() {
  if (typeof THREE !== "undefined" && THREE.GLTFLoader) return Promise.resolve();
  return loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js")
    .then(() => loadScript("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"));
}
const start3d = () => loadThree().then(initPokestopOverlay).catch(() => { try { toast(tx("lib3d")); } catch (e) {} });
if (document.readyState === "complete") setTimeout(start3d, 0); else addEventListener("load", () => setTimeout(start3d, 0));

/* ---------- Embedded notice ---------- */
if (window.self !== window.top) {
  $("framedNote").classList.remove("hide");
  $("openFull").onclick = () => { const w = window.open(location.href, "_blank"); if (!w) toast(tx("popup_blocked")); };
}

/* ---------- Settings popover ---------- */
$("gearBtn").onclick = () => $("settings").classList.toggle("hide");
$("setClose").onclick = () => $("settings").classList.add("hide");
document.addEventListener("click", e => { if (!$("settings").classList.contains("hide") && !e.target.closest("#settings,#gearBtn")) $("settings").classList.add("hide"); });

/* ---------- Language ---------- */
$("langSel").onchange = () => { LANG = $("langSel").value; try { localStorage.setItem("lang", LANG); } catch (e) {} applyLang(); track("language", { lang: LANG }); };
applyLang();

/* ---------- Load ---------- */
$("file").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { parse(r.result); populate(); $("pick").classList.add("hide"); };
  r.readAsText(f);
};
(async function init() {
  try {
    const r = await fetch("https://raw.githubusercontent.com/DmonNg/MyRoadDB00/main/bus_schedule_adjusted.txt");
    if (!r.ok) throw 0;
    parse(await r.text()); populate(); LD.sched = 1; ldUpdate();
  } catch (e) { ldFinish(); $("pick").classList.remove("hide"); toast(tx("dl_fail")); }
})();
