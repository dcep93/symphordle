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
        .then(fillMask)
        .then(play)
        .then(finish)
        .catch(removeMask);
}

function play(obj) {
    return Promise.resolve(obj)
        .then(setTargetIndex)
        .then(scrollUntilShowing)
        .then(ensureLoaded)
        .then(postLoaded)
        .catch(removeMask);
}

function getDivs(obj) {
    console.log("getDivs", (Date.now() - obj.start) / 1000);
    return Promise.resolve()
        .then(() =>
            getTracklistDiv().then((tracklistDiv) =>
                Object.assign(obj, { tracklistDiv })
            )
        )
        .then(() => getMask().then((mask) => Object.assign(obj, { mask })))
        .then(() =>
            Object.assign(obj, {
                rows: obj.tracklistDiv.children[1].children[1],
                viewport: document
                    .getElementsByClassName("Root__main-view")[0]
                    .getElementsByClassName("os-viewport")[0],
                main: document.getElementById("main"),
                video: document.getElementsByTagName("video")[0],
                inputE: getMaskElementById(obj.mask, "input"),
            })
        );
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

function removeMask(err) {
    const oldMask = document.getElementById(MASK_ID);
    if (oldMask) oldMask.remove();
    if (err) {
        document.getElementById("main").style.opacity = 1;
        throw err;
    }
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
        )
        .then((obj) =>
            Object.assign(obj, {
                tracks: Object.values(
                    Object.fromEntries(obj.tracks.map((t) => [t.displayName, t]))
                ),
            })
        )
        .then((obj) => obj.viewport.scrollTo({ top: 0 }) || obj);
}

