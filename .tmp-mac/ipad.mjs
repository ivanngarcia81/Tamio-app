import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 834, height: 1112 } });
await p.goto("http://localhost:8097/", { waitUntil: "networkidle" });
// iPad = clase `movil`, SIN `mac`
await p.evaluate(() => document.documentElement.classList.add("movil"));
await p.waitForTimeout(200);
console.log(JSON.stringify(await p.evaluate(() => {
  const g = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); const c = getComputedStyle(e); return { h: +b.height.toFixed(1), fs: c.fontSize, bg: c.backgroundColor }; };
  return { sidebarW: +document.querySelector(".sidebar").getBoundingClientRect().width.toFixed(1),
    item: g(".nav-item"), activo: g(".nav-item.active"), badge: g(".nav-item .badge"),
    church: g(".church-select"), perfil: g(".perfil-avatar"),
    barra: getComputedStyle(document.querySelector(".nav-item.active"), "::before").display };
})));
await b.close();
