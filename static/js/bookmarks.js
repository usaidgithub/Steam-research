import { GAMES_PAGE_SIZE, dom, state } from "./state.js";

export function updateBookmarkNavigation() {
    if (!dom.bookmarkedButton) return;

    dom.bookmarkedButton.textContent =
        state.currentView === "bookmarks"
            ? "← Back to Search"
            : `★ Bookmarked Games (${state.bookmarkedIds.size})`;
}

export async function loadBookmarkedIds(forceRefresh = false, onRender = null) {
    if (state.bookmarkedIdsLoading) {
        await state.bookmarkedIdsLoadPromise;
        return;
    }

    if (state.bookmarkedIdsLoaded && !forceRefresh) {
        return;
    }

    state.bookmarkedIdsLoading = true;

    let succeeded = false;

    state.bookmarkedIdsLoadPromise = (async () => {
        const response = await fetch("/api/bookmarks/ids");
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to load bookmarked game IDs."
            );
        }

        // Replace the complete ID set independently of document pagination.
        state.bookmarkedIds.clear();

        (result.ids || []).forEach(id => {
            state.bookmarkedIds.add(String(id));
        });

        state.bookmarkedIdsLoaded = true;
        succeeded = true;

        updateBookmarkNavigation();
    })();

    try {
        await state.bookmarkedIdsLoadPromise;
    } catch (error) {
        console.error("Bookmark ID synchronization failed:", error);

        dom.statusEl.textContent =
            `Could not synchronize bookmark status: ${error.message}`;
    } finally {
        state.bookmarkedIdsLoading = false;
        state.bookmarkedIdsLoadPromise = null;

        if (onRender) {
            onRender();
        }
    }

    return succeeded;
}

export async function loadBookmarkedGames(forceRefresh = false, onRender = null) {
    if (state.bookmarksLoading) return;

    if (
        state.bookmarksLoaded &&
        !forceRefresh &&
        !state.bookmarksCursor
    ) {
        return;
    }

    // A refresh starts pagination again from page one.
    const cursor = forceRefresh ? null : state.bookmarksCursor;

    state.bookmarksLoading = true;

    if (forceRefresh) {
        state.bookmarksHasMore = true;
    }

    try {
        const params = new URLSearchParams({
            limit: String(GAMES_PAGE_SIZE),
        });

        if (cursor) {
            params.set("cursor", cursor);
        }

        const response = await fetch(`/api/bookmarks?${params.toString()}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to load bookmarked games."
            );
        }

        // First page replaces the existing list.
        if (!cursor) {
            state.bookmarkedGamesStore.clear();
        }

        // Append the next page while preventing duplicates.
        result.games.forEach(game => {
            const appId = String(game.app_id);

            state.bookmarkedGamesStore.set(appId, game);
            state.bookmarkedIds.add(appId);
        });

        state.bookmarksCursor = result.next_cursor || null;
        state.bookmarksHasMore = result.has_more === true;
        state.bookmarksLoaded = true;
    } catch (error) {
        console.error("Bookmark loading failed:", error);

        dom.statusEl.textContent =
            `Could not load bookmarks: ${error.message}`;
    } finally {
        state.bookmarksLoading = false;

        updateBookmarkNavigation();

        if (state.currentView === "bookmarks" && !state.activeDetailId && onRender) {
            onRender();
        }
    }
}

export async function bookmarkGame(data, onRender) {
    const appId = String(data.app_id);

    if (state.bookmarkedIds.has(appId)) {
        dom.statusEl.textContent = "This game is already bookmarked.";
        return;
    }

    try {
        dom.statusEl.textContent = "Saving bookmark...";

        const response = await fetch("/api/bookmarks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...data,
                success: true,
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to bookmark this game."
            );
        }

        // Synchronize the complete bookmark ID set.
        state.bookmarkedIds.add(appId);
        updateBookmarkNavigation();

        await loadBookmarkedIds(true);

        // Reload the saved document from MongoDB.
        await loadBookmarkedGames(true, onRender);

        dom.statusEl.textContent =
            `${data.steam_store?.name || `App ${appId}`} bookmarked successfully.`;

        onRender();
    } catch (error) {
        console.error("Bookmark operation failed:", error);

        dom.statusEl.textContent =
            `Bookmark failed: ${error.message}`;
    }
}

export async function removeBookmark(appId, onRender) {
    const confirmed = window.confirm(
        "Remove this game from the shared bookmarks?"
    );

    if (!confirmed) return;

    try {
        dom.statusEl.textContent = "Removing bookmark...";

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

        const idStr = String(appId);
        state.bookmarkedGamesStore.delete(idStr);
        state.bookmarkedIds.delete(idStr);

        if (state.activeDetailId === idStr) {
            state.activeDetailId = null;
        }

        updateBookmarkNavigation();

        dom.statusEl.textContent = "Bookmark removed successfully.";

        onRender();
    } catch (error) {
        console.error("Bookmark removal failed:", error);

        dom.statusEl.textContent =
            `Could not remove bookmark: ${error.message}`;
    }
}

export async function toggleBookmarkedView(onRender) {
    if (state.currentView === "search") {
        await loadBookmarkedIds(true);
        await loadBookmarkedGames(false, onRender);

        state.currentView = "bookmarks";
        state.activeDetailId = null;
    } else {
        // Refresh shared bookmark status before returning to Search.
        await loadBookmarkedIds(true);

        state.currentView = "search";
        state.activeDetailId = null;
    }

    updateBookmarkNavigation();
    onRender();
}

export function disconnectBookmarksObserver() {
    if (state.bookmarksObserver) {
        state.bookmarksObserver.disconnect();
        state.bookmarksObserver = null;
    }
}

export function setupBookmarksObserver(onRender) {
    disconnectBookmarksObserver();

    if (state.currentView !== "bookmarks") return;
    if (!state.bookmarksHasMore) return;
    if (state.bookmarksLoading) return;

    const sentinel = document.getElementById("bookmarksLoadMoreSentinel");
    if (!sentinel) return;

    state.bookmarksObserver = new IntersectionObserver(
        entries => {
            const entry = entries[0];

            if (
                entry.isIntersecting &&
                !state.bookmarksLoading &&
                state.bookmarksHasMore
            ) {
                loadBookmarkedGames(false, onRender);
            }
        },
        {
            root: null,
            rootMargin: "300px",
            threshold: 0,
        }
    );

    state.bookmarksObserver.observe(sentinel);
}