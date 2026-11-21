
import { GAMES_PAGE_SIZE, dom, state } from "./state.js";

export async function loadSearchedGames(forceRefresh = false, onRender = null) {
    if (state.searchedGamesLoading) return;

    if (
        state.searchedGamesLoaded &&
        !forceRefresh &&
        !state.searchedGamesCursor
    ) {
        return;
    }

    // Refresh always starts from page one.
    const cursor = forceRefresh
        ? null
        : state.searchedGamesCursor;

    state.searchedGamesLoading = true;

    try {
        const params = new URLSearchParams({
            limit: String(GAMES_PAGE_SIZE),
        });

        if (cursor) {
            params.set("cursor", cursor);
        }

        const response = await fetch(
            `/api/searched-games?${params.toString()}`
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Unable to load searched games."
            );
        }

        // A first-page request replaces the existing list.
        if (!cursor) {
            state.gamesStore.clear();
        }

        // Append records while preventing duplicate App IDs.
        result.games.forEach(game => {
            state.gamesStore.set(String(game.app_id), game);
        });

        state.searchedGamesCursor = result.next_cursor || null;
        state.searchedGamesHasMore = result.has_more === true;
        state.searchedGamesLoaded = true;

        if (!cursor) {
            dom.statusEl.textContent =
                `Loaded ${state.gamesStore.size} shared searched games.`;
        }

    } catch (error) {
        console.error("Searched games loading failed:", error);

        dom.statusEl.textContent =
            `Could not load searched games: ${error.message}`;

    } finally {
        state.searchedGamesLoading = false;

        if (
            state.currentView === "search" &&
            !state.activeDetailId &&
            onRender
        ) {
            onRender();
        }
    }
}

export function disconnectSearchedGamesObserver() {
    if (state.searchedGamesObserver) {
        state.searchedGamesObserver.disconnect();
        state.searchedGamesObserver = null;
    }
}

export function setupSearchedGamesObserver(onRender) {
    disconnectSearchedGamesObserver();

    if (state.currentView !== "search") return;
    if (!state.searchedGamesHasMore) return;
    if (state.searchedGamesLoading) return;

    const sentinel = document.getElementById(
        "searchedGamesLoadMoreSentinel"
    );

    if (!sentinel) return;

    state.searchedGamesObserver = new IntersectionObserver(
        entries => {
            const entry = entries[0];

            if (
                entry.isIntersecting &&
                !state.searchedGamesLoading &&
                state.searchedGamesHasMore
            ) {
                loadSearchedGames(false, onRender);
            }
        },
        {
            root: null,
            rootMargin: "300px",
            threshold: 0,
        }
    );

    state.searchedGamesObserver.observe(sentinel);
}