function getTracksHelper(attempts, obj, resolve, reject) {
    if (attempts > GET_TRACKS_MAX_ATTEMPTS) return reject("too many attempts");
    const top = obj.viewport.scrollTop;
    var loading = true;
    var scrolledBack = false;
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
            if (index !== 0 && !obj.tracks[index - 1]) {
                if (!scrolledBack) {
                    obj.viewport.scrollTo({
                        top: top - obj.viewport.offsetHeight / 2,
                    });
                    scrolledBack = true;
                }
                return;
            }
            loading = false;
            if (obj.tracks[index] === undefined) {
                const trackE = child.children[1].children[1];
                const track = {
                    index,
                    scroll: top,
                    img: child.children[1].children[0].src.split("4851").join("b273"),
                    title: trackE.children[0].innerText,
                    artists: Array.from(
                        trackE.children[trackE.children.length - 1].children
                    ).map((artist) => artist.innerText),
                };
                track.normalizedTitle = normalize(track.title);
                track.displayName = `${track.title} - ${track.artists.join(", ")}`;
                obj.tracks[index] = track;
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

function normalize(str) {
    ["'", '"', "."].forEach((r) => {
        str = str.replaceAll(r, "");
    });
    return str.toLowerCase();
}

function setTargetIndex(obj) {
    console.log("setTargetIndex", (Date.now() - obj.start) / 1000);
    if (!location.hash.substring(1))
        location.hash = new Date().toLocaleDateString();
    const link = getMaskElementById(obj.mask, "link");
    link.innerText = location.href;
    link.href = location.href;
    return Promise.resolve(obj).then((obj) =>
        Object.assign(obj, {
            targetIndex: Math.floor(
                obj.tracks.length * random(location.hash + obj.seed)
            ),
        })
    );
}

function md5(inputString) {
    var hc = "0123456789abcdef";

    function rh(n) {
        var j,
            s = "";
        for (j = 0; j <= 3; j++)
            s +=
            hc.charAt((n >> (j * 8 + 4)) & 0x0f) + hc.charAt((n >> (j * 8)) & 0x0f);
        return s;
    }

    function ad(x, y) {
        var l = (x & 0xffff) + (y & 0xffff);
        var m = (x >> 16) + (y >> 16) + (l >> 16);
        return (m << 16) | (l & 0xffff);
    }

    function rl(n, c) {
        return (n << c) | (n >>> (32 - c));
    }

    function cm(q, a, b, x, s, t) {
        return ad(rl(ad(ad(a, q), ad(x, t)), s), b);
    }

    function ff(a, b, c, d, x, s, t) {
        return cm((b & c) | (~b & d), a, b, x, s, t);
    }

    function gg(a, b, c, d, x, s, t) {
        return cm((b & d) | (c & ~d), a, b, x, s, t);
    }

    function hh(a, b, c, d, x, s, t) {
        return cm(b ^ c ^ d, a, b, x, s, t);
    }

    function ii(a, b, c, d, x, s, t) {
        return cm(c ^ (b | ~d), a, b, x, s, t);
    }

    function sb(x) {
        var i;
        var nblk = ((x.length + 8) >> 6) + 1;
        var blks = new Array(nblk * 16);
        for (i = 0; i < nblk * 16; i++) blks[i] = 0;
        for (i = 0; i < x.length; i++)
            blks[i >> 2] |= x.charCodeAt(i) << ((i % 4) * 8);
        blks[i >> 2] |= 0x80 << ((i % 4) * 8);
        blks[nblk * 16 - 2] = x.length * 8;
        return blks;
    }
    var i,
        x = sb(inputString),
        a = 1732584193,
        b = -271733879,
        c = -1732584194,
        d = 271733878,
        olda,
        oldb,
        oldc,
        oldd;
    for (i = 0; i < x.length; i += 16) {
        olda = a;
        oldb = b;
        oldc = c;
        oldd = d;
        a = ff(a, b, c, d, x[i + 0], 7, -680876936);
        d = ff(d, a, b, c, x[i + 1], 12, -389564586);
        c = ff(c, d, a, b, x[i + 2], 17, 606105819);
        b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
        a = ff(a, b, c, d, x[i + 4], 7, -176418897);
        d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
        c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
        b = ff(b, c, d, a, x[i + 7], 22, -45705983);
        a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
        d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
        c = ff(c, d, a, b, x[i + 10], 17, -42063);
        b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
        a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
        d = ff(d, a, b, c, x[i + 13], 12, -40341101);
        c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
        b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
        a = gg(a, b, c, d, x[i + 1], 5, -165796510);
        d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
        c = gg(c, d, a, b, x[i + 11], 14, 643717713);
        b = gg(b, c, d, a, x[i + 0], 20, -373897302);
        a = gg(a, b, c, d, x[i + 5], 5, -701558691);
        d = gg(d, a, b, c, x[i + 10], 9, 38016083);
        c = gg(c, d, a, b, x[i + 15], 14, -660478335);
        b = gg(b, c, d, a, x[i + 4], 20, -405537848);
        a = gg(a, b, c, d, x[i + 9], 5, 568446438);
        d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
        c = gg(c, d, a, b, x[i + 3], 14, -187363961);
        b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
        a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
        d = gg(d, a, b, c, x[i + 2], 9, -51403784);
        c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
        b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
        a = hh(a, b, c, d, x[i + 5], 4, -378558);
        d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
        c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
        b = hh(b, c, d, a, x[i + 14], 23, -35309556);
        a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
        d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
        c = hh(c, d, a, b, x[i + 7], 16, -155497632);
        b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
        a = hh(a, b, c, d, x[i + 13], 4, 681279174);
        d = hh(d, a, b, c, x[i + 0], 11, -358537222);
        c = hh(c, d, a, b, x[i + 3], 16, -722521979);
        b = hh(b, c, d, a, x[i + 6], 23, 76029189);
        a = hh(a, b, c, d, x[i + 9], 4, -640364487);
        d = hh(d, a, b, c, x[i + 12], 11, -421815835);
        c = hh(c, d, a, b, x[i + 15], 16, 530742520);
        b = hh(b, c, d, a, x[i + 2], 23, -995338651);
        a = ii(a, b, c, d, x[i + 0], 6, -198630844);
        d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
        c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
        b = ii(b, c, d, a, x[i + 5], 21, -57434055);
        a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
        d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
        c = ii(c, d, a, b, x[i + 10], 15, -1051523);
        b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
        a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
        d = ii(d, a, b, c, x[i + 15], 10, -30611744);
        c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
        b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
        a = ii(a, b, c, d, x[i + 4], 6, -145523070);
        d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
        c = ii(c, d, a, b, x[i + 2], 15, 718787259);
        b = ii(b, c, d, a, x[i + 9], 21, -343485551);
        a = ad(a, olda);
        b = ad(b, oldb);
        c = ad(c, oldc);
        d = ad(d, oldd);
    }
    return rh(a) + rh(b) + rh(c) + rh(d);
}

function random(str) {
    return parseInt(md5(str).substring(0, 8), 16) / Math.pow(2, 32);
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

function getMaskElementById(mask, id, cb) {
    const e = Array.from(mask.getElementsByTagName("*")).find((e) => e.id === id);
    if (cb) cb(e);
    return e;
}

function getSettings() {
    return { next_delay: 2000, durations: [1000, 2000] }; // todo dcep93
}

function fillMask(obj) {
    console.log("fillMask", (Date.now() - obj.start) / 1000);
    return Promise.resolve()
        .then(() =>
            Object.assign(obj, {
                settings: getSettings(),
            })
        )
        .then(() => {
            getMaskElementById(obj.mask, "next").onclick = () => clickNext(obj);
            const playpause = getMaskElementById(obj.mask, "play_pause");
            const pause = getMaskElementById(obj.mask, "pause");
            pause.onclick = () => {
                playpause.setAttribute("data-nextaction", "play");
                obj.video.pause();
                console.log("played time", obj.video.currentTime);
                obj.video.currentTime = 0;
            };
            const play = getMaskElementById(obj.mask, "play");
            play.onclick = () => {
                obj.video.currentTime = 0;
                playpause.setAttribute("data-nextaction", "pause");
                obj.video.play().then(() => {
                    const duration = obj.settings.durations[obj.guesses];
                    setTimeout(() => {
                        setTimeout(
                            pause.onclick,
                            duration - 3 - obj.video.currentTime * 1000 // offset a bit
                        );
                    }, duration - 200);
                });
            };
            const dropdown = getMaskElementById(obj.mask, "dropdown");
            var inputT;
            obj.inputE.onkeyup = () => {
                const n = normalize(obj.inputE.value);
                if (n === inputT) return;
                inputT = n;
                dropdown.replaceChildren(...getDropdownChildren(inputT, obj));
            };
            obj.mask.onkeyup = (e) => {
                var selected = Array.from(dropdown.children).findIndex(
                    (c) => c.getAttribute("selected") !== null
                );
                if (e.key === "ArrowUp") {
                    selected =
                        selected <= 0 ? dropdown.children.length - 1 : selected - 1;
                } else if (e.key === "ArrowDown") {
                    selected =
                        selected === -1 ? 0 : (selected + 1) % dropdown.children.length;
                } else if (e.key === "Enter") {
                    selected = selected === -1 ? 0 : selected;
                    const s = dropdown.children[selected];
                    if (!s) return submitGuess("(skipped)", false, obj);
                    const index = parseInt(s.getAttribute("index"));
                    clickDropdown(index, obj);
                } else {
                    return;
                }
                const child = dropdown.children[selected];
                if (!child) return;
                child.onmouseenter();
            };
            return obj;
        });
}

function getDropdownChildren(value, obj) {
    var selected = null;
    var allowed = false;
    return obj.tracks
        .filter(
            (track) =>
            track.normalizedTitle === value ||
            (track.normalizedTitle.includes(value) &&
                value.length >= DROPDOWN_MIN_LENGTH)
        )
        .sort((a, b) => (a.normalizedTitle > b.normalizedTitle ? 1 : -1))
        .sort((a, b) => (a.normalizedTitle.startsWith(value) ? -1 : 1))
        .map((track, i) => {
            const div = document.createElement("div");
            div.setAttribute("index", track.index);
            div.innerText = track.displayName;
            div.onclick = () => clickDropdown(track.index, obj);
            div.onmouseenter = (e) => {
                if (e) {
                    if (!allowed) {
                        allowed = true;
                        return;
                    }
                } else {
                    allowed = false;
                }
                if (selected) selected.removeAttribute("selected");
                selected = div;
                div.setAttribute("selected", "true");
            };
            return div;
        });
}

function clickDropdown(index, obj) {
    if (index === obj.targetIndex) {
        obj.inputE.value = "";
        obj.inputE.onkeyup();
        showAnswer(obj);
        return;
    }
    const chosen = obj.tracks[index];
    const desired = obj.tracks[obj.targetIndex];
    const matching = chosen.artists.find((a) => desired.artists.includes(a));
    submitGuess(chosen.displayName, matching !== undefined, obj);
}

function clickNext(obj) {
    clearTimeout(obj.click_next_timeout);
    if (obj.finished) {
        updateHash(obj);
        play(obj);
        return;
    }
    submitGuess("(skipped)", false, obj);
}

function submitGuess(str, isYellow, obj) {
    obj.inputE.value = "";
    obj.inputE.onkeyup();
    const div = document.createElement("div");
    div.innerText = str;
    if (isYellow) div.classList.add("yellow");
    getMaskElementById(obj.mask, "guesses").appendChild(div);
    if (obj.guesses === obj.settings.durations.length - 1) return showAnswer(obj);
    obj.guesses++;
}

function showAnswer(obj) {
    obj.finished = true;
    const next = getMaskElementById(obj.mask, "next");
    next.innerText = "(next song)";
    const next_delay = obj.settings.next_delay;
    if (next_delay) {
        obj.click_next_timeout = setTimeout(() => clickNext(obj), next_delay);
    } else {
        const playpause = getMaskElementById(obj.mask, "play_pause");
        playpause.setAttribute("data-nextaction", "pause");
        obj.video.currentTime = 0;
        obj.video.play();
    }
    const answer = obj.tracks[obj.targetIndex];
    getMaskElementById(
        obj.mask,
        "answer_text",
        (e) => (e.innerText = answer.displayName)
    );
    getMaskElementById(obj.mask, "answer_img", (e) => (e.src = answer.img));
}

function updateHash(obj) {
    const hashParts = location.hash.substring(1).split("-");
    if (hashParts.length == 1) {
        hashParts.push(0);
    }
    if (hashParts.length === 2) {
        if (!isNaN(hashParts[1]++)) {
            if (!isNaN(new Date(hashParts[0]))) {
                location.hash = hashParts.join("-");
                return;
            }
        }
    }
    obj.seed = (obj.seed || 0) + 1;
}

function ensureLoaded(obj) {
    console.log("ensureLoaded", (Date.now() - obj.start) / 1000);
    const prevVolume = obj.video.volume;
    obj.video.volume = 0;
    obj.video.pause();
    obj.button.click();
    return new Promise((resolve, reject) =>
            ensureLoadedHelper(0, obj, resolve, reject)
        )
        .then(() => obj.video.pause())
        .then(() => (obj.video.volume = prevVolume))
        .then(() => console.log(obj.tracks[obj.targetIndex]))
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

function postLoaded(obj) {
    getMaskElementById(obj.mask, "guesses").replaceChildren();
    obj.guesses = 0;
    obj.finished = false;
    setNextText(obj);
    getMaskElementById(obj.mask, "answer_text", (e) => (e.innerText = ""));
    getMaskElementById(obj.mask, "answer_img", (e) => (e.src = ""));
    getMaskElementById(obj.mask, "play").onclick();
    return obj;
}

function setNextText(obj) {
    const next = getMaskElementById(obj.mask, "next");
    next.innerText = "(skip)";
}

function finish(obj) {
    console.log("finish", (Date.now() - obj.start) / 1000);
    obj.main.style.opacity = 1;
    obj.mask.style.zIndex = 0;
    getMaskElementById(obj.mask, "close").onclick = () => obj.mask.remove();
    getMaskElementById(obj.mask, "loading").remove();
}

main();
chrome.runtime.onMessage.addListener(main);