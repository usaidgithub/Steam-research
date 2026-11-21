import { dom } from "./state.js";

export function extractSteamQueries(rawText) {
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

export function setupDragAndDrop(onSearch) {
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
            dom.statusEl.textContent = "Dropped item did not contain a valid Steam Store link or App ID.";
            return;
        }

        dom.inputEl.value = queries.join(", ");
        onSearch();
    });

    // Bonus: Paste a Steam URL anywhere on the page without clicking the input first
    window.addEventListener("paste", e => {
        if (document.activeElement === dom.inputEl) return;
        const pasted = e.clipboardData?.getData("text") || "";
        const queries = extractSteamQueries(pasted);
        if (queries.length) {
            e.preventDefault();
            dom.inputEl.value = queries.join(", ");
            onSearch();
        }
    });
}