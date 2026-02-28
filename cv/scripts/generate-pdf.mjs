import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/cv/`;
const OUT = "Diego_Leyton_CV.pdf";

const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["http-server", "..", "-p", String(PORT), "-c-1", "--silent"],
  { stdio: "inherit" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL, { cache: "no-store" });
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Server did not start: ${URL}`);
}

async function main() {
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Helpful logs in GitHub Actions
  page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.log("[browser:pageerror]", err?.message || err));
  page.on("requestfailed", (req) =>
    console.log("[browser:requestfailed]", req.url(), req.failure()?.errorText)
  );

  page.setDefaultTimeout(60_000);

  console.log("Opening:", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Wait for your app to say it's ready
  console.log("Waiting for CV ready flag…");
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.cvReady === "1",
      null,
      { timeout: 60_000 }
    );
  } catch (e) {
    console.log("CV did not become ready in time. Capturing debug artifacts…");
    await page.screenshot({ path: "cv-debug.png", fullPage: true });
    const html = await page.content();
    fs.writeFileSync("cv-debug.html", html);
    throw e;
  }

  await page.waitForTimeout(300); // tiny settle

  console.log("Generating PDF…");
  await page.emulateMedia({ media: "print" });
  const debug = await page.evaluate(() => ({
    htmlFont: getComputedStyle(document.documentElement).fontSize,
    bodyFont: getComputedStyle(document.body).fontSize,
    media: matchMedia("print").matches ? "print" : "screen"
  }));
  console.log("DEBUG:", debug);
    
  const pdf = await page.pdf({
    format: "Letter",
    printBackground: true,
    margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" }
  });

  fs.writeFileSync(OUT, pdf);
  console.log("PDF written:", OUT);

  await browser.close();
}

main()
  .then(() => server.kill("SIGTERM"))
  .catch((err) => {
    console.error(err);
    server.kill("SIGTERM");
    process.exit(1);
  });
