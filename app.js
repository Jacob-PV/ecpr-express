/* eCPR Express — client-side certified payroll generator.
   All data stays in localStorage. No server. */
(function () {
"use strict";

const LS_KEY = "ecprx-v1";

/* Monetization config — dormant until checkoutUrl is set.
   To go live: create a Lemon Squeezy product, paste its checkout URL below,
   set enabled:true. License keys are validated client-side via the public
   license API (no secret needed for activate/validate). */
const PAYWALL = Object.assign({
  enabled: false,
  freeReports: 3,
  checkoutUrl: "",            // e.g. https://yourstore.lemonsqueezy.com/checkout/buy/PRODUCT-UUID
  priceText: "$19/month — unlimited reports, founding price"
}, window.ECPRX_PAYWALL_OVERRIDE || {});

/* ---------- state ---------- */

function blankState() {
  return {
    company: {
      name: "", role: "subcontractor",
      licenseType: "CSLB", licenseNum: "", pwcr: "", fein: "",
      street: "", city: "", state: "CA", zip: "",
      insuranceNum: "", email: ""
    },
    projects: [],   // {id,label,dirProjectID,contractAgency,awardingBody,projectNum,contractID,locDesc,locStreet,locCity,locCounty,locState,locZip}
    employees: [],  // {id,name,street,city,state,zip,ssn,exemptions,workClass,rateST,rateOT,rateDT,fringeRate}
    weeks: []       // {id,projectId,weekEnding,payrollNum,nonPerformance,signName,signTitle,fringeOption,remarks,entries:[{employeeId,days:[{st,ot,dt}x7],grossAllWork,ded:{...},checkNum,notes}]}
  };
}

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return Object.assign(blankState(), JSON.parse(raw));
  } catch (e) { /* fall through */ }
  return blankState();
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function uid() { return Math.random().toString(36).slice(2, 10); }

/* ---------- helpers ---------- */

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function escAttr(s) { return esc(s); }
function n2(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function money(v) { return n2(v).toFixed(2); }
function dec1(v) { return String(Math.round(n2(v) * 100) / 100); }

function weekDates(weekEnding) {
  // returns 7 Date objects, oldest first, ending on weekEnding
  const end = new Date(weekEnding + "T00:00:00");
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i); out.push(d);
  }
  return out;
}
function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function mmddyy(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return m + d + y.slice(2);
}
const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];

function entryGrossThisProject(emp, entry) {
  let g = 0;
  entry.days.forEach(d => { g += n2(d.st) * n2(emp.rateST) + n2(d.ot) * n2(emp.rateOT) + n2(d.dt) * n2(emp.rateDT); });
  return g;
}
function entryTotals(entry) {
  const t = { st: 0, ot: 0, dt: 0 };
  entry.days.forEach(d => { t.st += n2(d.st); t.ot += n2(d.ot); t.dt += n2(d.dt); });
  return t;
}
const DED_FIELDS = [
  ["fedTax", "Federal tax"], ["fica", "FICA"], ["stateTax", "State tax"], ["sdi", "SDI"],
  ["vacationHoliday", "Vacation/Holiday"], ["healthWelfare", "Health & Welfare"], ["pension", "Pension"],
  ["training", "Training"], ["fundAdmin", "Fund admin"], ["dues", "Dues"],
  ["travelSubs", "Travel/Subs"], ["savings", "Savings"], ["other", "Other"]
];
function dedTotal(ded) { return DED_FIELDS.reduce((s, f) => s + n2(ded[f[0]]), 0); }

/* ---------- tabs ---------- */

