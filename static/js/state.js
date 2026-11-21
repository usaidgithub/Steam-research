export const GAMES_PAGE_SIZE = 30;

export const dom = {
    resultsEl: document.getElementById("results"),
    statusEl: document.getElementById("status"),
    errorEl: document.getElementById("errorContainer"),
    searchBtn: document.getElementById("searchButton"),
    inputEl: document.getElementById("appInput"),
    bookmarkedButton: document.getElementById("bookmarkedButton"),
};

export const state = {
    // Shared searched games loaded from MongoDB.
    gamesStore: new Map(),

    // Shared bookmarked games loaded from MongoDB.
    bookmarkedGamesStore: new Map(),
    bookmarkedIds: new Set(),

    bookmarkedIdsLoaded: false,
    bookmarkedIdsLoading: false,
    bookmarkedIdsLoadPromise: null,

    activeDetailId: null,
    currentView: "search",

    // Searched-games cursor pagination.
    searchedGamesLoaded: false,
    searchedGamesLoading: false,
    searchedGamesCursor: null,
    searchedGamesHasMore: true,
    searchedGamesObserver: null,

    bookmarksLoaded: false,
    bookmarksLoading: false,
    bookmarksCursor: null,
    bookmarksHasMore: true,
    bookmarksObserver: null,
};

export const TAG_CLASS =
    "inline-block px-2.5 py-0.5 mr-1 my-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs whitespace-nowrap";

export const TAG_MORE_CLASS =
    "inline-block px-2.5 py-0.5 mr-1 my-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-xs whitespace-nowrap";