// ====== Constants & Globals ======
const LOCAL_GLOW = true;  // adds a glow to differentiate items stored locally in the browser from those stored in csv file
const EXPORT = "all"; // choose export type "all", "csv", "local" 
// const appcode = "notsosecretcode";  
const MAX_CHARS_PER_LINE = 15;
const MAX_LINES = 4;
const EST_CHAR_WIDTH = 0.6; // em
const HYPHENATE_THRESHOLD = 12;
const COLOR_PAIRS = [
  ["#D1F257", "#0D0D0D"], ["#F2BBDF", "#D94E41"], ["#010D00", "#33A63B"],
  ["#F2E4E4", "#0D0C00"], ["#2561D9", "#F2FDFE"], ["#734c48", "#F2F2EB"],
  ["#8FBFAE", "#127357"], ["#3A8C5D", "#F2BFAC"], ["#8AA3A6", "#F2F0E4"],
  ["#F2C438", "#F23E2E"], ["#455919", "#F2D338"], ["#F2D8A7", "#F26363"],
  ["#260101", "#D93223"], ["#456EBF", "#F2F1E9"], ["#131E40", "#F2A413"],
  ["#F2F2F2", "#131E40"], ["#262626", "#F2EDDC"], ["#40593C", "#F2E6D0"],
  ["#F2F1DF", "#262416"], ["#F2CB05", "#0D0D0D"], ["#F2F2F2", "#F2CB05"],
  ["#F2E6D0", "#261C10"], ["#F2D7D0", "#262523"], ["#F2F0D8", "#F24535"],
  ["#191726", "#D9D9D9"], ["#F2E8D5", "#0C06BF"], ["#F2EFE9", "#45BFB3"],
  ["#F2C2C2", "#D93644"], ["#734C48", "#F2C2C2"],
];

const FONT_LIST = [
  "Caveat", "Permanent Marker", "Courier", "Doto", "Bree Serif",
  "Ultra", "Alfa Slab One", "Sedan SC", "EB Garamond", "Bebas Neue",
];

// State variables
let originalRows = [];
let csvRows = [];
let storedRows = [];
let storedRowHashes = new Set();
let reversedOrder = false;
let deleted = JSON.parse(localStorage.getItem("deleted_csv_rows") || "[]");


// ====== DOM Elements ======

const dialog = document.getElementById("paramDialog");
const titleInput = document.getElementById("paramTitle");
const urlInput = document.getElementById("paramUrl");
const tagsInput = document.getElementById("tagsInput");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const openEmptyDialogBtn = document.getElementById("openEmptyDialogBtn");
const appcodeGroup = document.getElementById("appcodeGroup");
const appcodeInput = document.getElementById("appcode");
const modalOverlay = document.getElementById("modalOverlay");
const searchInput =document.getElementById("searchInput");
const sortToggleBtn = document.getElementById("sortToggleBtn");
const exportBtn = document.getElementById("exportBtn")
const importArea = document.getElementById("importArea")


// ====== Utility Functions ======

/**
 * Hashes a string to a non-negative 32-bit integer.
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Get a color pair deterministically by title.
 * @param {string} title
 * @param {Array<Array<string>>} pairs
 * @returns {[string, string]} [backgroundColor, fontColor]
 */
function getColorPairByTitle(title, pairs) {
  const hash = hashString(title);
  const idx = hash % pairs.length;
  const [bg, fg] = pairs[idx];
  return (hash % 2 === 0) ? [bg, fg] : [fg, bg];
}

/**
 * Get a font family deterministically by title.
 * @param {string} title
 * @param {string[]} fonts
 * @returns {string}
 */
function getFontByTitle(title, fonts) {
  return fonts[hashString(title) % fonts.length];
}

/**
 * Parses CSV text into array of rows with cells.
 * Handles quoted commas and newlines.
 * @param {string} text CSV text
 * @returns {string[][]}
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (cell || row.length) row.push(cell);
      if (row.length) rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Retrieves bookmarks stored in localStorage.
 * Returns parsed array of rows.
 */
function getBookmarks() {
  const csvString = localStorage.getItem("strd_bookmarks");
  if (!csvString) return [];
  return parseCSV(csvString.trim());
}


/**
 * Escapes CSV cell content if needed.
 * @param {string} cell
 * @returns {string}
 */
