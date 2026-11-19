const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("errorContainer");
const searchBtn = document.getElementById("searchButton");
const inputEl = document.getElementById("appInput");

const gamesStore = new Map();
const bookmarkedGamesStore = new Map();
const bookmarkedIds = new Set();

let activeDetailId = null;
let currentView = "search";
let bookmarksLoaded = false;
let bookmarksLoading = false;

const bookmarkedButton = document.getElementById("bookmarkedButton");

const TAG_CLASS = "inline-block px-2.5 py-0.5 mr-1 my-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs whitespace-nowrap";
const TAG_MORE_CLASS = "inline-block px-2.5 py-0.5 mr-1 my-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-xs whitespace-nowrap";


/* ================= BOOKMARK MANAGEMENT ================= */

function updateBookmarkNavigation() {
    if (!bookmarkedButton) return;

    bookmarkedButton.textContent =
        currentView === "bookmarks"
            ? "← Back to Search"
            : `★ Bookmarked Games (${bookmarkedIds.size})`;
}

async function loadBookmarkedGames(forceRefresh = false) {
    if (bookmarksLoading) return;

    if (bookmarksLoaded && !forceRefresh) {
        return;
    }

    bookmarksLoading = true;

    try {
        const response = await fetch("/api/bookmarks");
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to load bookmarked games."
            );
        }

        bookmarkedGamesStore.clear();
        bookmarkedIds.clear();

        result.games.forEach(game => {
            const appId = String(game.app_id);

            bookmarkedGamesStore.set(appId, game);
            bookmarkedIds.add(appId);
        });

        bookmarksLoaded = true;

    } catch (error) {
        console.error("Bookmark loading failed:", error);

        statusEl.textContent =
            `Could not load bookmarks: ${error.message}`;

    } finally {
        bookmarksLoading = false;
        updateBookmarkNavigation();
    }
}

async function bookmarkGame(data) {
    const appId = String(data.app_id);

    if (bookmarkedIds.has(appId)) {
        statusEl.textContent = "This game is already bookmarked.";
        return;
    }

    try {
        statusEl.textContent = "Saving bookmark...";

        const response = await fetch("/api/bookmarks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to bookmark this game."
            );
        }

        // Reload the saved document from MongoDB.
        await loadBookmarkedGames(true);

        statusEl.textContent =
            `${data.steam_store?.name || `App ${appId}`} bookmarked successfully.`;

        render();

    } catch (error) {
        console.error("Bookmark operation failed:", error);

        statusEl.textContent =
            `Bookmark failed: ${error.message}`;
    }
}

async function removeBookmark(appId) {
    const confirmed = window.confirm(
        "Remove this game from the shared bookmarks?"
    );

    if (!confirmed) return;

    try {
        statusEl.textContent = "Removing bookmark...";

        const response = await fetch(
            `/api/bookmarks/${encodeURIComponent(appId)}`,
            { method: "DELETE" }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to remove bookmark."
            );
        }

        bookmarkedGamesStore.delete(String(appId));
        bookmarkedIds.delete(String(appId));

        if (activeDetailId === String(appId)) {
            activeDetailId = null;
        }

        updateBookmarkNavigation();

        statusEl.textContent = "Bookmark removed successfully.";

        render();

    } catch (error) {
        console.error("Bookmark removal failed:", error);

        statusEl.textContent =
            `Could not remove bookmark: ${error.message}`;
    }
}

async function toggleBookmarkedView() {
    if (currentView === "search") {
        await loadBookmarkedGames();

        currentView = "bookmarks";
        activeDetailId = null;

    } else {
        currentView = "search";
        activeDetailId = null;
    }

    updateBookmarkNavigation();
    render();
}

bookmarkedButton.addEventListener(
    "click",
    toggleBookmarkedView
);

/* ================= TABLE ROW (PRIMARY COLUMNS ONLY) ================= */

