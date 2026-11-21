import { dom, state, TAG_CLASS } from "./state.js";

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

export function renderFullDetailsPage(data, onBack) {
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
        state.activeDetailId = null;
        onBack();
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

    dom.resultsEl.appendChild(page);
}