function escapeCSVCell(cell) {
  if (cell.includes(",") || cell.includes('"')) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Converts rows array to CSV string.
 * @param {string[][]} rows
 * @returns {string}
 */
function rowsToCSV(rows) {
  return rows.map(row => row.map(escapeCSVCell).join(",")).join("\n");
}

/**
 * Updates the deleted rows stored in localStorage.
 * @param {string[]} currentHashes Set of hashes currently present in CSV
 */
function syncDeletedRows(currentHashes) {
  deleted = deleted.filter(hash => currentHashes.has(hash));
  localStorage.setItem("deleted_csv_rows", JSON.stringify(deleted));
}

// ====== Rendering & UI Functions ======

/**
 * Renders bookmark containers based on rows.
 * @param {string[][]} rows
 * @param {Set<string>} storedHashes
 */
function renderContainers(rows, storedHashes) {
  const containerWrapper = document.querySelector(".containers");
  containerWrapper.innerHTML = "";

  const fragment = document.createDocumentFragment();

  rows.forEach(row => {
    const titleRaw = row[0]?.trim();
    const url = row[1]?.trim();
    const tagsRaw = row[3]?.trim();

    if (!titleRaw || !url) return;

    const hashKey = hashString(titleRaw + url).toString();

    if (deleted.includes(hashKey)) return;

    const title = titleRaw.replace(/^https?:\/\/(www\.)?/i, "");
    const [bgColor, fontColor] = getColorPairByTitle(title, COLOR_PAIRS);
    const fontFamily = getFontByTitle(title, FONT_LIST);

    const container = document.createElement("div");
    container.className =
  "container" + (LOCAL_GLOW && storedHashes.has(hashKey) ? " local-container" : "");
    container.style.backgroundColor = bgColor;
    container.style.color = fontColor;
    container.style.fontFamily = `'${fontFamily}', sans-serif`;
    container.dataset.id = hashKey;

    // Delete Button
    const closeBtn = document.createElement("button");
    closeBtn.className = "delete-btn";
    closeBtn.textContent = "x";
    closeBtn.title = "Delete this bookmark";
    closeBtn.setAttribute("data-umami-event", "Delete bookmark");
    closeBtn.addEventListener("click", e => handleDelete(e, row, container, storedHashes));
    container.appendChild(closeBtn);

    // Anchor (bookmark link)
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.innerHTML = `<span style="font-size: 5vw;"><span>${title}</span></span>`;
    container.appendChild(anchor);

    // Tags
    if (tagsRaw) {
      const tags = tagsRaw.split(",").map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        const wrapper = document.createElement("div");
        wrapper.className = "tags-wrapper";

        tags.forEach(tag => {
          const tagDiv = document.createElement("div");
          tagDiv.className = "tags tag-style";
          tagDiv.textContent = `#${tag}`;
          tagDiv.addEventListener("click", () => filterByTag(tag));
          wrapper.appendChild(tagDiv);
        });

        container.appendChild(wrapper);
      }
    }

    fragment.appendChild(container);
  });

  containerWrapper.appendChild(fragment);
  runTextFormatting();
}

/**
 * Handles bookmark deletion.
 * @param {Event} e
 * @param {string[]} row
 * @param {HTMLElement} container
 * @param {Set<string>} storedHashes
 */
function handleDelete(e, row, container, storedHashes) {
  e.stopPropagation();
  e.preventDefault();

  const title = row[0]?.trim();
  const url = row[1]?.trim();
  const key = hashString(title + url).toString();

  const isLocal = storedHashes.has(key);

  if (isLocal) {
    let csvData = localStorage.getItem("strd_bookmarks") || "";
    const rows = parseCSV(csvData.trim());

    // Filter out matching row
    const filteredRows = rows.filter(r => r[0]?.trim() !== title || r[1]?.trim() !== url);

    // Convert back to CSV
    const updatedCSV = rowsToCSV(filteredRows) + "\n";
    localStorage.setItem("strd_bookmarks", updatedCSV);
  } else {
    if (!deleted.includes(key)) {
      deleted.push(key);
      localStorage.setItem("deleted_csv_rows", JSON.stringify(deleted));
    }
  }

  container.remove();
}

/**
 * Filter the bookmarks by clicking on a tag.
 * @param {string} tag
 */
function filterByTag(tag) {
  const searchInput = document.getElementById("searchInput");
  searchInput.value = `#${tag}`;
  searchInput.dispatchEvent(new Event("input"));
}

/**
 * Formats text inside containers after rendering.
 */
