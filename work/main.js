// ====== CONFIG ======
const DATA_URL = "https://script.google.com/macros/s/AKfycbzSE3uE_-l5qVDsj-KmYkuggIxjlPq5vuhzFvZL7RFYbVclHTgLyO5kTIv_sZscXMQLHg/exec"; 

const $ = (sel) => document.querySelector(sel);

function num(x){ const n = Number(x); return Number.isFinite(n) ? n : 0; }

// Allow only a small safe subset of HTML.
// Supports <b>, <strong>, <i>, <em>, <br>, <a href="...">.
function safeHTML(input) {
  const html = String(input ?? "");
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  const ALLOWED = new Set(["B","STRONG","I","EM","BR","A"]);
  const walk = (node) => {
    const kids = Array.from(node.childNodes);
    for (const k of kids) {
      if (k.nodeType === Node.ELEMENT_NODE) {
        const tag = k.tagName.toUpperCase();
        if (!ALLOWED.has(tag)) {
          // replace disallowed element with its text content
          const txt = document.createTextNode(k.textContent || "");
          k.replaceWith(txt);
          continue;
        }
        // sanitize attributes
        for (const attr of Array.from(k.attributes)) {
          const name = attr.name.toLowerCase();
          if (tag === "A") {
            if (name !== "href" && name !== "target" && name !== "rel") k.removeAttribute(attr.name);
          } else {
            k.removeAttribute(attr.name);
          }
        }
        if (tag === "A") {
          const href = (k.getAttribute("href") || "").trim();
          // block javascript: / data: etc
          if (!href || /^javascript:/i.test(href) || /^data:/i.test(href)) {
            const txt = document.createTextNode(k.textContent || "");
            k.replaceWith(txt);
            continue;
          }
          k.setAttribute("target", "_blank");
          k.setAttribute("rel", "noopener noreferrer");
        }
        walk(k);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

function groupBy(arr, keyFn){
  const m = new Map();
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function parseBool(x){
  const s = String(x ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function parseLinksCell(v){
  const s = String(v ?? "").trim();
  if (!s) return [];
  // Try JSON first (your sheet currently uses JSON array)
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr
        .map(o => ({ label: String(o.label || "").trim(), url: String(o.url || "").trim() }))
        .filter(x => x.label && x.url);
    }
  } catch {}
  // Fallback: lines "Label|URL"
  return s.split("\n")
    .map(line => line.split("|"))
    .filter(p => p.length === 2)
    .map(([label,url]) => ({ label: label.trim(), url: url.trim() }))
    .filter(x => x.label && x.url);
}

function normalizeImagePath(img){
  const s = String(img ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  // treat as relative to /work/
  return s; // e.g. "assets/marmilo.png"
}

// ====== RENDERERS ======

function renderHero(profile){
  if (!profile) return "";

  const showEmail = parseBool(profile.show_email);
  const showPhone = parseBool(profile.show_phone);

  const contactBits = [
    profile.linkedin_url ? `<a href="${profile.linkedin_url}">LinkedIn</a>` : "",
    showEmail && profile.email ? `<a href="mailto:${profile.email}">${profile.email}</a>` : "",
    showPhone && profile.phone ? `${profile.phone}` : "",
    profile.location ? `${profile.location}` : ""
  ].filter(Boolean).join(`<span class="dot">•</span>`);

  const summary = safeHTML(profile.summary_1 || "");

  return `
    <div class="hero-title">${safeHTML(profile.full_name || "")}</div>
    <div class="hero-sub">${safeHTML(profile.headline || "")}</div>
    <div class="hero-meta">${contactBits}</div>
    ${summary ? `<div class="hero-summary">${summary}</div>` : ""}
    <div class="hero-cta">
      <a class="btn" href="../cv/">View CV</a>
    </div>
  `;
}

function renderCareerSummary(rows){
  const items = (rows || []).slice().sort((a,b)=>num(a.order)-num(b.order));
  if (!items.length) return `<div class="muted">No career summary yet.</div>`;
  return `
    <ul class="bullets">
      ${items.map(r => `<li>${safeHTML(r.bullet || "")}</li>`).join("")}
    </ul>
  `;
}

function splitIntoParagraphs(text) {
  return String(text ?? "")
    .split(/\n\s*\n/g) // blank line separated
    .map(s => s.trim())
    .filter(Boolean);
}

function renderImpact(rows){
  const items = (rows || []).slice().sort((a,b)=>num(a.order)-num(b.order));
  const byCat = groupBy(items, r => String(r.category || "Impact").trim() || "Impact");

  const cards = [];
  for (const [cat, list] of byCat.entries()) {
    const paragraphs = list
      .flatMap(r => splitIntoParagraphs(r.bullet || ""))
      .filter(Boolean);

    const body = paragraphs.map((p, idx) => {
      const divider = idx < paragraphs.length - 1 ? `<div class="impact-divider"></div>` : "";
      return `<p class="impact-p">${safeHTML(p)}</p>${divider}`;
    }).join("");

    cards.push(`
      <div class="card impact-card">
        <div class="impact-cat">${safeHTML(cat)}</div>
        <div class="impact-body">${body}</div>
      </div>
    `);
  }

  return `<div class="grid-2">${cards.join("")}</div>`;
}

function renderProjects(categories, projects){
  const cats = (categories || []).slice().sort((a,b)=>num(a.order)-num(b.order));
  const visibleProjects = (projects || []).filter(p => parseBool(p.visible));

  const byCat = groupBy(visibleProjects, p => String(p.category || "").trim());

  const sections = cats.map(c => {
    const catName = String(c.category || "").trim();
    const list = (byCat.get(catName) || []).slice().sort((a,b)=>num(a.order)-num(b.order));
    if (!list.length) return "";

    const catDesc = safeHTML(c.description || "");

    const cards = list.map(p => {
      const links = parseLinksCell(p.links);
      const img = normalizeImagePath(p.image);
      const hasImg = Boolean(img);

      const buttons = links.map(l => (
        `<a class="linkbtn" href="${l.url}" target="_blank" rel="noopener noreferrer">${safeHTML(l.label)}</a>`
      )).join("");

      return `
        <div class="card proj-card">
          <div class="proj-head">
            ${hasImg ? `<img class="proj-thumb" src="${img}" alt="">` : ""}
            <div class="proj-text">
              <div class="proj-title">${safeHTML(p.title || "")}</div>
              <div class="proj-desc">${safeHTML(p.description || "")}</div>
              ${buttons ? `<div class="proj-links">${buttons}</div>` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="section">
        <h3 class="cat-title">${safeHTML(catName)}</h3>
        ${catDesc ? `<div class="cat-desc">${catDesc}</div>` : ""}
        <div class="proj-grid">${cards}</div>
      </section>
    `;
  }).join("");

  return sections || `<div class="muted">No projects yet.</div>`;
}

// ====== MAIN ======
async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
  return await res.json();
}

function findProfile(data){
  const arr = data?.profile;
  if (Array.isArray(arr)) return arr[0] || null;
  if (arr && typeof arr === "object") return arr;
  return null;
}

(async function main(){
  const status = $("#status");
  try{
    status.textContent = "Loading…";
    const data = await loadData();

    const profile = findProfile(data);

    $("#hero").innerHTML = renderHero(profile);
    $("#career").innerHTML = renderCareerSummary(data.career_summary || []);
    $("#impact").innerHTML = renderImpact(data.impact || []);
    $("#projects").innerHTML = renderProjects(data.portfolio_categories || [], data.portfolio_projects || []);

    $("#generatedAt").textContent = `Updated: ${new Date().toLocaleString()}`;

    status.textContent = "";
  } catch (e) {
    console.error(e);
    status.textContent = `Error loading data: ${e?.message || e}`;
  }
})();
