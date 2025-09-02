// ====== AT Protocol & Constants ======
// AtpAgent is loaded via window.AtpAgent from the module import

// Bookmark lexicon definition (using community standard)
const BOOKMARK_LEXICON = "community.lexicon.bookmarks.bookmark";

const LOCAL_GLOW = false; // No local storage differentiation needed
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
let atpAgent = null;
let userDid = null;
let bookmarks = [];
let reversedOrder = false;

// ====== DOM Elements ======
const loginDialog = document.getElementById("loginDialog");
const handleInput = document.getElementById("handleInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const connectionStatus = document.getElementById("connectionStatus");

const dialog = document.getElementById("paramDialog");
const titleInput = document.getElementById("paramTitle");
const urlInput = document.getElementById("paramUrl");
const tagsInput = document.getElementById("tagsInput");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const openEmptyDialogBtn = document.getElementById("openEmptyDialogBtn");
const searchInput = document.getElementById("searchInput");
const sortToggleBtn = document.getElementById("sortToggleBtn");

// ====== AT Protocol Functions ======

/**
 * Initialize AT Protocol agent with stored session
 */
async function initializeATProto() {
  const session = localStorage.getItem("atproto_session");
  if (!session) {
    showLoginDialog();
    return false;
  }

  try {
    atpAgent = new window.AtpAgent({
      service: "https://bsky.social",
    });
    
    await atpAgent.resumeSession(JSON.parse(session));
    userDid = atpAgent.session.did;
    
    updateConnectionStatus("connected");
    showMainUI();
    await loadBookmarks();
    return true;
  } catch (error) {
    console.error("Failed to resume session:", error);
    localStorage.removeItem("atproto_session");
    showLoginDialog();
    return false;
  }
}

/**
 * Login to AT Protocol
 */
async function login() {
  const handle = handleInput.value.trim();
  const password = passwordInput.value.trim();

  if (!handle || !password) return;

  updateConnectionStatus("connecting");
  
  try {
    atpAgent = new window.AtpAgent({
      service: "https://bsky.social",
    });

    await atpAgent.login({
      identifier: handle,
      password: password,
    });

    userDid = atpAgent.session.did;
    localStorage.setItem("atproto_session", JSON.stringify(atpAgent.session));
    
    updateConnectionStatus("connected");
    loginDialog.close();
    showMainUI();
    await loadBookmarks();
  } catch (error) {
    console.error("Login failed:", error);
    updateConnectionStatus("disconnected");
    alert("Login failed. Please check your credentials.");
  }
}

/**
 * Logout from AT Protocol
 */
async function logout() {
  if (atpAgent) {
    try {
      await atpAgent.com.atproto.session.delete();
    } catch (error) {
      console.error("Logout error:", error);
    }
  }
  
  atpAgent = null;
  userDid = null;
  bookmarks = [];
  localStorage.removeItem("atproto_session");
  updateConnectionStatus("disconnected");
  showLoginDialog();
}

/**
 * Load bookmarks from PDS
 */
async function loadBookmarks() {
  if (!atpAgent || !userDid) return;

  try {
    updateConnectionStatus("connecting");
    
    const response = await atpAgent.com.atproto.repo.listRecords({
      repo: userDid,
      collection: BOOKMARK_LEXICON,
    });

    bookmarks = response.data.records.map(record => ({
      uri: record.uri,
      cid: record.cid,
      ...record.value
    }));

    renderBookmarks();
    updateConnectionStatus("connected");
  } catch (error) {
    console.error("Failed to load bookmarks:", error);
    updateConnectionStatus("disconnected");
  }
}

/**
 * Save a bookmark to PDS
 */
async function saveBookmark() {
  const title = titleInput.value.trim();
  const url = urlInput.value.trim();
  const rawTags = tagsInput.value.trim();

  if (!title || !url || !atpAgent || !userDid) return;

  const tags = rawTags.split(",").map(t => t.trim()).filter(Boolean);
  
  const bookmarkRecord = {
    $type: BOOKMARK_LEXICON,
    uri: url,
    title,
    tags,
    createdAt: new Date().toISOString(),
  };

  try {
    updateConnectionStatus("connecting");
    
    const response = await atpAgent.com.atproto.repo.createRecord({
      repo: userDid,
      collection: BOOKMARK_LEXICON,
      record: bookmarkRecord,
    });

    // Add to local array
    bookmarks.push({
      uri: response.data.uri,
      cid: response.data.cid,
      ...bookmarkRecord
    });

    renderBookmarks();
    dialog.close();
    updateConnectionStatus("connected");
    
    // Clear URL params and reload to clean state
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    console.error("Failed to save bookmark:", error);
    updateConnectionStatus("disconnected");
    alert("Failed to save bookmark. Please try again.");
  }
}

/**
 * Delete a bookmark from PDS
 */
async function deleteBookmark(uri) {
  if (!atpAgent || !userDid) return;

  try {
    updateConnectionStatus("connecting");
    
    const rkey = uri.split("/").pop();
    await atpAgent.com.atproto.repo.deleteRecord({
      repo: userDid,
      collection: BOOKMARK_LEXICON,
      rkey,
    });

    // Remove from local array
    bookmarks = bookmarks.filter(bookmark => bookmark.uri !== uri);
    renderBookmarks();
    updateConnectionStatus("connected");
  } catch (error) {
    console.error("Failed to delete bookmark:", error);
    updateConnectionStatus("disconnected");
  }
}

// ====== UI Functions ======

function updateConnectionStatus(status) {
  connectionStatus.className = `connection-status ${status}`;
  switch (status) {
    case "connected":
      connectionStatus.textContent = "Connected";
      break;
    case "connecting":
      connectionStatus.textContent = "Connecting...";
      break;
    case "disconnected":
      connectionStatus.textContent = "Disconnected";
      break;
  }
}

function showLoginDialog() {
  loginDialog.showModal();
  openEmptyDialogBtn.style.display = "none";
  sortToggleBtn.style.display = "none";
  searchInput.style.display = "none";
  logoutBtn.style.display = "none";
}

function showMainUI() {
  openEmptyDialogBtn.style.display = "inline-block";
  sortToggleBtn.style.display = "inline-block";
  searchInput.style.display = "inline-block";
  logoutBtn.style.display = "inline-block";
}

// ====== Utility Functions ======

/**
 * Hashes a string to a non-negative 32-bit integer.
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get a color pair deterministically by title.
 */
function getColorPairByTitle(title, pairs) {
  const hash = hashString(title);
  const idx = hash % pairs.length;
  const [bg, fg] = pairs[idx];
  return (hash % 2 === 0) ? [bg, fg] : [fg, bg];
}

/**
 * Get a font family deterministically by title.
 */
function getFontByTitle(title, fonts) {
  return fonts[hashString(title) % fonts.length];
}

// ====== Rendering Functions ======

/**
 * Renders bookmark containers
 */
function renderBookmarks() {
  const containerWrapper = document.querySelector(".containers");
  containerWrapper.innerHTML = "";

  const fragment = document.createDocumentFragment();
  const displayBookmarks = reversedOrder ? bookmarks : [...bookmarks].reverse();

  displayBookmarks.forEach(bookmark => {
    const title = bookmark.title;
    const url = bookmark.uri;
    const tags = bookmark.tags || [];

    if (!title || !url) return;

    const displayTitle = title.replace(/^https?:\/\/(www\.)?/i, "");
    const [bgColor, fontColor] = getColorPairByTitle(title, COLOR_PAIRS);
    const fontFamily = getFontByTitle(title, FONT_LIST);

    const container = document.createElement("div");
    container.className = "container";
    container.style.backgroundColor = bgColor;
    container.style.color = fontColor;
    container.style.fontFamily = `'${fontFamily}', sans-serif`;

    // Delete Button
    const closeBtn = document.createElement("button");
    closeBtn.className = "delete-btn";
    closeBtn.textContent = "x";
    closeBtn.title = "Delete this bookmark";
    closeBtn.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      if (confirm("Delete this bookmark?")) {
        deleteBookmark(bookmark.uri);
      }
    });
    container.appendChild(closeBtn);

    // Anchor (bookmark link)
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.innerHTML = `<span style="font-size: 5vw;"><span>${displayTitle}</span></span>`;
    container.appendChild(anchor);

    // Tags
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

    fragment.appendChild(container);
  });

  containerWrapper.appendChild(fragment);
  runTextFormatting();
}

