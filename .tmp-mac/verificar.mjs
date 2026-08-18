import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const tema of ["light", "dark"]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await p.goto("http://localhost:8097/", { waitUntil: "networkidle" });
  await p.evaluate((t) => { const d = document.documentElement; d.classList.add("mac"); d.setAttribute("data-theme", t); d.setAttribute("data-ventana-activa", "true"); }, tema);
  await p.waitForTimeout(200);
  const activa = await p.evaluate(() => {
    const a = document.querySelector(".nav-item.active");
    return { barra: getComputedStyle(a, "::before").display, bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color };
  });
  await p.screenshot({ path: `/home/user/tesoreria-Mac-/.tmp-mac/mac-${tema}.png`, clip: { x: 0, y: 0, width: 260, height: 800 } });
  await p.evaluate(() => document.documentElement.setAttribute("data-ventana-activa", "false"));
  await p.waitForTimeout(150);
  const sinFoco = await p.evaluate(() => { const a = document.querySelector(".nav-item.active"); return { bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color }; });
  console.log(tema, "ACTIVA", JSON.stringify(activa), "| SIN FOCO", JSON.stringify(sinFoco));
  await p.close();
}
// acento del sistema simulado: si el motor soportara AccentColor
const p2 = await b.newPage({ viewport: { width: 400, height: 200 } });
await p2.setContent(`<div id="x" style="color: AccentColor">t</div>`);
console.log("¿Chromium soporta AccentColor?", await p2.evaluate(() => CSS.supports("color", "AccentColor")));
await b.close();
