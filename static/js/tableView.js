import { dom, state, TAG_CLASS, TAG_MORE_CLASS } from "./state.js";
import { bookmarkGame, removeBookmark, setupBookmarksObserver, loadBookmarkedGames } from "./bookmarks.js";
import {
    loadSearchedGames,
    setupSearchedGamesObserver,
} from "./searchedGames.js";

function buildSummaryRow(data, onRender) {
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
    const tdActions = createEl("td", "px-4 py-3.5 align-middle whitespace-nowrap");
    const actionWrap = createEl("div", "flex items-center gap-2");

    const viewBtn = createEl(
        "button",
        "bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 font-medium text-xs px-3 py-1.5 rounded-md transition cursor-pointer",
        "Show More Details"
    );

    viewBtn.onclick = () => {
        state.activeDetailId = appId;
        window.scrollTo({ top: 0, behavior: "smooth" });
        onRender();
    };

    actionWrap.appendChild(viewBtn);

    if (state.currentView === "bookmarks") {
        const removeBookmarkBtn = createEl(
            "button",
            "bg-white hover:bg-red-50 border border-red-200 text-red-600 font-medium text-xs px-2.5 py-1.5 rounded-md transition cursor-pointer",
            "Remove"
        );

        removeBookmarkBtn.onclick = () => {
            removeBookmark(appId, onRender);
        };

        actionWrap.appendChild(removeBookmarkBtn);
    } else {
        const isSaved = state.bookmarkedIds.has(appId);
        const bookmarkBtn = createEl(
            "button",
            isSaved
                ? "bg-slate-100 border border-slate-200 text-slate-500 font-medium text-xs px-3 py-1.5 rounded-md cursor-not-allowed"
                : "bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs px-3 py-1.5 rounded-md transition cursor-pointer",
            isSaved ? "★ Saved" : "☆ Bookmark"
        );

        bookmarkBtn.disabled = isSaved;

        bookmarkBtn.onclick = () => {
            bookmarkBtn.disabled = true;
            bookmarkGame(data, onRender);
        };

        actionWrap.appendChild(bookmarkBtn);
    }

    tdActions.appendChild(actionWrap);
    tr.appendChild(tdActions);

    return tr;
}

export function renderGamesTable(activeStore, onRender) {
    // Empty state.
    if (!activeStore.size) {
        dom.resultsEl.appendChild(
            createEl(
                "div",
                "text-center py-10 px-5 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl text-sm",
                state.currentView === "bookmarks"
                    ? "No bookmarked games yet. Search for games and bookmark the ones worth researching."
                    : "No searched games yet. Enter a Steam App ID or Store URL above."
            )
        );
        return;
    }

    // Toolbar.
    const toolbar = createEl(
        "div",
        "flex justify-between items-center mb-3 text-sm text-slate-600"
    );

    toolbar.appendChild(
        createEl(
            "span",
            "",
            state.currentView === "bookmarks"
                ? `${state.bookmarkedGamesStore.size} bookmarked game${state.bookmarkedGamesStore.size === 1 ? "" : "s"}`
                : `${state.gamesStore.size} games in shared search history`
        )
    );

    if (state.currentView === "search") {

        const refreshBtn = createEl(
            "button",
            "bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium text-xs px-3 py-1.5 rounded-md transition cursor-pointer",
            "↻ Refresh"
        );

        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = "Loading...";

            if (state.currentView === "bookmarks") {
                await loadBookmarkedGames(true, onRender);
            } else {
                await loadSearchedGames(true, onRender);
            }

            refreshBtn.disabled = false;
            refreshBtn.textContent = "↻ Refresh";
        };

        toolbar.appendChild(refreshBtn);
    }

    dom.resultsEl.appendChild(toolbar);

    // Table.
    const wrap = createEl(
        "div",
        "w-full overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm"
    );

    const table = createEl(
        "table",
        "w-full border-collapse min-w-[1020px] text-sm text-left"
    );

    const thead = createEl("thead");
    const headRow = createEl("tr", "bg-slate-100 border-b border-slate-200");

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
        tbody.appendChild(buildSummaryRow(data, onRender));
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    dom.resultsEl.appendChild(wrap);

    // Infinite-scroll target for bookmarked games.

    // Infinite-scroll footer for the active collection.
    const paginationFooter = createEl(
        "div",
        "flex justify-center items-center py-6 text-sm text-slate-500"
    );

    if (state.currentView === "bookmarks") {
        if (state.bookmarksHasMore) {
            const sentinel = createEl(
                "div",
                "w-full text-center py-3",
                state.bookmarksLoading
                    ? "Loading more bookmarked games..."
                    : "Scroll to load more bookmarked games..."
            );

            sentinel.id = "bookmarksLoadMoreSentinel";
            paginationFooter.appendChild(sentinel);
        } else {
            paginationFooter.textContent =
                "You have reached the end of your bookmarked games.";
        }

        dom.resultsEl.appendChild(paginationFooter);
        setupBookmarksObserver(onRender);

    } else {
        if (state.searchedGamesHasMore) {
            const sentinel = createEl(
                "div",
                "w-full text-center py-3",
                state.searchedGamesLoading
                    ? "Loading more searched games..."
                    : "Scroll to load more searched games..."
            );

            sentinel.id = "searchedGamesLoadMoreSentinel";
            paginationFooter.appendChild(sentinel);
        } else {
            paginationFooter.textContent =
                "You have reached the end of your search history.";
        }

        dom.resultsEl.appendChild(paginationFooter);
        setupSearchedGamesObserver(onRender);
    }

}