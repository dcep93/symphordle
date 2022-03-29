function log(arg) {
    console.log(arg);
    return arg;
}

var MASK_ID = "symphordle_mask";
var DROPDOWN_MIN_LENGTH = 3;
var GET_TRACKS_MAX_ATTEMPTS = 200;
var GET_TRACKS_WAIT_FOR_VISIBILITY_TIMEOUT = 10;
var GET_TRACKS_SCROLL_TIMEOUT = 10;
var SCROLL_UNTIL_SHOWING_MAX_ATTEMPTS = 10;
var ENSURE_LOADED_MAX_ATTEMPTS = 1000;
var ENSURE_LOADED_WAIT_FOR_LOADED_TIMEOUT = 10;

function main() {
    Promise.resolve({ start: Date.now() })
        .then(getDivs)
        .then(getTracks)
        .then(prepareMask)
        .then(finish)
        .catch((err) => {
            removeMask();
            throw err;
        });
}

function getDivs(obj) {
    console.log("getDivs", (Date.now() - obj.start) / 1000);
    return Promise.resolve(obj)
        .then((obj) =>
            getTracklistDiv().then((tracklistDiv) => ({...obj, tracklistDiv }))
        )
        .then((obj) => getMask().then((mask) => ({...obj, mask })))
        .then((obj) => ({
            ...obj,
            rows: obj.tracklistDiv.children[1].children[1],
            viewport: document
                .getElementsByClassName("Root__main-view")[0]
                .getElementsByClassName("os-viewport")[0],
            main: document.getElementById("main"),
            video: document.getElementsByTagName("video")[0],
        }));
}

function getTracklistDiv() {
    return Promise.resolve()
        .then(() => document.getElementsByTagName("div"))
        .then(Array.from)
        .then((divs) =>
            divs.find(
                (div) => div.getAttribute("data-testid") === "playlist-tracklist"
            )
        );
}

function removeMask() {
    const oldMask = document.getElementById(MASK_ID);
    if (oldMask) oldMask.remove();
}

function getMask() {
    removeMask();
    const mask = document.createElement("div");
    mask.id = MASK_ID;
    document.body.appendChild(mask);
    return fetch(chrome.runtime.getURL("mask.html"))
        .then((response) => response.text())
        .then((text) => (mask.innerHTML = text))
        .then(() => mask);
}

function getTracks(obj) {
    console.log("getTracks", (Date.now() - obj.start) / 1000);
    obj.main.style.opacity = 0;
    obj.rowCount = parseInt(obj.tracklistDiv.getAttribute("aria-rowcount")) - 1;
    const spacing = obj.viewport.getElementsByClassName("contentSpacing")[0];
    obj.viewport.scrollTo({ top: spacing.offsetHeight });
    return new Promise((resolve, reject) =>
        getTracksHelper(-5, obj, resolve, reject)
    ).then((obj) => obj.viewport.scrollTo({ top: 0 }) || obj);
}

function getTracksHelper(attempts, obj, resolve, reject) {
    if (attempts > GET_TRACKS_MAX_ATTEMPTS) return reject("too many attempts");
    const top = obj.viewport.scrollTop;
    var loading = true;
    Array.from(obj.rows.children)
        .map((child) => child.children[0])
        .forEach((child) => {
            const indexDiv = child.children[0];
            if (!indexDiv) return;
            const index = parseInt(indexDiv.innerText) - 1;
            if (obj.tracks === undefined) {
                if (index !== 0) return;
                obj.tracks = [];
            }
            loading = false;
            if (obj.tracks[index] === undefined) {
                const track = child.children[1].children[1];
                obj.tracks.push({
                    index,
                    scroll: top,
                    img: child.children[1].children[0].src,
                    title: track.children[0].innerText,
                    artists: Array.from(
                        track.children[track.children.length - 1].children
                    ).map((artist) => artist.innerText),
                });
            }
        });
    if (loading)
        return setTimeout(
            () => getTracksHelper(++attempts, obj, resolve, reject),
            GET_TRACKS_WAIT_FOR_VISIBILITY_TIMEOUT
        );
    if (obj.tracks.length === obj.rowCount) return resolve(obj);
    obj.viewport.scrollTo({
        top: top + obj.viewport.offsetHeight,
    });
    if (obj.viewport.scrollTop === top)
        return reject(
            ["scroll reached end", obj.tracks.length, obj.rowCount].join(" ")
        );
    return setTimeout(
        () => getTracksHelper(0, obj, resolve, reject),
        GET_TRACKS_SCROLL_TIMEOUT
    );
}

