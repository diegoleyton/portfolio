// Paste your Apps Script Web App URL here:
const DATA_URL = "https://script.google.com/macros/s/AKfycbzSE3uE_-l5qVDsj-KmYkuggIxjlPq5vuhzFvZL7RFYbVclHTgLyO5kTIv_sZscXMQLHg/exec";

const heroEl = document.getElementById("hero");
const contentEl = document.getElementById("content");
const statusEl = document.getElementById("status");
const generatedAtEl = document.getElementById("generatedAt");

document.getElementById("btnPrint").addEventListener("click", () => window.print());

init();

async function init() {
  try {
    statusEl.textContent = "Loading CV data…";
    const data = await fetchJson(DATA_URL);

    // Your endpoint currently returns arrays (raw rows) or objects depending on your doGet.
    // This frontend expects the "tabs model" OR the "object model".
    // If you used the earlier doGet that returns objects/arrays by tab name, you're good.
    // If your doGet returns raw arrays, we can adapt—this version assumes object model.

    renderHero(data.profile || {});
    renderAll(data);
    if (data.meta?.generatedAt) {
      generatedAtEl.textContent = `Last updated: ${formatDateTime(data.meta.generatedAt)}`;
    } else {
      generatedAtEl.textContent = "";
    }
    statusEl.textContent = "";
    statusEl.style.display = "none";
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Could not load CV data. Check DATA_URL and deployment permissions. (${err.message})`;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  return await res.json();
}

function renderHero(p) {
  const links = [
    p.linkedin_url ? link(p.linkedin_url, "LinkedIn") : "",
    p.portfolio_url ? link(p.portfolio_url, "Portfolio") : "",
    p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "",
    p.phone ? `<span>${esc(p.phone)}</span>` : "",
    p.location ? `<span>${esc(p.location)}</span>` : ""
  ].filter(Boolean).join(`<span class="muted">·</span>`);

  heroEl.innerHTML = `
    <h1 class="h-name">${esc(p.full_name || "")}</h1>
    <div class="h-headline">${esc(p.headline || "")}</div>
    <div class="h-meta">${links}</div>
    ${(p.summary_1 || p.summary_2) ? `
      <div class="h-summary">
        ${p.summary_1 ? `<div>${esc(p.summary_1)}</div>` : ""}
        ${p.summary_2 ? `<div>${esc(p.summary_2)}</div>` : ""}
      </div>
    ` : ""}
  `;
}

function renderAll(d) {
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const orderedKeys = sections.length
    ? sections
        .filter(s => truthy(s.enabled))
        .sort((a,b) => num(a.order) - num(b.order))
        .map(s => String(s.key))
    : ["career_summary","impact","experience","projects","skills","education","publications","languages"];

  const blocks = [];
  for (const key of orderedKeys) {
    if (key === "career_summary") blocks.push(renderBulletsSection("Career Summary", d.career_summary, "bullet"));
    if (key === "impact") blocks.push(renderImpact("Impact Summary", d.impact));
    if (key === "experience") blocks.push(renderExperience("Experience", d.experience, d.experience_bullets));
    if (key === "projects") blocks.push(renderProjects("Projects", d.projects));
    if (key === "skills") blocks.push(renderSkills("Technical Skills", d.skills));
    if (key === "education") blocks.push(renderEducation("Education", d.education));
    if (key === "publications") blocks.push(renderPublications("Publications", d.publications));
    if (key === "languages") blocks.push(renderBulletsSection("Languages", (d.languages||[]).map(x=>({bullet:`${x.language} — ${x.level}`})), "bullet"));
  }

  contentEl.innerHTML = blocks.filter(Boolean).join("\n");
}

function renderBulletsSection(title, rows, field) {
  const items = (rows || [])
    .slice()
    .sort((a,b) => num(a.order) - num(b.order))
    .map(r => r[field])
    .filter(Boolean);

  if (!items.length) return "";
  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div class="card">
        <ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      </div>
    </section>
  `;
}

function renderImpact(title, rows) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const byCat = groupBy(rows, r => String(r.category || "Impact").trim() || "Impact");

  const cards = [];
  for (const [cat, items] of byCat.entries()) {
    const sorted = items.slice().sort((a, b) => num(a.order) - num(b.order));

    // Each row.bullet can contain multiple paragraphs separated by a blank line
    const paragraphs = sorted
      .map(r => String(r.bullet || ""))
      .flatMap(splitIntoParagraphs)
      .map(p => p.trim())
      .filter(Boolean);

    const html = paragraphs.map((p, idx) => {
      const safe = normalizeLeadingBullet(p);
      const sep = (idx < paragraphs.length - 1) ? `<div class="impact-divider"></div>` : "";
      return `<p class="impact-p">${esc(safe)}</p>${sep}`;
    }).join("");

    cards.push(`
      <div class="card impact-card">
        <div class="impact-cat">${esc(cat)}</div>
        <div class="impact-body">${html}</div>
      </div>
    `);
  }

  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div class="grid-2">${cards.join("")}</div>
    </section>
  `;
}

function splitIntoParagraphs(text) {
  // Split by blank lines (two or more newlines)
  return String(text).split(/\r?\n\s*\r?\n+/);
}

function normalizeLeadingBullet(line) {
  // If you pasted lines starting with "-" or "•", strip that marker.
  return String(line).replace(/^[-•]\s*/, "");
}

function renderExperience(title, roles, bullets) {
  if (!Array.isArray(roles) || !roles.length) return "";
  const roleList = roles.slice().sort((a,b)=>num(a.order)-num(b.order));
  const bulletList = Array.isArray(bullets) ? bullets : [];

  const byGroup = groupBy(roleList, r => String(r.company_group || r.company || "Experience"));
  const groupsHtml = [];

  for (const [groupName, groupRoles] of byGroup.entries()) {
    // find group summary (first non-empty one)
    const groupSummary = groupRoles
      .map(r => r.group_summary)
      .find(Boolean);
  
    const itemsHtml = groupRoles.map(r => {
      const rBullets = bulletList
        .filter(b => String(b.role_id) === String(r.id))
        .sort((a,b)=>num(a.order)-num(b.order));
  
      const bulletHtml = rBullets.length
        ? `<ul>${rBullets.map(p => `<li>${esc(p.bullet || "")}</li>`).join("")}</ul>`
        : "";
  
      const companyLine = [
        esc(r.company || ""),
        r.location ? esc(r.location) : ""
      ].filter(Boolean).join(" · ");
  
      return `
        <div class="role">
          <div class="role-title">
            <div class="left">${esc(r.role_title || "")}</div>
            <div class="right">${esc(formatRange(r.start, r.end))}</div>
          </div>
          <div class="role-sub">${companyLine}</div>
          ${r.summary ? `<div class="role-summary">${esc(r.summary)}</div>` : ""}
          ${bulletHtml}
        </div>
      `;
    }).join("");
  
    groupsHtml.push(`
      <div class="card">
        <div class="exp-group-title">${esc(groupName)}</div>
  
        ${groupSummary ? `
          <div class="exp-group-summary">${esc(groupSummary)}</div>
        ` : ""}
  
        ${itemsHtml}
      </div>
    `);
  }

  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div style="display:flex; flex-direction:column; gap:14px">${groupsHtml.join("")}</div>
    </section>
  `;
}