function buildSummaryRow(data) {
    const appId = String(data.app_id);
    const store = data.steam_store || {};
    const reviews = data.steam_reviews || {};
    const analyzer = data.steam_page_analyzer || {};

    const tr = createEl("tr", "border-b border-slate-200 hover:bg-slate-50/70 transition");

    // 1. Game Name & Thumbnail
    const tdGame = createEl("td", "px-4 py-3.5 align-middle");
    const gameWrap = createEl("div", "flex items-center gap-3 min-w-[210px]");
    const thumb = store.capsule_image || store.header_image;
    if (thumb) {
        const img = createEl("img", "w-20 h-9 object-cover rounded bg-slate-200 shrink-0");
        img.src = thumb;
        img.alt = store.name || `App ${appId}`;
        img.loading = "lazy";
        gameWrap.appendChild(img);
    }
    const titleBox = createEl("div");
    titleBox.appendChild(createEl("div", "font-semibold text-slate-900", store.name || `Steam App ${appId}`));
    titleBox.appendChild(createEl("span", "block text-xs text-slate-500 mt-0.5", `ID: ${appId}`));
    gameWrap.appendChild(titleBox);
    tdGame.appendChild(gameWrap);
    tr.appendChild(tdGame);

    // 2. Revenue
    const tdRev = createEl("td", "px-4 py-3.5 align-middle whitespace-nowrap");
    if (analyzer.available && analyzer.revenue_usd) {
        tdRev.appendChild(createEl("div", "font-bold text-teal-700", formatUSD(analyzer.revenue_usd.mid)));
        tdRev.appendChild(
            createEl("span", "block text-xs text-slate-500 mt-0.5", `${formatUSD(analyzer.revenue_usd.low)} – ${formatUSD(analyzer.revenue_usd.high)}`)
        );
    } else {
        tdRev.appendChild(createEl("span", "text-xs text-slate-500", analyzer.reason || "Unavailable"));
    }
    tr.appendChild(tdRev);

    // 3. Review (Numeric)
    const tdRevCount = createEl("td", "px-4 py-3.5 align-middle whitespace-nowrap");
    if (reviews.available && reviews.total_reviews != null) {
        tdRevCount.appendChild(createEl("div", "font-semibold text-slate-900", formatNumber(reviews.total_reviews)));
        if (reviews.total_reviews > 0 && reviews.positive_reviews != null) {
            const pct = Math.round((reviews.positive_reviews / reviews.total_reviews) * 100);
            tdRevCount.appendChild(createEl("span", "block text-xs text-slate-500 mt-0.5", `${pct}% positive`));
        }
    } else {
        tdRevCount.appendChild(createEl("span", "text-xs text-slate-500", "N/A"));
    }
    tr.appendChild(tdRevCount);

    // 4. Publisher Name
    const publishers = Array.isArray(store.publishers) && store.publishers.length ? store.publishers.join(", ") : "N/A";
    tr.appendChild(createEl("td", "px-4 py-3.5 align-middle text-slate-700", publishers));

    // 5. Developer Name
    const developers = Array.isArray(store.developers) && store.developers.length ? store.developers.join(", ") : "N/A";
    tr.appendChild(createEl("td", "px-4 py-3.5 align-middle text-slate-700", developers));

    // 6. Release Date
    tr.appendChild(createEl("td", "px-4 py-3.5 align-middle whitespace-nowrap text-slate-700", store.release_date?.date || "N/A"));

    // 7. Tags (Top 4 + overflow)
    const tdTags = createEl("td", "px-4 py-3.5 align-middle max-w-[250px]");
    const tags = getGameTags(data);
    if (tags.length) {
        tags.slice(0, 4).forEach(tag => tdTags.appendChild(createEl("span", TAG_CLASS, tag)));
        if (tags.length > 4) {
            tdTags.appendChild(createEl("span", TAG_MORE_CLASS, `+${tags.length - 4}`));
        }
    } else {
        tdTags.appendChild(createEl("span", "text-xs text-slate-400", "No tags"));
    }
    tr.appendChild(tdTags);


    // 8. Actions: Details, Bookmark, Remove

    const tdActions = createEl(
        "td",
        "px-4 py-3.5 align-middle whitespace-nowrap"
    );

    const actionWrap = createEl(
        "div",
        "flex items-center gap-2"
    );

    const viewBtn = createEl(
        "button",
        "bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 font-medium text-xs px-3 py-1.5 rounded-md transition cursor-pointer",
        "Show More Details"
    );

    viewBtn.onclick = () => {
        activeDetailId = appId;
        window.scrollTo({ top: 0, behavior: "smooth" });
        render();
    };

    actionWrap.appendChild(viewBtn);

    if (currentView === "bookmarks") {

        const removeBookmarkBtn = createEl(
            "button",
            "bg-white hover:bg-red-50 border border-red-200 text-red-600 font-medium text-xs px-2.5 py-1.5 rounded-md transition cursor-pointer",
            "Remove"
        );

        removeBookmarkBtn.onclick = () => {
            removeBookmark(appId);
        };

        actionWrap.appendChild(removeBookmarkBtn);

    } else {

        const bookmarkBtn = createEl(
            "button",
            bookmarkedIds.has(appId)
                ? "bg-slate-100 border border-slate-200 text-slate-500 font-medium text-xs px-3 py-1.5 rounded-md cursor-not-allowed"
                : "bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs px-3 py-1.5 rounded-md transition cursor-pointer",
            bookmarkedIds.has(appId) ? "★ Saved" : "☆ Bookmark"
        );

        bookmarkBtn.disabled = bookmarkedIds.has(appId);

        bookmarkBtn.onclick = () => {
            bookmarkBtn.disabled = true;
            bookmarkGame(data);
        };

        actionWrap.appendChild(bookmarkBtn);

        const removeBtn = createEl(
            "button",
            "bg-white hover:bg-red-50 border border-red-200 text-red-600 font-medium text-xs px-2.5 py-1.5 rounded-md transition cursor-pointer",
            "✕"
        );

        removeBtn.title = "Remove from search results";

        removeBtn.onclick = () => {
            gamesStore.delete(appId);
            render();
        };

        actionWrap.appendChild(removeBtn);
    }

    tdActions.appendChild(actionWrap);
    tr.appendChild(tdActions);


    return tr;
}

