import { dom, state } from "./state.js";
import {
    loadBookmarkedGames,
    loadBookmarkedIds,
    toggleBookmarkedView,
    updateBookmarkNavigation,
    disconnectBookmarksObserver,
} from "./bookmarks.js";
import {
    loadSearchedGames,
    disconnectSearchedGamesObserver,
} from "./searchedGames.js";
import { renderGamesTable } from "./tableView.js";
import { renderFullDetailsPage } from "./detailsView.js";
import { setupDragAndDrop } from "./dragDrop.js";

export function render() {
    disconnectBookmarksObserver();
    disconnectSearchedGamesObserver();

    dom.resultsEl.innerHTML = "";

    const activeStore =
        state.currentView === "bookmarks"
            ? state.bookmarkedGamesStore
            : state.gamesStore;

    // Full-page details view.
    if (state.activeDetailId && activeStore.has(state.activeDetailId)) {
        renderFullDetailsPage(activeStore.get(state.activeDetailId), render);
        return;
    }

    renderGamesTable(activeStore, render);
}

export async function handleSearch() {
    const queries = dom.inputEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!queries.length) {
        dom.statusEl.textContent = "Enter at least one Steam App ID or URL.";
        return;
    }

    // Return to search results when adding new games
    state.currentView = "search";
    state.activeDetailId = null;
    updateBookmarkNavigation();

    // Load the first page only if search history hasn't been loaded yet.
    if (!state.searchedGamesLoaded) {
        await loadSearchedGames(false, render);
    }

    dom.searchBtn.disabled = true;
    dom.errorEl.innerHTML = "";
    dom.statusEl.textContent = `Fetching ${queries.length} game${queries.length > 1 ? "s" : ""}...`;

    let added = 0;
    for (const q of queries) {
        try {
            const res = await fetch("/api/game?app_id=" + encodeURIComponent(q));
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || data.errors?.map(e => e.message).join("; ") || `Failed for "${q}"`);
            }
            state.gamesStore.set(String(data.app_id), data);
            added++;
            render();
        } catch (err) {
            dom.errorEl.appendChild(
                createEl(
                    "div",
                    "text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg mt-2.5 text-sm",
                    `${q}: ${err.message}`
                )
            );
        }
    }

    // Synchronize the latest search history from MongoDB.
    if (added > 0) {
        await loadSearchedGames(true, render);
    }

    if (added > 0) {
        dom.inputEl.value = "";
        dom.statusEl.textContent = `Added ${added} game${added > 1 ? "s" : ""}.`;
    } else {
        dom.statusEl.textContent = "Could not fetch game details.";
    }

    dom.searchBtn.disabled = false;
}

// Keep compatibility with inline onclick="handleSearch()" in index.html
window.handleSearch = handleSearch;

if (dom.bookmarkedButton) {
    dom.bookmarkedButton.addEventListener("click", () => toggleBookmarkedView(render));
}

dom.inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearch();
});

setupDragAndDrop(handleSearch);

// Load shared bookmark IDs independently of paginated game documents.
loadBookmarkedIds(false, render);

// Load the first page of bookmarked game documents.
loadBookmarkedGames(false, render);

// Load the first page of shared search history.
loadSearchedGames(false, render);

updateBookmarkNavigation();
render();