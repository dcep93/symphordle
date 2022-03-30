(() => {
    if (document.hasOwnProperty("title")) return;
    const title = document.title;
    Object.defineProperty(document, "title", {
        get: () => title,
        set: () => undefined,
    });
})();