/* ================= FULL-PAGE DETAILS VIEW ================= */

function appendGridSection(parent, title, fieldsObj, noteText = "") {
    const entries = Object.entries(fieldsObj || {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (!entries.length) return;

    const section = createEl("div", "bg-white border border-slate-200 rounded-xl p-5 mt-5 shadow-sm");
    section.appendChild(createEl("h2", "text-base font-semibold text-teal-700 pb-2.5 mb-4 border-b border-slate-200", title));
    if (noteText) section.appendChild(createEl("p", "text-xs text-slate-500 mb-3", noteText));

    const grid = createEl("div", "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3");
    entries.forEach(([key, val]) => {
        const field = createEl("div", "p-3.5 bg-slate-50 border border-slate-200 rounded-lg break-words");
        field.appendChild(createEl("div", "text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1", key.replaceAll("_", " ")));
        field.appendChild(createEl("div", "text-sm font-medium text-slate-900 leading-snug", formatValue(val)));
        grid.appendChild(field);
    });

    section.appendChild(grid);
    parent.appendChild(section);
}

function renderFullDetailsPage(data) {
    const store = data.steam_store || {};
    const players = data.steam_players || {};
    const reviews = data.steam_reviews || {};
    const steamspy = data.steamspy || {};
    const analyzer = data.steam_page_analyzer || {};

    const page = createEl("div", "pb-10");

    // Top Navigation Bar
    const topBar = createEl("div", "flex items-center justify-between mb-4");
    const backBtn = createEl(
        "button",
        "inline-flex items-center gap-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition cursor-pointer",
        "← Back to Games Table"
    );
    backBtn.onclick = () => {
        activeDetailId = null;
        render();
    };
    topBar.appendChild(backBtn);
    topBar.appendChild(createEl("span", "text-xs text-slate-500", `Steam App ID: ${data.app_id}`));
    page.appendChild(topBar);

    // Game Hero Header
    const hero = createEl("div", "flex flex-col md:flex-row gap-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm");
    const imgUrl = store.header_image || store.capsule_image;
    if (imgUrl) {
        const img = createEl("img", "w-full md:w-80 object-cover rounded-lg shrink-0");
        img.src = imgUrl;
        img.alt = store.name || `App ${data.app_id}`;
        hero.appendChild(img);
    }
    const heroInfo = createEl("div", "flex-1");
    heroInfo.appendChild(createEl("h2", "text-2xl font-bold text-slate-900 mb-2", store.name || `Steam App ${data.app_id}`));
    heroInfo.appendChild(createEl("p", "text-sm text-slate-600 leading-relaxed mb-4", store.short_description || "No description available."));

    // Quick Key Summary Strip inside Hero
    const quickMeta = createEl("div", "flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600 pt-3 border-t border-slate-100");
    quickMeta.appendChild(createEl("span", "", `Developer: ${Array.isArray(store.developers) ? store.developers.join(", ") : "N/A"}`));
    quickMeta.appendChild(createEl("span", "", `Publisher: ${Array.isArray(store.publishers) ? store.publishers.join(", ") : "N/A"}`));
    quickMeta.appendChild(createEl("span", "", `Release Date: ${store.release_date?.date || "N/A"}`));
    heroInfo.appendChild(quickMeta);

    hero.appendChild(heroInfo);
    page.appendChild(hero);

    // Players & Reviews
    appendGridSection(page, "Popularity & Review Breakdown", {
        current_players: players.available ? formatNumber(players.current_players) : players.reason || "N/A",
        review_summary: reviews.available ? reviews.review_score_description : "N/A",
        positive_reviews: reviews.available ? formatNumber(reviews.positive_reviews) : null,
        negative_reviews: reviews.available ? formatNumber(reviews.negative_reviews) : null,
        total_reviews: reviews.available ? formatNumber(reviews.total_reviews) : null
    });

    // SteamSpy
    appendGridSection(page, "SteamSpy Market Estimates", {
        estimated_owners: steamspy.available ? steamspy.owners_estimate : steamspy.reason || "N/A",
        avg_playtime_forever_mins: steamspy.available ? formatNumber(steamspy.average_playtime_forever_minutes) : null,
        median_playtime_forever_mins: steamspy.available ? formatNumber(steamspy.median_playtime_forever_minutes) : null,
        peak_ccu_yesterday: steamspy.available ? formatNumber(steamspy.peak_ccu_yesterday) : null
    });

    // Revenue Details
    if (analyzer.available) {
        appendGridSection(
            page,
            "Sales & Revenue Intelligence",
            {
                estimated_units_sold: formatRange(analyzer.units_sold, formatNumber),
                estimated_net_revenue: formatRange(analyzer.revenue_usd, formatUSD),
                estimation_method: analyzer.method,
                confidence: analyzer.confidence,
                price_used: analyzer.inputs?.price_usd != null ? formatUSD(analyzer.inputs.price_usd) : null,
                primary_genre: analyzer.inputs?.primary_genre,
                net_revenue_per_unit: analyzer.net_revenue_per_unit_usd != null ? formatUSD(analyzer.net_revenue_per_unit_usd) : null
            },
            "Third-party model estimates (not verified Steam figures)."
        );
    }

    // Store & Commercial Metadata
    if (store.available) {
        const price = store.price || {};
        appendGridSection(page, "Commercial & Store Metadata", {
            type: store.type,
            is_free: store.is_free,
            current_price: price.final_formatted,
            original_price: price.initial_formatted,
            discount: price.discount_percent != null ? `${price.discount_percent}%` : null,
            achievements: store.achievements?.total,
            metacritic_score: store.metacritic?.score
        });

        // All Tags
        const allTags = getGameTags(data);
        if (allTags.length) {
            const tagSec = createEl("div", "bg-white border border-slate-200 rounded-xl p-5 mt-5 shadow-sm");
            tagSec.appendChild(createEl("h2", "text-base font-semibold text-teal-700 pb-2.5 mb-3 border-b border-slate-200", "All Tags"));
            allTags.forEach(t => tagSec.appendChild(createEl("span", TAG_CLASS, t)));
            page.appendChild(tagSec);
        }

        // Screenshots
        if (Array.isArray(store.screenshots) && store.screenshots.length) {
            const shotSec = createEl("div", "bg-white border border-slate-200 rounded-xl p-5 mt-5 shadow-sm");
            shotSec.appendChild(createEl("h2", "text-base font-semibold text-teal-700 pb-2.5 mb-3 border-b border-slate-200", "Screenshots"));
            const shotRow = createEl("div", "flex overflow-x-auto gap-3 pb-1");
            store.screenshots.forEach(url => {
                if (!url) return;
                const img = createEl("img", "w-72 rounded-lg shrink-0 border border-slate-200");
                img.src = url;
                img.alt = "Game screenshot";
                img.loading = "lazy";
                shotRow.appendChild(img);
            });
            shotSec.appendChild(shotRow);
            page.appendChild(shotSec);
        }

        // Detailed Description
        if (store.detailed_description) {
            const descSec = createEl("div", "bg-white border border-slate-200 rounded-xl p-5 mt-5 shadow-sm");
            descSec.appendChild(createEl("h2", "text-base font-semibold text-teal-700 pb-2.5 mb-3 border-b border-slate-200", "About This Game"));
            const descVal = createEl("div", "text-sm text-slate-700 leading-relaxed whitespace-pre-line");
            const temp = document.createElement("div");
            temp.innerHTML = store.detailed_description;
            descVal.textContent = temp.textContent || "";
            descSec.appendChild(descVal);
            page.appendChild(descSec);
        }
    }

    // External Links
    const linkSec = createEl("div", "bg-white border border-slate-200 rounded-xl p-5 mt-5 shadow-sm");
    linkSec.appendChild(createEl("h2", "text-base font-semibold text-teal-700 pb-2.5 mb-3 border-b border-slate-200", "External Links"));
    const links = createEl("div", "flex flex-wrap gap-y-2");
    addSafeLink(links, "Steam Store Page", `https://store.steampowered.com/app/${data.app_id}/`);
    if (store.website) addSafeLink(links, "Official Website", store.website);
    if (analyzer.source_url) addSafeLink(links, "Steam Page Analyzer", analyzer.source_url);
    linkSec.appendChild(links);
    page.appendChild(linkSec);

    resultsEl.appendChild(page);
}

/* ================= MAIN VIEW SWITCHER & SEARCH ================= */


function render() {
    resultsEl.innerHTML = "";

    const activeStore =
        currentView === "bookmarks"
            ? bookmarkedGamesStore
            : gamesStore;

    // Full-page details view
    if (activeDetailId && activeStore.has(activeDetailId)) {
        renderFullDetailsPage(
            activeStore.get(activeDetailId)
        );
        return;
    }

    if (!activeStore.size) {
        resultsEl.appendChild(
            createEl(
                "div",
                "text-center py-10 px-5 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl text-sm",
                currentView === "bookmarks"
                    ? "No bookmarked games yet. Search for games and bookmark the ones worth researching."
                    : "No games added yet. Enter a Steam App ID or Store URL above."
            )
        );

        return;
    }

    const toolbar = createEl(
        "div",
        "flex justify-between items-center mb-3 text-sm text-slate-600"
    );

    toolbar.appendChild(
        createEl(
            "span",
            "",
            currentView === "bookmarks"
                ? `${bookmarkedGamesStore.size} bookmarked game${bookmarkedGamesStore.size === 1 ? "" : "s"}`
                : `Showing ${gamesStore.size} game${gamesStore.size === 1 ? "" : "s"}`
        )
    );

    if (currentView === "search") {
        const clearBtn = createEl(
            "button",
            "bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium text-xs px-3 py-1.5 rounded-md transition cursor-pointer",
            "Clear All"
        );

        clearBtn.onclick = () => {
            gamesStore.clear();
            activeDetailId = null;
            statusEl.textContent = "";
            errorEl.innerHTML = "";
            render();
        };

        toolbar.appendChild(clearBtn);
    }

    resultsEl.appendChild(toolbar);

    const wrap = createEl(
        "div",
        "w-full overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm"
    );

    const table = createEl(
        "table",
        "w-full border-collapse min-w-[1020px] text-sm text-left"
    );

    const thead = createEl("thead");
    const headRow = createEl(
        "tr",
        "bg-slate-100 border-b border-slate-200"
    );

    [
        "Game",
        "Revenue (Est.)",
        "Reviews",
        "Publisher",
        "Developer",
        "Release Date",
        "Tags",
        "Actions"
    ].forEach(col => {
        headRow.appendChild(
            createEl(
                "th",
                "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap",
                col
            )
        );
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = createEl("tbody");

    activeStore.forEach(data => {
        tbody.appendChild(buildSummaryRow(data));
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    resultsEl.appendChild(wrap);
}


async function handleSearch() {
    const queries = inputEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!queries.length) {
        statusEl.textContent = "Enter at least one Steam App ID or URL.";
        return;
    }

    // Return to search results when adding new games
    currentView = "search";
    activeDetailId = null;
    updateBookmarkNavigation();
    searchBtn.disabled = true;
    errorEl.innerHTML = "";
    statusEl.textContent = `Fetching ${queries.length} game${queries.length > 1 ? "s" : ""}...`;

    let added = 0;
    for (const q of queries) {
        try {
            const res = await fetch("/api/game?app_id=" + encodeURIComponent(q));
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || data.errors?.map(e => e.message).join("; ") || `Failed for "${q}"`);
            }
            gamesStore.set(String(data.app_id), data);
            added++;
            render();
        } catch (err) {
            errorEl.appendChild(
                createEl("div", "text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg mt-2.5 text-sm", `${q}: ${err.message}`)
            );
        }
    }

    if (added > 0) {
        inputEl.value = "";
        statusEl.textContent = `Added ${added} game${added > 1 ? "s" : ""}.`;
    } else {
        statusEl.textContent = "Could not fetch game details.";
    }

    searchBtn.disabled = false;
}

/* ================= DRAG & DROP / PASTE URL SUPPORT ================= */

function extractSteamQueries(rawText) {
    if (!rawText) return [];

    // 1. Match Steam Store, SteamDB, SteamCommunity, or any /app/<id> URL
    const urlMatches = rawText.match(/https?:\/\/(?:store\.steampowered\.com|steamdb\.info|steamcommunity\.com)\/app\/\d+[^\s"'<>]*/gi);
    if (urlMatches && urlMatches.length) {
        return [...new Set(urlMatches)];
    }

    // 2. Fallback: extract numeric App IDs from any URL containing /app/<id> or standalone numbers
    const appIdMatches = [...rawText.matchAll(/(?:\/app\/|^|\b)(\d{3,10})(?:\/|$|\b)/g)].map(m => m[1]);
    if (appIdMatches.length) {
        return [...new Set(appIdMatches)];
    }

    return [];
}

function setupDragAndDrop() {
    let dragCounter = 0;

    // Full-screen subtle drop overlay
    const dropOverlay = createEl(
        "div",
        "fixed inset-0 z-50 hidden items-center justify-center bg-teal-900/20 backdrop-blur-[2px] pointer-events-none p-6"
    );
    const dropCard = createEl(
        "div",
        "bg-white border-2 border-dashed border-teal-600 rounded-2xl px-8 py-6 text-center shadow-xl"
    );
    dropCard.appendChild(createEl("div", "text-lg font-bold text-teal-700", "Drop Steam Link to Fetch Game"));
    dropCard.appendChild(createEl("p", "text-sm text-slate-500 mt-1", "Release anywhere on the page to add it to your table"));
    dropOverlay.appendChild(dropCard);
    document.body.appendChild(dropOverlay);

    function showOverlay() {
        dropOverlay.classList.remove("hidden");
        dropOverlay.classList.add("flex");
    }

    function hideOverlay() {
        dragCounter = 0;
        dropOverlay.classList.add("hidden");
        dropOverlay.classList.remove("flex");
    }

    window.addEventListener("dragenter", e => {
        e.preventDefault();
        dragCounter++;
        showOverlay();
    });

    window.addEventListener("dragover", e => {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
        }
    });

    window.addEventListener("dragleave", e => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            hideOverlay();
        }
    });

    window.addEventListener("drop", e => {
        e.preventDefault();
        hideOverlay();

        const droppedUri = e.dataTransfer?.getData("text/uri-list") || "";
        const droppedText = e.dataTransfer?.getData("text/plain") || "";
        const combined = `${droppedUri}\n${droppedText}`.trim();

        const queries = extractSteamQueries(combined);
        if (!queries.length) {
            statusEl.textContent = "Dropped item did not contain a valid Steam Store link or App ID.";
            return;
        }

        inputEl.value = queries.join(", ");
        handleSearch();
    });

    // Bonus: Paste a Steam URL anywhere on the page without clicking the input first
    window.addEventListener("paste", e => {
        if (document.activeElement === inputEl) return;
        const pasted = e.clipboardData?.getData("text") || "";
        const queries = extractSteamQueries(pasted);
        if (queries.length) {
            e.preventDefault();
            inputEl.value = queries.join(", ");
            handleSearch();
        }
    });
}

setupDragAndDrop();

inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearch();
});

// Load shared bookmarks when the dashboard starts.
loadBookmarkedGames();

updateBookmarkNavigation();

render();