function renderProjects(title, rows) {
  const list = (rows || []).slice().sort((a,b)=>num(a.order)-num(b.order));
  if (!list.length) return "";
  const cards = list.map(p => {
    const tags = String(p.tags || "").split(",").map(t=>t.trim()).filter(Boolean);
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:baseline">
          <div style="font-weight:700">${esc(p.title || "")}</div>
          ${p.url ? link(p.url, shortUrl(p.url)) : ""}
        </div>
        <div class="muted" style="margin-top:10px; line-height:1.5">${esc(p.description || "")}</div>
        ${tags.length ? `<div class="chips">${tags.map(t=>`<div class="chip">${esc(t)}</div>`).join("")}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div style="display:flex; flex-direction:column; gap:14px">${cards}</div>
    </section>
  `;
}

function renderSkills(title, rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const byGroup = groupBy(rows, r => String(r.group || "Skills"));
  const cards = [];
  for (const [g, items] of byGroup.entries()) {
    const sorted = items.slice().sort((a,b)=>num(a.order)-num(b.order));
    cards.push(`
      <div class="card">
        <div style="font-weight:700; margin-bottom:10px">${esc(g)}</div>
        <div class="chips">${sorted.map(s => `<div class="chip">${esc(s.item || "")}</div>`).join("")}</div>
      </div>
    `);
  }
  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div class="grid-2">${cards.join("")}</div>
    </section>
  `;
}

function renderEducation(title, rows) {
  const list = (rows || []).slice().sort((a,b)=>num(a.order)-num(b.order));
  if (!list.length) return "";
  const html = list.map(e => `
    <div class="role">
      <div class="role-title">
        <div class="left">${esc(e.degree || "")}${e.field ? `, ${esc(e.field)}` : ""}</div>
        <div class="right">${esc(rangeYears(e.start_year, e.end_year))}</div>
      </div>
      <div class="role-sub">${esc(e.school || "")}${e.location ? ` · ${esc(e.location)}` : ""}</div>
      ${e.notes ? `<div class="role-summary">${esc(e.notes)}</div>` : ""}
    </div>
  `).join("");

  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div class="card">${html}</div>
    </section>
  `;
}

function renderPublications(title, rows) {
  const list = (rows || []).slice().sort((a,b)=>num(a.order)-num(b.order));
  if (!list.length) return "";
  const html = list.map(p => {
    const doi = (p.doi || "").toString().trim();
    const url = (p.url || "").toString().trim();
    const tail = [
      doi ? `DOI: ${doi}` : "",
      url ? link(url, shortUrl(url)) : ""
    ].filter(Boolean).join(" · ");

    return `<li>${esc(p.citation || "")}${tail ? `<div class="muted" style="margin-top:6px">${tail}</div>` : ""}</li>`;
  }).join("");

  return `
    <section class="section">
      <h2>${esc(title)}</h2>
      <div class="card">
        <ul>${html}</ul>
      </div>
    </section>
  `;
}

// utils
function groupBy(arr, fn) {
  const m = new Map();
  arr.forEach(x => {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}

function esc(s) {
  return String(s ?? "");
}
function num(x) {
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : 999999;
}
function truthy(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}
function formatRange(start, end) {
  const a = fmtYM(start);
  const b = end ? fmtYM(end) : "Present";
  return [a, b].filter(Boolean).join(" — ");
}
function fmtYM(ym) {
  const s = String(ym ?? "").trim();
  if (!s) return "";
  const [y, m] = s.split("-").map(x => parseInt(x, 10));
  if (!y || !m) return s;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m-1] || "?"} ${y}`;
}
function shortUrl(url) {
  try {
    const u = new URL(String(url));
    return u.hostname.replace(/^www\./, "");
  } catch { return String(url); }
}
function rangeYears(a,b) {
  const A = String(a ?? "").trim();
  const B = String(b ?? "").trim();
  if (!A && !B) return "";
  if (A && !B) return A;
  if (!A && B) return B;
  return `${A} — ${B}`;
}
function link(url, label) {
  const u = esc(url);
  const l = esc(label || url);
  return `<a href="${u}" target="_blank" rel="noreferrer">${l}</a>`;
}
function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" });
  } catch { return iso; }
}