function runTextFormatting() {
  document.querySelectorAll(".container").forEach(container => {
    const anchor = container.querySelector("a");
    if (!anchor) return;

    const originalText = anchor.innerText.trim();
    const href = anchor.href;
    if (!originalText || !href) return;

    anchor.innerHTML = "";

    // Replace certain separators with <hr/>
    const formattedText = originalText.replace(/(\s\|\s|\s-\s|\s–\s|\/,)/g, "<hr/>");
    const [firstPart, ...restParts] = formattedText.split("<hr/>");
    const secondPart = restParts.join("<hr/>");

    const span = document.createElement("span");

    let fontSizeVW = 3;
    if (originalText.length < 9) fontSizeVW = 6;
    else if (originalText.length < 20) fontSizeVW = 5;
    else if (originalText.length < 35) fontSizeVW = 4;
    else if (originalText.length < 100) fontSizeVW = 3;
    else fontSizeVW = 2.5;

    span.style.fontSize = `${fontSizeVW}vw`;

    const firstSpan = document.createElement("span");
    firstSpan.innerHTML = firstPart;

    span.appendChild(firstSpan);

    if (restParts.length) {
      const hr = document.createElement("hr");
      hr.classList.add("invisible-hr");

      const secondSpan = document.createElement("span");
      secondSpan.innerHTML = secondPart;
      secondSpan.style.fontSize = `${(fontSizeVW * 2) / 3}vw`;

      span.appendChild(hr);
      span.appendChild(secondSpan);
    }

    anchor.appendChild(span);
  });
}

// ====== Event Handlers ======

/**
 * Debounce utility.
 * @param {Function} fn
 * @param {number} delay
 */
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

if(searchInput){
  searchInput.addEventListener(
    "input",
    debounce(e => {
      const searchTerm = e.target.value.trim();
      updateURLSearchParam("search", searchTerm);
      runSearch(searchTerm);
    }, 150)
  );
}

/**
 * Updates URL search params without reloading page.
 * @param {string} key
 * @param {string} value
 */
function updateURLSearchParam(key, value) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

/**
 * Search functionality for bookmarks.
 * @param {string} term
 */
function runSearch(term) {
  const searchTerm = term.toLowerCase();

  document.querySelectorAll(".container").forEach(container => {
    if (searchTerm.startsWith("#")) {
      const tagToSearch = searchTerm.slice(1);
      const tags = Array.from(container.querySelectorAll(".tags"))
        .map(el => el.textContent.toLowerCase().replace("#", "").trim());

      container.style.display = tags.some(tag => tag.includes(tagToSearch)) ? "block" : "none";
    } else {
      const anchor = container.querySelector("a");
      const title = anchor?.innerText.toLowerCase() || "";
      container.style.display = title.includes(searchTerm) ? "block" : "none";
    }
  });
}

// Sort toggle button
if(sortToggleBtn){
  sortToggleBtn.addEventListener("click", () => {
    reversedOrder = !reversedOrder;

    if (reversedOrder) {
      renderContainers(originalRows, storedRowHashes);
      sortToggleBtn.lastChild.textContent = " ▼";
    } else {
      renderContainers([...originalRows].reverse(), storedRowHashes);
        sortToggleBtn.lastChild.textContent = " ▲";

    }
  });
}


// ====== Dialog Logic ======

function showParamsIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title");
  const url = params.get("url");

  if (title && url) {
    titleInput.value = title;
    urlInput.value = url;
    dialog.showModal();
  }

  saveBtn.onclick = saveBookmark;
}

function saveBookmark() {
  const newTitle = titleInput.value.trim();
  const newUrl = urlInput.value.trim();
  const rawTags = tagsInput.value.trim();

  if (!newTitle || !newUrl) return; // Basic validation

  const timestamp = Math.floor(Date.now() / 1000);
  const status = "unread";

  // Normalize tags
  const normalizedTags = rawTags.split(",").map(t => t.trim()).filter(Boolean).join(",");

  // Escape for CSV
  const safeTitle = escapeCSVCell(newTitle);
  const safeTags = escapeCSVCell(normalizedTags);

  const line = `${safeTitle},${newUrl},${timestamp},${safeTags},${status}`;

  let csvData = localStorage.getItem("strd_bookmarks") || "";
  if (csvData && !csvData.endsWith("\n")) csvData += "\n";
  csvData += line + "\n";

  localStorage.setItem("strd_bookmarks", csvData);

  // Save appcode if changed
  const appcodeValue = appcodeInput?.value.trim();
  if (appcodeValue && localStorage.getItem("appcode") !== appcodeValue) {
    localStorage.setItem("appcode", appcodeValue);
  }

  dialog.close();
  window.location.href = window.location.pathname; // Reload page to re-render
}

if(cancelBtn){
  cancelBtn.onclick = () => {
    dialog.close();
    window.location.href = window.location.pathname;
  };
}

