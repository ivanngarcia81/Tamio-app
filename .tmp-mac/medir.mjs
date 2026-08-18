import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await p.goto("http://localhost:8097/", { waitUntil: "networkidle" });
  await p.evaluate(() => document.documentElement.classList.add("mac"));
await p.waitForTimeout(400);
const r = await p.evaluate(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const c = getComputedStyle(e); return { h: +b.height.toFixed(1), w: +b.width.toFixed(1), fs: c.fontSize, fw: c.fontWeight, bg: c.backgroundColor, color: c.color }; };
  return {
    sidebar: g(".sidebar"), item: g(".nav-item"), activo: g(".nav-item.active"),
    grupoHead: g(".nav-group-head"), badge: g(".nav-item .badge"), church: g(".church-select"),
    barraAcento: document.querySelector(".nav-item.active") ? getComputedStyle(document.querySelector(".nav-item.active"), "::before").width : null,
    filas: document.querySelectorAll(".nav-item").length,
  };
});
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: "/home/user/tesoreria-Mac-/.tmp-mac/antes.png", clip: { x: 0, y: 0, width: 320, height: 800 } });
await b.close();