function prepareMask(obj) {
    console.log("prepareMask", (Date.now() - obj.start) / 1000);
    return Promise.resolve(obj)
        .then((obj) => ({
            ...obj,
            targetIndex: Math.floor(obj.tracks.length * Math.random()),
        }))
        .then(scrollUntilShowing)
        .then(ensureLoaded)
        .then(fillMask);
}

function scrollUntilShowing(obj) {
    console.log("scrollUntilShowing", (Date.now() - obj.start) / 1000);
    obj.viewport.scrollTo({ top: obj.tracks[obj.targetIndex].scroll });
    return new Promise((resolve, reject) =>
        scrollUntilShowingHelper(0, obj, resolve, reject)
    );
}

function scrollUntilShowingHelper(attempts, obj, resolve, reject) {
    if (attempts > SCROLL_UNTIL_SHOWING_MAX_ATTEMPTS)
        return reject("too many attempts");
    const track = Array.from(obj.rows.children)
        .map((child) => child.children[0])
        .find((child) => {
            const index = parseInt(child.children[0].innerText) - 1;
            return index === obj.targetIndex;
        });
    if (track === undefined)
        return setTimeout(() =>
            scrollUntilShowingHelper(++attempts, obj, resolve, reject)
        );
    obj.button = track.children[0].children[0].children[1];
    resolve(obj);
}

function getMaskElementById(mask, id) {
    return Array.from(mask.getElementsByTagName("*")).find((e) => e.id === id);
}

function fillMask(obj) {
    console.log("fillMask", (Date.now() - obj.start) / 1000);
    return Promise.resolve(obj)
        .then((obj) => ({...obj, duration: 1000 }))
        .then((obj) => {
            const playpause = getMaskElementById(obj.mask, "play_pause");
            const pause = getMaskElementById(obj.mask, "pause");
            pause.onclick = () => {
                playpause.setAttribute("data-nextaction", "play");
                obj.video.pause();
                console.log(obj.video.currentTime);
            };
            getMaskElementById(obj.mask, "play").onclick = () => {
                obj.video.currentTime = 0;
                playpause.setAttribute("data-nextaction", "pause");
                obj.video
                    .play()
                    .then(() => setTimeout(pause.onclick, obj.duration + 50));
            };
            const inputE = getMaskElementById(obj.mask, "input");
            inputE.onkeyup = () => {
                getMaskElementById(obj.mask, "dropdown").replaceChildren(
                    ...getDropdownChildren(inputE.value.toLowerCase(), obj)
                );
            };
            return obj;
        });
}

function getDropdownChildren(value, obj) {
    return obj.tracks
        .map((track) => ({...track, lowerTitle: track.title.toLowerCase() }))
        .filter(
            (track) =>
            track.lowerTitle === value ||
            (track.lowerTitle.includes(value) &&
                value.length >= DROPDOWN_MIN_LENGTH)
        )
        .sort((a, b) => (a.lowerTitle > b.lowerTitle ? 1 : -1))
        .sort((a, b) => (a.lowerTitle.startsWith(value) ? -1 : 1))
        .map((track) => {
            const div = document.createElement("div");
            div.innerText = `${track.title} - ${track.artists.join(", ")}`;
            div.onclick = () => clickDropdown(track.index, obj);
            return div;
        });
}

function clickDropdown(index, obj) {
    console.log(index);
}

function ensureLoaded(obj) {
    console.log("ensureLoaded", (Date.now() - obj.start) / 1000);
    obj.video.volume = 0;
    obj.video.pause();
    obj.button.click();
    return new Promise((resolve, reject) =>
            ensureLoadedHelper(0, obj, resolve, reject)
        )
        .then(() => obj.video.pause())
        .then(() => (obj.video.volume = 1))
        .then(() => obj);
}

function ensureLoadedHelper(attempts, obj, resolve, reject) {
    if (!obj.video.paused) return resolve(obj);
    if (attempts > ENSURE_LOADED_MAX_ATTEMPTS) return reject("too many attempts");
    return setTimeout(
        () => ensureLoadedHelper(++attempts, obj, resolve, reject),
        ENSURE_LOADED_WAIT_FOR_LOADED_TIMEOUT
    );
}

function finish(obj) {
    console.log("finish", (Date.now() - obj.start) / 1000);
    obj.main.style.opacity = 1;
    obj.mask.style.zIndex = 0;
    getMaskElementById(obj.mask, "close").onclick = () => obj.mask.remove();
    getMaskElementById(obj.mask, "loading").remove();
    console.log(obj.tracks[obj.targetIndex]);
}

main();
chrome.runtime.onMessage.addListener(main);