$all(".tab").forEach(btn => btn.addEventListener("click", () => {
  $all(".tab").forEach(b => b.classList.remove("active"));
  $all(".panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  $("#panel-" + btn.dataset.tab).classList.add("active");
}));
function gotoTab(name) { $(".tab[data-tab=" + name + "]").click(); }

/* ---------- company panel ---------- */

function renderCompany() {
  const c = state.company;
  $("#panel-company").innerHTML = `
    <h2>Your company</h2>
    <p class="hint">This appears on every report. Saved automatically on this device.</p>
    <div class="grid">
      <div class="field"><label>Business name</label><input id="c-name" value="${escAttr(c.name)}"></div>
      <div class="field"><label>You are the…</label>
        <select id="c-role">
          <option value="contractor"${c.role === "contractor" ? " selected" : ""}>Prime contractor</option>
          <option value="subcontractor"${c.role === "subcontractor" ? " selected" : ""}>Subcontractor</option>
        </select></div>
      <div class="field"><label>License type</label>
        <select id="c-licenseType">
          ${["CSLB", "PL", "OTHER"].map(t => `<option${c.licenseType === t ? " selected" : ""}>${t}</option>`).join("")}
        </select></div>
      <div class="field"><label>License number</label><input id="c-licenseNum" value="${escAttr(c.licenseNum)}"></div>
      <div class="field"><label>DIR PWCR registration # (10 digits, or NA)</label><input id="c-pwcr" value="${escAttr(c.pwcr)}" placeholder="1000012345"></div>
      <div class="field"><label>FEIN (9 digits, no dash)</label><input id="c-fein" value="${escAttr(c.fein)}" placeholder="123456789"></div>
      <div class="field"><label>Street</label><input id="c-street" value="${escAttr(c.street)}"></div>
      <div class="field"><label>City</label><input id="c-city" value="${escAttr(c.city)}"></div>
      <div class="field"><label>State (2 letters)</label><input id="c-state" value="${escAttr(c.state)}" maxlength="2"></div>
      <div class="field"><label>ZIP (5 digits)</label><input id="c-zip" value="${escAttr(c.zip)}" maxlength="5"></div>
      <div class="field"><label>Workers' comp insurance / policy #</label><input id="c-insuranceNum" value="${escAttr(c.insuranceNum)}"></div>
      <div class="field"><label>Email</label><input id="c-email" value="${escAttr(c.email)}"></div>
    </div>
    <div class="row-actions">
      <button class="primary" id="c-save">Save company</button>
      <span class="saved-flash" id="c-flash"></span>
    </div>`;
  $("#c-save").addEventListener("click", () => {
    ["name", "licenseNum", "pwcr", "fein", "street", "city", "insuranceNum", "email"].forEach(k => c[k] = $("#c-" + k).value.trim());
    c.role = $("#c-role").value;
    c.licenseType = $("#c-licenseType").value;
    c.state = $("#c-state").value.trim().toUpperCase();
    c.zip = $("#c-zip").value.trim();
    save();
    $("#c-flash").textContent = "Saved ✓";
    setTimeout(() => { $("#c-flash").textContent = ""; }, 2000);
  });
}

/* ---------- projects panel ---------- */

function renderProjects() {
  const items = state.projects.map(p => `
    <div class="list-item">
      <div><div class="title">${esc(p.label || p.projectNum || "Project")}</div>
      <div class="meta">DIR Project ID: ${esc(p.dirProjectID || "—")} · Contract with: ${esc(p.contractAgency || "—")}</div></div>
      <div><button class="secondary" data-edit="${p.id}">Edit</button>
      <button class="danger" data-del="${p.id}">Delete</button></div>
    </div>`).join("");
  $("#panel-projects").innerHTML = `
    <h2>Projects</h2>
    <p class="hint">One entry per public-works job. The DIR Project ID is the "PWC-100 number" — look it up at
    <a href="https://www.dir.ca.gov/pwc100ext/ExternalLookup.aspx" target="_blank" rel="noopener">DIR project lookup</a>.</p>
    <div class="list">${items || "<p class='hint'>No projects yet — add your first below.</p>"}</div>
    <h3 id="p-form-title">Add a project</h3>
    <div class="grid">
      <div class="field"><label>Nickname (for your menu)</label><input id="p-label" placeholder="Main St sewer job"></div>
      <div class="field"><label>DIR Project ID (PWC-100 #)</label><input id="p-dirProjectID"></div>
      <div class="field"><label>Contract with (awarding body or hiring contractor — exactly as on PWC-100/contract)</label><input id="p-contractAgency"></div>
      <div class="field"><label>Awarding body (optional)</label><input id="p-awardingBody"></div>
      <div class="field"><label>Project name (optional)</label><input id="p-projectName"></div>
      <div class="field"><label>Your project / contract # (optional)</label><input id="p-projectNum"></div>
      <div class="field"><label>Project street (optional)</label><input id="p-locStreet"></div>
      <div class="field"><label>City (optional)</label><input id="p-locCity"></div>
      <div class="field"><label>County (optional)</label><input id="p-locCounty"></div>
      <div class="field"><label>State (optional)</label><input id="p-locState" maxlength="2" value="CA"></div>
      <div class="field"><label>ZIP (optional)</label><input id="p-locZip" maxlength="5"></div>
    </div>
    <div class="row-actions">
      <button class="primary" id="p-save">Save project</button>
      <span class="saved-flash" id="p-flash"></span>
    </div>`;
  let editingId = null;
  $("#p-save").addEventListener("click", () => {
    const proj = {
      id: editingId || uid(),
      label: $("#p-label").value.trim(),
      dirProjectID: $("#p-dirProjectID").value.trim(),
      contractAgency: $("#p-contractAgency").value.trim(),
      awardingBody: $("#p-awardingBody").value.trim(),
      projectName: $("#p-projectName").value.trim(),
      projectNum: $("#p-projectNum").value.trim(),
      locStreet: $("#p-locStreet").value.trim(),
      locCity: $("#p-locCity").value.trim(),
      locCounty: $("#p-locCounty").value.trim(),
      locState: $("#p-locState").value.trim().toUpperCase(),
      locZip: $("#p-locZip").value.trim()
    };
    if (!proj.dirProjectID && !proj.label) { alert("Give the project at least a nickname or DIR Project ID."); return; }
    const i = state.projects.findIndex(x => x.id === proj.id);
    if (i >= 0) state.projects[i] = proj; else state.projects.push(proj);
    save(); renderProjects(); renderWeekly();
  });
  $all("[data-del]", $("#panel-projects")).forEach(b => b.addEventListener("click", () => {
    if (!confirm("Delete this project?")) return;
    state.projects = state.projects.filter(p => p.id !== b.dataset.del);
    save(); renderProjects(); renderWeekly();
  }));
  $all("[data-edit]", $("#panel-projects")).forEach(b => b.addEventListener("click", () => {
    const p = state.projects.find(x => x.id === b.dataset.edit);
    if (!p) return;
    editingId = p.id;
    $("#p-form-title").textContent = "Edit project";
    $("#p-label").value = p.label; $("#p-dirProjectID").value = p.dirProjectID;
    $("#p-contractAgency").value = p.contractAgency; $("#p-awardingBody").value = p.awardingBody || "";
    $("#p-projectName").value = p.projectName || ""; $("#p-projectNum").value = p.projectNum || "";
    $("#p-locStreet").value = p.locStreet || ""; $("#p-locCity").value = p.locCity || "";
    $("#p-locCounty").value = p.locCounty || ""; $("#p-locState").value = p.locState || "";
    $("#p-locZip").value = p.locZip || "";
    $("#p-form-title").scrollIntoView({ behavior: "smooth" });
  }));
}

/* ---------- employees panel ---------- */

function renderEmployees() {
  const items = state.employees.map(e => `
    <div class="list-item">
      <div><div class="title">${esc(e.name)}</div>
      <div class="meta">${esc(e.workClass)} · $${money(e.rateST)}/hr ST · SSN ···${esc(String(e.ssn).slice(-4))}</div></div>
      <div><button class="secondary" data-edit="${e.id}">Edit</button>
      <button class="danger" data-del="${e.id}">Delete</button></div>
    </div>`).join("");
  $("#panel-employees").innerHTML = `
    <h2>Crew</h2>
    <p class="hint">Enter each worker once. SSNs are stored only in your browser — required on the DIR eCPR; the WH-347 shows only the last 4 digits.</p>
    <div class="list">${items || "<p class='hint'>No workers yet — add your crew below.</p>"}</div>
    <h3 id="e-form-title">Add a worker</h3>
    <div class="grid">
      <div class="field"><label>Full name</label><input id="e-name"></div>
      <div class="field"><label>SSN (9 digits, no dashes)</label><input id="e-ssn" maxlength="9"></div>
      <div class="field"><label>Withholding exemptions</label><input id="e-exemptions" type="number" min="0" value="0"></div>
      <div class="field"><label>Work classification (per wage determination)</label><input id="e-workClass" placeholder="Laborer Group 1"></div>
      <div class="field"><label>Straight-time rate ($/hr)</label><input id="e-rateST" type="number" step="0.01"></div>
      <div class="field"><label>Overtime rate ($/hr)</label><input id="e-rateOT" type="number" step="0.01"></div>
      <div class="field"><label>Double-time rate ($/hr)</label><input id="e-rateDT" type="number" step="0.01"></div>
      <div class="field"><label>Fringe rate paid in cash ($/hr, for WH-347 box, optional)</label><input id="e-fringeRate" type="number" step="0.01"></div>
      <div class="field"><label>Street</label><input id="e-street"></div>
      <div class="field"><label>City</label><input id="e-city"></div>
      <div class="field"><label>State</label><input id="e-state" maxlength="2" value="CA"></div>
      <div class="field"><label>ZIP</label><input id="e-zip" maxlength="5"></div>
    </div>
    <div class="row-actions">
      <button class="primary" id="e-save">Save worker</button>
      <span class="saved-flash" id="e-flash"></span>
    </div>`;
  let editingId = null;
  $("#e-save").addEventListener("click", () => {
    const emp = {
      id: editingId || uid(),
      name: $("#e-name").value.trim(),
      ssn: $("#e-ssn").value.replace(/\D/g, ""),
      exemptions: $("#e-exemptions").value.trim() || "0",
      workClass: $("#e-workClass").value.trim(),
      rateST: $("#e-rateST").value, rateOT: $("#e-rateOT").value, rateDT: $("#e-rateDT").value,
      fringeRate: $("#e-fringeRate").value,
      street: $("#e-street").value.trim(), city: $("#e-city").value.trim(),
      state: $("#e-state").value.trim().toUpperCase(), zip: $("#e-zip").value.trim()
    };
    if (!emp.name) { alert("Worker needs a name."); return; }
    const i = state.employees.findIndex(x => x.id === emp.id);
    if (i >= 0) state.employees[i] = emp; else state.employees.push(emp);
    save(); renderEmployees(); renderWeekly();
  });
  $all("[data-del]", $("#panel-employees")).forEach(b => b.addEventListener("click", () => {
    if (!confirm("Delete this worker?")) return;
    state.employees = state.employees.filter(e => e.id !== b.dataset.del);
    save(); renderEmployees(); renderWeekly();
  }));
  $all("[data-edit]", $("#panel-employees")).forEach(b => b.addEventListener("click", () => {
    const e = state.employees.find(x => x.id === b.dataset.edit);
    if (!e) return;
    editingId = e.id;
    $("#e-form-title").textContent = "Edit worker";
    $("#e-name").value = e.name; $("#e-ssn").value = e.ssn;
    $("#e-exemptions").value = e.exemptions; $("#e-workClass").value = e.workClass;
    $("#e-rateST").value = e.rateST; $("#e-rateOT").value = e.rateOT; $("#e-rateDT").value = e.rateDT;
    $("#e-fringeRate").value = e.fringeRate || "";
    $("#e-street").value = e.street; $("#e-city").value = e.city;
    $("#e-state").value = e.state; $("#e-zip").value = e.zip;
    $("#e-form-title").scrollIntoView({ behavior: "smooth" });
  }));
}

/* ---------- weekly panel ---------- */

let week = null; // working copy

function newWeek() {
  return {
    id: uid(), projectId: state.projects[0] ? state.projects[0].id : "",
    weekEnding: "", payrollNum: "", nonPerformance: false,
    signName: "", signTitle: "", fringeOption: "cash", remarks: "",
    entries: []
  };
}
function blankEntry(employeeId) {
  return {
    employeeId,
    days: [0, 1, 2, 3, 4, 5, 6].map(() => ({ st: "", ot: "", dt: "" })),
    grossAllWork: "", checkNum: "", notes: "",
    ded: DED_FIELDS.reduce((o, f) => (o[f[0]] = "", o), {})
  };
}

function renderWeekly() {
  if (!week) week = newWeek();
  if (!state.projects.find(p => p.id === week.projectId)) {
    week.projectId = state.projects[0] ? state.projects[0].id : "";
  }
  const projOpts = state.projects.map(p =>
    `<option value="${p.id}"${week.projectId === p.id ? " selected" : ""}>${esc(p.label || p.dirProjectID)}</option>`).join("");
  const history = state.weeks.slice().reverse().slice(0, 10).map(w => {
    const p = state.projects.find(x => x.id === w.projectId);
    return `<div class="list-item"><div><div class="title">Week ending ${esc(w.weekEnding)}</div>
      <div class="meta">${esc(p ? (p.label || p.dirProjectID) : "?")} · payroll #${esc(w.payrollNum || "—")} · ${w.entries.length} worker(s)</div></div>
      <div><button class="secondary" data-loadweek="${w.id}">Open</button></div></div>`;
  }).join("");

  const dates = week.weekEnding ? weekDates(week.weekEnding) : null;

  const empBlocks = state.employees.length === 0
    ? "<p class='hint'>Add workers in the Crew tab first.</p>"
    : state.employees.map(emp => {
        const entry = week.entries.find(en => en.employeeId === emp.id);
        const included = !!entry;
        let block = `
        <div class="emp-week">
          <h4><label style="font-size:15px;color:var(--ink)">
            <input type="checkbox" style="width:auto" data-inc="${emp.id}"${included ? " checked" : ""}>
            ${esc(emp.name)} <span class="hint" style="display:inline">— ${esc(emp.workClass)}</span></label></h4>`;
        if (included && !week.nonPerformance) {
          const t = entryTotals(entry);
          const gross = entryGrossThisProject(emp, entry);
          block += `
          <table class="hours"><tr><th></th>${(dates || Array(7).fill(null)).map((d, i) =>
            `<th>${d ? DAY_ABBR[d.getDay()] + "<br>" + (d.getMonth() + 1) + "/" + d.getDate() : "Day " + (i + 1)}</th>`).join("")}<th>Total</th></tr>
          ${["st", "ot", "dt"].map(k => `<tr><th style="text-align:left">${k.toUpperCase()}</th>${entry.days.map((d, i) =>
            `<td><input data-hours="${emp.id}:${i}:${k}" value="${escAttr(d[k])}" inputmode="decimal"></td>`).join("")}
            <td class="calc" data-tot="${emp.id}:${k}">${dec1(t[k])}</td></tr>`).join("")}
          </table>
          <div class="ded-grid">
            ${DED_FIELDS.map(f => `<div class="field"><label>${f[1]}</label>
              <input data-ded="${emp.id}:${f[0]}" value="${escAttr(entry.ded[f[0]])}" inputmode="decimal" placeholder="0.00"></div>`).join("")}
            <div class="field"><label>Gross all work (if other jobs too)</label>
              <input data-gaw="${emp.id}" value="${escAttr(entry.grossAllWork)}" placeholder="${money(gross)}"></div>
            <div class="field"><label>Check #</label><input data-check="${emp.id}" value="${escAttr(entry.checkNum)}"></div>
            <div class="field"><label>Notes (optional)</label><input data-notes="${emp.id}" value="${escAttr(entry.notes)}"></div>
          </div>
          <div class="totals-line" data-line="${emp.id}">Gross this project: <strong>$${money(gross)}</strong> ·
            Deductions: <strong>$${money(dedTotal(entry.ded))}</strong> ·
            Net paid: <strong>$${money(n2(entry.grossAllWork || gross) - dedTotal(entry.ded))}</strong></div>`;
        }
        block += "</div>";
        return block;
      }).join("");

  $("#panel-weekly").innerHTML = `
    <h2>Weekly report</h2>
    ${history ? `<details style="margin-bottom:14px"><summary>Previous weeks (${state.weeks.length})</summary><div class="list">${history}</div></details>` : ""}
    <div class="grid">
      <div class="field"><label>Project</label><select id="w-project">${projOpts || "<option value=''>— add a project first —</option>"}</select></div>
      <div class="field"><label>Week ending (date of last day of the workweek)</label><input id="w-weekEnding" type="date" value="${escAttr(week.weekEnding)}"></div>
      <div class="field"><label>Payroll # (1 for first week on the job, then 2, 3…)</label><input id="w-payrollNum" value="${escAttr(week.payrollNum)}"></div>
      <div class="field"><label>Statement of non-performance (no work this week)</label>
        <select id="w-np"><option value="no"${!week.nonPerformance ? " selected" : ""}>No — crew worked</option>
        <option value="yes"${week.nonPerformance ? " selected" : ""}>Yes — no work performed</option></select></div>
    </div>
    <h3>Hours &amp; pay${week.weekEnding ? " — week ending " + esc(week.weekEnding) : ""}</h3>
    ${week.nonPerformance ? "<p class='hint'>Non-performance week: no hours needed. Workers are omitted; the XML carries the statement flag.</p>" : ""}
    ${empBlocks}
    <h3>Certification (signs the Statement of Compliance)</h3>
    <div class="grid">
      <div class="field"><label>Signatory name</label><input id="w-signName" value="${escAttr(week.signName)}"></div>
      <div class="field"><label>Title</label><input id="w-signTitle" value="${escAttr(week.signTitle)}" placeholder="Owner"></div>
      <div class="field"><label>Fringe benefits are…</label>
        <select id="w-fringe">
          <option value="plans"${week.fringeOption === "plans" ? " selected" : ""}>Paid to approved plans/funds (4a)</option>
          <option value="cash"${week.fringeOption === "cash" ? " selected" : ""}>Paid in cash to workers (4b)</option>
        </select></div>
      <div class="field"><label>Remarks (optional)</label><input id="w-remarks" value="${escAttr(week.remarks)}"></div>
    </div>
    <div class="export-box">
      <h3>Download your report</h3>
      <p class="hint">eCPR XML → log in at the <a href="https://services.dir.ca.gov/pw" target="_blank" rel="noopener">DIR Public Works Portal</a>, upload the XML file, then sign &amp; submit there. WH-347 PDF → for federal jobs or your records.</p>
      <p class="hint">The XML filename (e.g. <code>6789_412345_060626.xml</code>) follows the DIR's required naming format — don't rename it. If your browser shows a download warning, choose Keep: the file is created on your own computer from the data you typed; nothing is downloaded from the internet.</p>
      <div class="row-actions">
        <button class="primary" id="x-xml">Download eCPR XML</button>
        <button class="primary" id="x-pdf">Download WH-347 PDF</button>
        <button class="secondary" id="w-saveweek">Save week</button>
        <button class="secondary" id="w-newweek">Start new week</button>
      </div>
      <p class="error" id="x-errors"></p>
    </div>`;

  /* wire up */
  $("#w-project").addEventListener("change", e => { week.projectId = e.target.value; });
  $("#w-weekEnding").addEventListener("change", e => { week.weekEnding = e.target.value; renderWeekly(); });
  $("#w-payrollNum").addEventListener("input", e => { week.payrollNum = e.target.value; });
  $("#w-np").addEventListener("change", e => { week.nonPerformance = e.target.value === "yes"; renderWeekly(); });
  $("#w-signName").addEventListener("input", e => { week.signName = e.target.value; });
  $("#w-signTitle").addEventListener("input", e => { week.signTitle = e.target.value; });
  $("#w-fringe").addEventListener("change", e => { week.fringeOption = e.target.value; });
  $("#w-remarks").addEventListener("input", e => { week.remarks = e.target.value; });

  $all("[data-inc]").forEach(cb => cb.addEventListener("change", () => {
    const id = cb.dataset.inc;
    if (cb.checked) week.entries.push(blankEntry(id));
    else week.entries = week.entries.filter(en => en.employeeId !== id);
    renderWeekly();
  }));
  /* update state + recalculated cells in place — never re-render on blur,
     or a pending click on Download gets destroyed mid-flight */
  $all("[data-hours]").forEach(inp => inp.addEventListener("input", () => {
    const [empId, dayIdx, k] = inp.dataset.hours.split(":");
    const entry = week.entries.find(en => en.employeeId === empId);
    if (entry) { entry.days[+dayIdx][k] = inp.value; updateCalcs(empId); }
  }));
  $all("[data-ded]").forEach(inp => inp.addEventListener("input", () => {
    const [empId, k] = inp.dataset.ded.split(":");
    const entry = week.entries.find(en => en.employeeId === empId);
    if (entry) { entry.ded[k] = inp.value; updateCalcs(empId); }
  }));
  $all("[data-gaw]").forEach(inp => inp.addEventListener("input", () => {
    const entry = week.entries.find(en => en.employeeId === inp.dataset.gaw);
    if (entry) { entry.grossAllWork = inp.value; updateCalcs(inp.dataset.gaw); }
  }));
  $all("[data-check]").forEach(inp => inp.addEventListener("input", () => {
    const entry = week.entries.find(en => en.employeeId === inp.dataset.check);
    if (entry) entry.checkNum = inp.value;
  }));
  $all("[data-notes]").forEach(inp => inp.addEventListener("input", () => {
    const entry = week.entries.find(en => en.employeeId === inp.dataset.notes);
    if (entry) entry.notes = inp.value;
  }));
  $all("[data-loadweek]").forEach(b => b.addEventListener("click", () => {
    const w = state.weeks.find(x => x.id === b.dataset.loadweek);
    if (w) { week = JSON.parse(JSON.stringify(w)); renderWeekly(); }
  }));
  $("#w-saveweek").addEventListener("click", () => { persistWeek(); alert("Week saved on this device."); });
  $("#w-newweek").addEventListener("click", () => { week = newWeek(); renderWeekly(); });
  $("#x-xml").addEventListener("click", exportXML);
  $("#x-pdf").addEventListener("click", exportPDF);
}

function updateCalcs(empId) {
  const entry = week.entries.find(en => en.employeeId === empId);
  const emp = state.employees.find(x => x.id === empId);
  if (!entry || !emp) return;
  const t = entryTotals(entry);
  ["st", "ot", "dt"].forEach(k => {
    const cell = $(`[data-tot="${empId}:${k}"]`);
    if (cell) cell.textContent = dec1(t[k]);
  });
  const gross = entryGrossThisProject(emp, entry);
  const line = $(`[data-line="${empId}"]`);
  if (line) line.innerHTML = `Gross this project: <strong>$${money(gross)}</strong> ·
    Deductions: <strong>$${money(dedTotal(entry.ded))}</strong> ·
    Net paid: <strong>$${money(n2(entry.grossAllWork || gross) - dedTotal(entry.ded))}</strong>`;
  const gaw = $(`[data-gaw="${empId}"]`);
  if (gaw) gaw.placeholder = money(gross);
}

function persistWeek() {
  const i = state.weeks.findIndex(w => w.id === week.id);
  if (i >= 0) state.weeks[i] = JSON.parse(JSON.stringify(week));
  else state.weeks.push(JSON.parse(JSON.stringify(week)));
  save();
}

/* ---------- validation ---------- */

function validate() {
  const c = state.company;
  const errs = [];
  if (!c.name) errs.push("Company: business name is required.");
  if (!/^[0-9]{9}$/.test(c.fein)) errs.push("Company: FEIN must be exactly 9 digits.");
  if (!/^([0-9]{10}|NA)$/.test(c.pwcr || "")) errs.push("Company: PWCR must be 10 digits or NA.");
  if (!/^[A-Z]{2}$/.test(c.state)) errs.push("Company: state must be 2 letters.");
  if (!/^[0-9]{5}$/.test(c.zip)) errs.push("Company: ZIP must be 5 digits.");
  if (!/^[^@]+@[^.]+\..+$/.test(c.email)) errs.push("Company: valid email required.");
  if (!c.licenseNum) errs.push("Company: license number required.");
  const p = state.projects.find(x => x.id === week.projectId);
  if (!p) errs.push("Weekly: pick a project.");
  else {
    if (!p.dirProjectID) errs.push("Project: DIR Project ID (PWC-100 #) is required for the eCPR XML.");
    if (!p.contractAgency) errs.push("Project: 'Contract with' is required.");
  }
  if (!week.weekEnding) errs.push("Weekly: week ending date is required.");
  if (!week.nonPerformance) {
    if (week.entries.length === 0) errs.push("Weekly: include at least one worker (or mark non-performance).");
    week.entries.forEach(en => {
      const emp = state.employees.find(x => x.id === en.employeeId);
      if (!emp) return;
      if (!/^[0-9]{9}$/.test(emp.ssn)) errs.push(`Worker ${emp.name}: SSN must be 9 digits.`);
      if (!emp.workClass) errs.push(`Worker ${emp.name}: work classification required.`);
      if (!/^[A-Z]{2}$/.test(emp.state)) errs.push(`Worker ${emp.name}: state must be 2 letters.`);
      if (!/^[0-9]{5}$/.test(emp.zip)) errs.push(`Worker ${emp.name}: ZIP must be 5 digits.`);
      if (!emp.street || !emp.city) errs.push(`Worker ${emp.name}: address required.`);
    });
  }
  return { errs, project: p };
}

/* ---------- eCPR XML export ---------- */

function exportXML() {
  const { errs, project: p } = validate();
  $("#x-errors").textContent = errs.join("\n");
  if (errs.length) return;
  if (!meterAllows()) return;
  const c = state.company;
  const dates = weekDates(week.weekEnding);

  let employeesXml = "";
  if (!week.nonPerformance) {
    employeesXml = week.entries.map(en => {
      const emp = state.employees.find(x => x.id === en.employeeId);
      const t = entryTotals(en);
      const gross = entryGrossThisProject(emp, en);
      const grossAll = en.grossAllWork ? n2(en.grossAllWork) : gross;
      const total = dedTotal(en.ded);
      const days = en.days.map((d, i) => `            <CPR:day id="${i + 1}">
              <CPR:date>${iso(dates[i])}</CPR:date>
              <CPR:straightTime>${dec1(d.st)}</CPR:straightTime>
              <CPR:overtime>${dec1(d.ot)}</CPR:overtime>
              <CPR:doubletime>${dec1(d.dt)}</CPR:doubletime>
            </CPR:day>`).join("\n");
      return `      <CPR:employee>
        <CPR:name id="${escAttr(emp.ssn)}::${escAttr(emp.name.toUpperCase())}">${esc(emp.name)}</CPR:name>
        <CPR:address>
          <CPR:street>${esc(emp.street)}</CPR:street>
          <CPR:city>${esc(emp.city)}</CPR:city>
          <CPR:state>${esc(emp.state)}</CPR:state>
          <CPR:zip>${esc(emp.zip)}</CPR:zip>
        </CPR:address>
        <CPR:ssn>${esc(emp.ssn)}</CPR:ssn>
        <CPR:numWithholdingExemp>${esc(emp.exemptions || "0")}</CPR:numWithholdingExemp>
        <CPR:workClass>${esc(emp.workClass)}</CPR:workClass>
        <CPR:payroll>
          <CPR:hrsWorkedEachDay>
${days}
          </CPR:hrsWorkedEachDay>
          <CPR:totHrs>
            <CPR:totHrsStraightTime>${dec1(t.st)}</CPR:totHrsStraightTime>
            <CPR:totHrsOvertime>${dec1(t.ot)}</CPR:totHrsOvertime>
            <CPR:totHrsDoubletime>${dec1(t.dt)}</CPR:totHrsDoubletime>
          </CPR:totHrs>
          <CPR:hrlyPayRate>
            <CPR:hrlyPayRateStraightTime>${dec1(emp.rateST)}</CPR:hrlyPayRateStraightTime>
            <CPR:hrlyPayRateOvertime>${dec1(emp.rateOT)}</CPR:hrlyPayRateOvertime>
            <CPR:hrlyPayRateDoubletime>${dec1(emp.rateDT)}</CPR:hrlyPayRateDoubletime>
          </CPR:hrlyPayRate>
          <CPR:grossAmountEarned>
            <CPR:thisProject>${dec1(gross)}</CPR:thisProject>
            <CPR:allWork>${dec1(grossAll)}</CPR:allWork>
          </CPR:grossAmountEarned>
          <CPR:deductionsContribPay>
            <CPR:fedTax>${dec1(en.ded.fedTax)}</CPR:fedTax>
            <CPR:FICA>${dec1(en.ded.fica)}</CPR:FICA>
            <CPR:stateTax>${dec1(en.ded.stateTax)}</CPR:stateTax>
            <CPR:SDI>${dec1(en.ded.sdi)}</CPR:SDI>
            <CPR:vacationHoliday>${dec1(en.ded.vacationHoliday)}</CPR:vacationHoliday>
            <CPR:healthWelfare>${dec1(en.ded.healthWelfare)}</CPR:healthWelfare>
            <CPR:pension>${dec1(en.ded.pension)}</CPR:pension>
            <CPR:training>${dec1(en.ded.training)}</CPR:training>
            <CPR:fundAdmin>${dec1(en.ded.fundAdmin)}</CPR:fundAdmin>
            <CPR:dues>${dec1(en.ded.dues)}</CPR:dues>
            <CPR:travelSubs>${dec1(en.ded.travelSubs)}</CPR:travelSubs>
            <CPR:savings>${dec1(en.ded.savings)}</CPR:savings>
            <CPR:other>${dec1(en.ded.other)}</CPR:other>
            <CPR:total>${dec1(total)}</CPR:total>
            <CPR:notes>${esc(en.notes)}</CPR:notes>
          </CPR:deductionsContribPay>
          <CPR:netWagePaidWeek>${dec1(grossAll - total)}</CPR:netWagePaidWeek>
          <CPR:checkNum>${esc(en.checkNum)}</CPR:checkNum>
        </CPR:payroll>
      </CPR:employee>`;
    }).join("\n");
  }

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<CPR:eCPR xmlns:CPR="http://www.dir.ca.gov/dlse/CPR-Prod-Test/CPR.xsd">
  <CPR:contractorInfo>
    <CPR:contractorName>${esc(c.name)}</CPR:contractorName>
    <CPR:contractorLicense>
      <CPR:licenseType>${esc(c.licenseType)}</CPR:licenseType>
      <CPR:licenseNum>${esc(c.licenseNum)}</CPR:licenseNum>
    </CPR:contractorLicense>
    <CPR:contractorPWCR>${esc(c.pwcr)}</CPR:contractorPWCR>
    <CPR:contractorFEIN>${esc(c.fein)}</CPR:contractorFEIN>
    <CPR:contractorAddress>
      <CPR:street>${esc(c.street)}</CPR:street>
      <CPR:city>${esc(c.city)}</CPR:city>
      <CPR:state>${esc(c.state)}</CPR:state>
      <CPR:zip>${esc(c.zip)}</CPR:zip>
    </CPR:contractorAddress>
    <CPR:insuranceNum>${esc(c.insuranceNum)}</CPR:insuranceNum>
    <CPR:contractorEmail>${esc(c.email)}</CPR:contractorEmail>
  </CPR:contractorInfo>
  <CPR:projectInfo>
    <CPR:awardingBody></CPR:awardingBody>
    <CPR:contractAgencyID></CPR:contractAgencyID>
    <CPR:contractAgency>${esc(p.contractAgency)}</CPR:contractAgency>
    <CPR:projectName></CPR:projectName>
    <CPR:projectID>${esc(p.dirProjectID)}</CPR:projectID>
    <CPR:awardingBodyID></CPR:awardingBodyID>
    <CPR:projectNum></CPR:projectNum>
    <CPR:contractID></CPR:contractID>
    <CPR:projectLocation>
      <CPR:description></CPR:description>
      <CPR:street></CPR:street>
      <CPR:city></CPR:city>
      <CPR:county></CPR:county>
      <CPR:state></CPR:state>
      <CPR:zip></CPR:zip>
    </CPR:projectLocation>
  </CPR:projectInfo>
  <CPR:payrollInfo>
    <CPR:statementOfNP>${week.nonPerformance ? "true" : "false"}</CPR:statementOfNP>
    <CPR:payrollNum></CPR:payrollNum>
    <CPR:amendmentNum></CPR:amendmentNum>
    <CPR:forWeekEnding>${esc(week.weekEnding)}</CPR:forWeekEnding>
    <CPR:employees>
${employeesXml}
    </CPR:employees>
  </CPR:payrollInfo>
</CPR:eCPR>
`;
  const fname = `${c.fein.slice(-4)}_${p.dirProjectID}_${mmddyy(week.weekEnding)}.xml`;
  downloadBlob(new Blob([xml], { type: "application/xml" }), fname);
  persistWeek();
}

/* ---------- WH-347 PDF export ---------- */

function fillForm(form, chunk, p, c, dates, sheetLabel) {
  const set = (name, val) => { try { form.getTextField(name).setText(String(val == null ? "" : val)); } catch (e) {} };
  const check = (name, on) => { try { const f = form.getCheckBox(name); if (on) f.check(); else f.uncheck(); } catch (e) {} };

  set("contractor", c.name);
  check("contractorOrSub", c.role === "subcontractor");
  set("address", `${c.street}, ${c.city}, ${c.state} ${c.zip}`);
  set("payrollNo", week.payrollNum + (sheetLabel || ""));
  set("weekEnding", week.weekEnding);
  set("projectAndLocation", [p.projectName || p.label, p.locStreet, p.locCity, p.locState].filter(Boolean).join(", "));
  set("projectOrContractorNo", p.projectNum || p.dirProjectID);
  dates.forEach((d, i) => {
    set("day" + (i + 1), DAY_ABBR[d.getDay()]);
    set("date" + (i + 1), (d.getMonth() + 1) + "/" + d.getDate());
  });
  chunk.forEach((en, idx) => {
    const r = idx + 1;
    const emp = state.employees.find(x => x.id === en.employeeId);
    const t = entryTotals(en);
    const gross = entryGrossThisProject(emp, en);
    const grossAll = en.grossAllWork ? n2(en.grossAllWork) : gross;
    const total = dedTotal(en.ded);
    set("nameAddrSSN" + r, `${emp.name}\n${emp.street}, ${emp.city}, ${emp.state} ${emp.zip}\nXXX-XX-${emp.ssn.slice(-4)}`);
    set("noWithholdingExemptions" + r, emp.exemptions);
    set("workClassification" + r, emp.workClass);
    en.days.forEach((d, i) => {
      const stv = n2(d.st), otv = n2(d.ot) + n2(d.dt);
      set("ST" + r + (i + 1), stv ? dec1(stv) : "");
      set("OT" + r + (i + 1), otv ? dec1(otv) : "");
    });
    set("totalHoursST" + r, dec1(t.st));
    set("totalHoursOT" + r, (t.ot + t.dt) ? dec1(t.ot + t.dt) : "");
    set("rateOfPayST" + r, money(emp.rateST));
    if (n2(emp.fringeRate)) set("rateOfPaySTfringe" + r, money(emp.fringeRate));
    set("rateOfPayOT" + r, n2(emp.rateOT) ? money(emp.rateOT) : "");
    set("gross" + r, money(gross));
    set("gross" + r + "T", money(grossAll));
    set("fica" + r, money(en.ded.fica));
    set("withholding" + r, money(en.ded.fedTax));
    set("deductionA" + r, money(en.ded.stateTax));
    set("deductionB" + r, money(en.ded.sdi));
    const otherSum = total - n2(en.ded.fica) - n2(en.ded.fedTax) - n2(en.ded.stateTax) - n2(en.ded.sdi);
    set("deductionOther" + r, money(otherSum));
    set("totalDeductions" + r, money(total));
    set("netWages" + r, money(grossAll - total));
  });
  set("deductionLabel1", "State Tax");
  set("deductionLabel2", "SDI");

  /* page 2 — statement of compliance */
  const today = new Date();
  set("date", (today.getMonth() + 1) + "/" + today.getDate() + "/" + today.getFullYear());
  set("nameOfSignatory", week.signName);
  set("title", week.signTitle);
  set("contractorCopy1", c.name);
  set("building", [p.projectName || p.label, p.locCity].filter(Boolean).join(", "));
  const start = dates[0], end = dates[6];
  set("commenceDay", start.getDate()); set("commenceMonth", start.getMonth() + 1); set("commenceYear", start.getFullYear());
  set("endDay", end.getDate()); set("endMonth", end.getMonth() + 1); set("endYear", end.getFullYear());
  check("fringe", week.fringeOption === "plans");
  check("fringeCash", week.fringeOption === "cash");
  set("remarks", week.nonPerformance ? "Statement of non-performance: no work performed this week. " + (week.remarks || "") : week.remarks);
  set("nameTitle", [week.signName, week.signTitle].filter(Boolean).join(", "));
}

async function exportPDF() {
  const { errs, project: p } = validate();
  $("#x-errors").textContent = errs.join("\n");
  if (errs.length) return;
  if (!meterAllows()) return;
  const c = state.company;
  const dates = weekDates(week.weekEnding);

  const resp = await fetch("wh347.pdf");
  const baseBytes = await resp.arrayBuffer();
  const { PDFDocument } = PDFLib;

  const entries = week.nonPerformance ? [] : week.entries;
  const chunks = [];
  for (let i = 0; i < Math.max(1, Math.ceil(entries.length / 8)); i++) {
    chunks.push(entries.slice(i * 8, i * 8 + 8));
  }

  let bytes;
  if (chunks.length === 1) {
    // keep the form fillable so users can tweak before printing
    const doc = await PDFDocument.load(baseBytes);
    fillForm(doc.getForm(), chunks[0], p, c, dates, "");
    bytes = await doc.save();
  } else {
    // multiple sheets: flatten each filled copy so values survive the page merge
    const out = await PDFDocument.create();
    for (let ci = 0; ci < chunks.length; ci++) {
      const doc = await PDFDocument.load(baseBytes);
      fillForm(doc.getForm(), chunks[ci], p, c, dates, ` (sheet ${ci + 1}/${chunks.length})`);
      doc.getForm().flatten();
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach(pg => out.addPage(pg));
    }
    bytes = await out.save();
  }
  const fname = `WH347_${(p.projectNum || p.dirProjectID || "report")}_${mmddyy(week.weekEnding)}.pdf`;
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), fname);
  persistWeek();
}

/* ---------- paywall (dormant until PAYWALL.enabled) ---------- */

function getMeter() {
  try { return JSON.parse(localStorage.getItem("ecprx-meter") || "{}"); } catch (e) { return {}; }
}
function setMeter(m) { localStorage.setItem("ecprx-meter", JSON.stringify(m)); }

/* Counts distinct exported reports (project+week), not button clicks —
   re-downloading the same week is free. Returns true if export may proceed. */
function meterAllows() {
  if (!PAYWALL.enabled) return true;
  const m = getMeter();
  if (m.licenseKey) return true;
  const id = week.projectId + "|" + week.weekEnding;
  const used = m.reports || [];
  if (used.indexOf(id) !== -1) return true;
  if (used.length < PAYWALL.freeReports) {
    used.push(id); m.reports = used; setMeter(m);
    return true;
  }
  showPaywall();
  return false;
}

function showPaywall() {
  let el = $("#paywall-modal");
  if (!el) {
    el = document.createElement("div");
    el.id = "paywall-modal";
    el.style.cssText = "position:fixed;inset:0;background:rgba(20,28,46,.75);display:flex;align-items:center;justify-content:center;z-index:50";
    el.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:440px;padding:28px;margin:16px">
        <h3 style="margin-top:0">You've used your ${PAYWALL.freeReports} free reports</h3>
        <p>${PAYWALL.priceText}. Instant access — your data stays in your browser either way.</p>
        <p><a class="cta" href="${PAYWALL.checkoutUrl}" target="_blank" rel="noopener">Get unlimited reports</a></p>
        <p style="font-size:13px;color:#5a6478">Already purchased? Paste your license key:</p>
        <div style="display:flex;gap:8px">
          <input id="license-input" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" style="flex:1">
          <button class="secondary" id="license-activate">Activate</button>
        </div>
        <p id="license-msg" style="font-size:13px;color:#a33"></p>
        <p style="text-align:right;margin-bottom:0"><button class="secondary" id="paywall-close">Close</button></p>
      </div>`;
    document.body.appendChild(el);
    $("#paywall-close").addEventListener("click", () => el.remove());
    $("#license-activate").addEventListener("click", async () => {
      const key = $("#license-input").value.trim();
      if (!key) return;
      $("#license-msg").textContent = "Checking…";
      try {
        const r = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ license_key: key, instance_name: "ecpr-express-browser" })
        });
        const data = await r.json();
        if (data.activated || (data.license_key && data.license_key.status === "active")) {
          const m = getMeter(); m.licenseKey = key; setMeter(m);
          el.remove();
          alert("License activated — unlimited reports on this device. Thank you!");
        } else {
          $("#license-msg").textContent = data.error || "That key didn't validate — reply to your receipt email and we'll sort it out.";
        }
      } catch (e) {
        $("#license-msg").textContent = "Network error — try again, or email us.";
      }
    });
  }
}