// Open dialog button logic with counts
if(openEmptyDialogBtn){

  console.log('!!! appcode', typeof appcode)
  openEmptyDialogBtn.style.display = ( typeof appcode === "undefined" || (typeof appcode !== "undefined" && localStorage.getItem("appcode") === appcode)) ? "inline-block" : "none";

  openEmptyDialogBtn.addEventListener("click", () => {
    titleInput.value = "";
    urlInput.value = "";

    const deletedHashes = JSON.parse(localStorage.getItem("deleted_csv_rows") || "[]");

    const csvCount = csvRows.filter(row => {
      const title = row[0]?.trim();
      const url = row[1]?.trim();
      if (!title || !url) return false;
      const key = hashString(title + url).toString();
      return !deletedHashes.includes(key);
    }).length;

    const deletedCount = csvRows.length - csvCount;

    const countInfo = document.getElementById("paramDialogCount");
    const parts = [`${csvCount} bookmarks from .csv`];
    if (storedRows.length > 0) parts.push(`<span style="color: green;">${storedRows.length} new</span>`);
    if (deletedCount > 0) parts.push(`<span style="color: red;">${deletedCount} deleted</span>`);

    countInfo.innerHTML = parts.join(" | ");

    dialog.showModal();
  });
}
// Export button logic
if(exportBtn){
  exportBtn.addEventListener("click", () => {

    // get the rows shown
    const deletedHashes = JSON.parse(localStorage.getItem("deleted_csv_rows") || "[]");

    const visibleCSVRows = csvRows.filter(row => {
      const title = row[0]?.trim();
      const url = row[1]?.trim();
      if (!title || !url) return false;
      const key = hashString(title + url).toString();
      return !deletedHashes.includes(key);
    });


    let allRows = [];
    if (EXPORT === "csv") {
      allRows = visibleCSVRows;
    } else if (EXPORT === "local") {
      allRows = storedRows;
    } else if (EXPORT === "all") {
      allRows = [...visibleCSVRows, ...storedRows];
    }

    // create csv
    const header = "title,url,timestamp,tags,status";
    const csvString = [header, ...allRows.map(row => row.map(escapeCSVCell).join(","))].join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "mybookmarks.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // clear deleted hashes after export
    localStorage.removeItem("deleted_csv_rows");
  });
}



// Import logic
document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("importSaveBtn");

  console.log('!!! loaded')
  if (importArea) {
    console.log('!! import area')

    importArea.addEventListener("blur", () => {
      const csv = importArea.value.trim();
      if (!csv) return;

      const rows = parseCSV(csv);
      const valid = rows.filter(row =>
        Array.isArray(row) &&
        row.length >= 5 &&
        row[0].trim() &&
        row[1].trim() &&
        !isNaN(Number(row[2])) &&
        typeof row[4] === "string"
      );

      if (!valid.length) {
        alert("No valid CSV rows found. Expecting title,url,timestamp,tags,status");
        return;
      }

      const existing = localStorage.getItem("strd_bookmarks") || "";
      const existingLines = existing.trim() ? existing.trim().split("\n") : [];

      const cleanedRows = valid.map(row =>
        row.map(escapeCSVCell).join(",")
      );

      const updated = [...existingLines, ...cleanedRows].join("\n") + "\n";
      localStorage.setItem("strd_bookmarks", updated);
      alert(`${cleanedRows.length} valid rows added to localStorage.`);
    });
  }

  if (importArea && saveBtn) {
    saveBtn.addEventListener("click", () => {
      importArea.dispatchEvent(new Event("blur"));
    });
  }
});


// ====== Initialization ======

fetch("mybookmarks.csv")
  .then(response => {
    if (!response.ok) throw new Error("Failed to load CSV");
    return response.text();
  })
  .then(csv => {
    const allRows = parseCSV(csv.trim());
    csvRows = allRows.slice(1); // remove header

    const currentCSVHashes = new Set(
      csvRows.map(row => {
        const title = row[0]?.trim();
        const url = row[1]?.trim();
        return title && url ? hashString(title + url).toString() : null;
      }).filter(Boolean)
    );

    // Sync deleted rows with current CSV content
    syncDeletedRows(currentCSVHashes);

    storedRows = getBookmarks().filter(Boolean);
    storedRowHashes = new Set(storedRows.map(r => hashString((r[0]?.trim() || "") + (r[1]?.trim() || "")).toString()));

    originalRows = [...csvRows, ...storedRows];
    renderContainers([...originalRows].reverse(), storedRowHashes);

    // Restore search from URL
    const initialSearch = new URLSearchParams(window.location.search).get("search");
    if (initialSearch) {
      const searchInput = document.getElementById("searchInput");
      searchInput.value = initialSearch;
      runSearch(initialSearch);
    }
  })
  .catch(console.error);

// Show or hide appcode input based on localStorage
const savedAppcode = localStorage.getItem("appcode");
if (!savedAppcode) appcodeGroup.style.display = "flex";
if (!appcode) appcodeGroup.style.display = "none";

/**
 * Enable or disable save button based on appcode input state.
 */
function updateSaveButtonState() {
  const localCode = localStorage.getItem("appcode") || "";
  const inputCode = appcodeInput?.value?.trim() || "";
  saveBtn.disabled = !(localCode === appcode || inputCode === appcode);
}

showParamsIfPresent();
updateSaveButtonState();

appcodeInput?.addEventListener("input", updateSaveButtonState);
