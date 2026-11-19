function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
}

function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "N/A";
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString("en-US") : String(value);
}

function formatUSD(value) {
    if (value === null || value === undefined || value === "") return "N/A";
    const num = Number(value);
    if (!Number.isFinite(num)) return "N/A";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(num);
}

function formatRange(range, formatter) {
    if (!range || typeof range !== "object") return "Not available";
    return `Low: ${formatter(range.low)} | Mid: ${formatter(range.mid)} | High: ${formatter(range.high)}`;
}

function formatValue(value) {
    if (value === null || value === undefined || value === "") return "Not available";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) {
        if (!value.length) return "None";
        return value.map(item => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
    }
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
}

function getGameTags(data) {
    if (data.steamspy?.available && Array.isArray(data.steamspy.tags) && data.steamspy.tags.length) {
        return data.steamspy.tags
            .map(t => (typeof t === "object" ? t.description || t.name : t))
            .filter(Boolean);
    }
    if (data.steam_store?.available && Array.isArray(data.steam_store.genres)) {
        return data.steam_store.genres
            .map(g => (typeof g === "object" ? g.description || g.name : g))
            .filter(Boolean);
    }
    return [];
}

function addSafeLink(container, label, url) {
    if (!url) return;
    try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) return;
        const a = createEl("a", "text-teal-700 hover:underline mr-4 text-sm font-medium", label);
        a.href = parsed.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        container.appendChild(a);
    } catch {
        // Ignore invalid URLs
    }
}