/* ---------- download ---------- */

/* Prefer the native Save As dialog (File System Access API): files saved
   through it skip Chrome's download shelf, so users don't get the
   "could harm your device" warning that anchor downloads from a
   low-reputation domain trigger. Fall back to anchor download elsewhere. */
async function downloadBlob(blob, filename) {
  if (window.showSaveFilePicker) {
    const ext = filename.slice(filename.lastIndexOf("."));
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: ext === ".xml" ? "DIR eCPR XML payroll file" : "WH-347 certified payroll PDF",
          accept: ext === ".xml" ? { "application/xml": [".xml"] } : { "application/pdf": [".pdf"] }
        }]
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // user cancelled the dialog — respect it
      /* picker unavailable (e.g. blocked) — fall through to anchor download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- init ---------- */

/* first-visit demo: one click loads a realistic example so visitors can
   download a finished XML/PDF before typing their own crew in */
function loadSampleData() {
  state.company = {
    name: "Sample Concrete Inc", role: "subcontractor",
    licenseType: "CSLB", licenseNum: "123456", pwcr: "1000054321", fein: "954321987",
    street: "12 Industry Way", city: "Fresno", state: "CA", zip: "93701",
    insuranceNum: "WC-9988776", email: "office@sampleconcrete.com"
  };
  state.projects = [{
    id: "demo-proj", label: "Demo: Library Renovation", dirProjectID: "412345",
    contractAgency: "BigBuild General Contractors Inc", awardingBody: "", projectName: "Library Renovation",
    projectNum: "JOB-22", locStreet: "", locCity: "Fresno", locCounty: "Fresno", locState: "CA", locZip: ""
  }];
  state.employees = [
    { id: "demo-emp1", name: "Juan Martinez", ssn: "611223333", exemptions: "2", workClass: "Cement Mason",
      rateST: "38.50", rateOT: "57.75", rateDT: "77.00", fringeRate: "12.25",
      street: "44 Oak St", city: "Fresno", state: "CA", zip: "93702" },
    { id: "demo-emp2", name: "Mike Brown", ssn: "622334444", exemptions: "0", workClass: "Laborer Group 1",
      rateST: "29.00", rateOT: "43.50", rateDT: "58.00", fringeRate: "",
      street: "9 Pine Ave", city: "Clovis", state: "CA", zip: "93611" }
  ];
  week = newWeek();
  week.projectId = "demo-proj";
  const lastSat = new Date(); lastSat.setDate(lastSat.getDate() - ((lastSat.getDay() + 1) % 7 || 7));
  week.weekEnding = iso(lastSat);
  week.payrollNum = "1";
  week.signName = "Pat Sample"; week.signTitle = "Owner";
  week.entries = state.employees.map(e => {
    const en = blankEntry(e.id);
    for (let i = 1; i <= 5; i++) en.days[i].st = "8";
    en.ded.fedTax = "120.00"; en.ded.fica = "95.00"; en.ded.stateTax = "45.00"; en.ded.sdi = "14.00";
    en.checkNum = "1001";
    return en;
  });
  save();
  renderCompany(); renderProjects(); renderEmployees(); renderWeekly();
  gotoTab("weekly");
  document.getElementById("app").scrollIntoView({ behavior: "smooth" });
}

(function maybeOfferDemo() {
  if (state.company.name || state.employees.length) return;
  const bar = document.createElement("div");
  bar.style.cssText = "background:#fff8f3;border:1px solid #c8541a;border-radius:8px;padding:12px 16px;margin:10px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
  bar.innerHTML = `<span>New here? See a finished report in one click:</span>`;
  const btn = document.createElement("button");
  btn.className = "primary"; btn.textContent = "Load sample crew & week";
  btn.addEventListener("click", () => { loadSampleData(); bar.remove(); });
  bar.appendChild(btn);
  const app = document.getElementById("app");
  app.insertBefore(bar, app.firstChild);
})();

if (location.search.indexOf("subscribed=1") !== -1) {
  const note = document.createElement("div");
  note.textContent = "✓ You're on the founding list — we'll email you before paid plans start. The tool below is free to use right now.";
  note.style.cssText = "background:#1d7a3e;color:#fff;padding:12px 18px;text-align:center;font-weight:600";
  document.body.prepend(note);
}

renderCompany();
renderProjects();
renderEmployees();
renderWeekly();

})();
