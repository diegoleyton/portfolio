import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/cv/`;
const OUT = "Diego_Leyton_CV.pdf";

// start static server
const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["http-server", "..", "-p", PORT, "-c-1", "--silent"]
);

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function waitServer(){
  for(let i=0;i<40;i++){
    try{
      const res = await fetch(URL);
      if(res.ok) return;
    }catch{}
    await sleep(250);
  }
  throw new Error("Server failed");
}

(async()=>{
  await waitServer();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil:"networkidle" });

  await page.waitForSelector("#content *",{timeout:60000});

  const pdf = await page.pdf({
    format:"Letter",
    printBackground:true,
    margin:{top:"8mm",right:"8mm",bottom:"8mm",left:"8mm"}
  });

  fs.writeFileSync(OUT,pdf);
  await browser.close();
  server.kill();
})();