/**
 * Filter bookmarks by tag
 */
function filterByTag(tag) {
  searchInput.value = `#${tag}`;
  searchInput.dispatchEvent(new Event("input"));
}

/**
 * Formats text inside containers after rendering
 */
function runTextFormatting() {
  document.querySelectorAll(".container").forEach(container => {
    const anchor = container.querySelector("a");
    if (!anchor) return;

    const originalText = anchor.innerText.trim();
    const href = anchor.href;
    if (!originalText || !href) return;

    anchor.innerHTML = "";

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

// ====== Search & Event Handlers ======

/**
 * Debounce utility
 */
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Search functionality for bookmarks
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

/**
 * Show dialog with URL params if present
 */
function showParamsIfPresent() {
  if (!dialog || !atpAgent) return;
  
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title");
  const url = params.get("url");

  if (title && url) {
    titleInput.value = title;
    urlInput.value = url;
    dialog.showModal();
  }
}

// ====== Event Listeners ======

// Login/logout
loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);

// Dialog
saveBtn.addEventListener("click", saveBookmark);
cancelBtn?.addEventListener("click", () => {
  dialog.close();
  window.history.replaceState({}, document.title, window.location.pathname);
});

// Main UI
openEmptyDialogBtn?.addEventListener("click", () => {
  if (!atpAgent) return;
  
  titleInput.value = "";
  urlInput.value = "";
  tagsInput.value = "";
  
  const countInfo = document.getElementById("paramDialogCount");
  countInfo.innerHTML = `${bookmarks.length} bookmarks in PDS`;
  
  dialog.showModal();
});

// Search
searchInput?.addEventListener(
  "input",
  debounce(e => {
    const searchTerm = e.target.value.trim();
    const params = new URLSearchParams(window.location.search);
    if (searchTerm) params.set("search", searchTerm);
    else params.delete("search");
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
    runSearch(searchTerm);
  }, 150)
);

// Sort toggle
sortToggleBtn?.addEventListener("click", () => {
  reversedOrder = !reversedOrder;
  renderBookmarks();

  if (reversedOrder) {
    sortToggleBtn.lastChild.textContent = " ▼";
  } else {
    sortToggleBtn.lastChild.textContent = " ▲";
  }
});

// ====== Initialization ======

document.addEventListener("DOMContentLoaded", async () => {
  updateConnectionStatus("disconnected");
  
  // Wait for AtpAgent to be loaded
  let attempts = 0;
  while (!window.AtpAgent && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!window.AtpAgent) {
    console.error("Failed to load AtpAgent");
    updateConnectionStatus("disconnected");
    return;
  }
  
  const initialized = await initializeATProto();
  if (initialized) {
    showParamsIfPresent();
    
    // Restore search from URL
    const initialSearch = new URLSearchParams(window.location.search).get("search");
    if (initialSearch) {
      searchInput.value = initialSearch;
      runSearch(initialSearch);
    }
  }
});
