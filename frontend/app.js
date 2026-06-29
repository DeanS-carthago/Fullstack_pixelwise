// frontend/app.js
const API_KEY = "REPLACE_ME";  // overwritten on deploy

const N = 28;       // the model's input grid
const SCALE = 10;   // on-screen pixels per grid cell (280 / 28)

const pad = document.getElementById("pad");
const view = pad.getContext("2d");
view.imageSmoothingEnabled = false;  // draw crisp blocks

// The real drawing happens on a hidden 28x28 grid. The
// visible canvas is that grid magnified ten times, so
// the user paints at the model's own resolution.
const grid = document.createElement("canvas");
grid.width = N; grid.height = N;
const gctx = grid.getContext("2d");
gctx.lineWidth = 2.5;
gctx.lineCap = "round"; gctx.lineJoin = "round";

let drawing = false;

function render() {
    // Magnify the grid onto the canvas, smoothing off.
    view.drawImage(grid, 0, 0, pad.width, pad.height);
}

function clearPad() {
    gctx.fillStyle = "#fff";
    gctx.fillRect(0, 0, N, N);
    render();
}
clearPad();

// Mouse positions map onto the 28x28 grid via SCALE.
pad.onmousedown = e => {
    drawing = true; gctx.beginPath();
    gctx.moveTo(e.offsetX / SCALE, e.offsetY / SCALE);
};
pad.onmousemove = e => {
    if (!drawing) return;
    gctx.lineTo(e.offsetX / SCALE, e.offsetY / SCALE);
    gctx.stroke(); render();
};
pad.onmouseup = pad.onmouseleave = () => { drawing = false; };

function getPixels() {
    // The grid is already 28x28: read it and invert.
    const data = gctx.getImageData(0, 0, N, N).data;
    const pixels = [];
    for (let y = 0; y < N; y++) {
        const row = [];
        for (let x = 0; x < N; x++)
            row.push(255 - data[(y * N + x) * 4]);
        pixels.push(row);
    }
    return pixels;
}

// --- Auth: switch between API key (static) and Bearer token (JWT, expires) ---

const TOKEN_LIFETIME_SEC = 15 * 60;  // matches backend JWT_EXPIRE_MINUTES

let authMode = "apikey";     // "apikey" | "bearer"
let bearerToken = null;      // holds the JWT once logged in
let tokenExpiresAt = null;   // Date.now() + lifetime, for the countdown
let countdownInterval = null;

const authSwitch = document.getElementById("auth-switch");
const loginModal = document.getElementById("login-modal");
const loginError = document.getElementById("login-error");
const authStatus = document.getElementById("auth-status");
const authStatusText = document.getElementById("auth-status-text");

function showModal() {
    loginError.textContent = "";
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    loginModal.hidden = false;
    authSwitch.disabled = true;
}
function hideModal() {
    loginModal.hidden = true;
    authSwitch.disabled = false;
}

function setMode(mode) {
    authMode = mode;
    authSwitch.dataset.mode = mode;
    authSwitch.setAttribute("aria-pressed", mode === "bearer");
}

function logout() {
    bearerToken = null;
    tokenExpiresAt = null;
    clearInterval(countdownInterval);
    authStatus.hidden = true;
}

function startCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        const remaining = Math.max(0, Math.round((tokenExpiresAt - Date.now()) / 1000));
        if (remaining <= 0) {
            logout();
            setMode("apikey");   // token expired: fall back to API key mode
            return;
        }
        const m = Math.floor(remaining / 60);
        const s = String(remaining % 60).padStart(2, "0");
        authStatusText.textContent = `Logged in · ${m}:${s}`;
    }, 1000);
}

authSwitch.onclick = () => {
    if (authMode === "apikey") {
        // Move the pill right away so the click feels responsive...
        setMode("bearer");
        // ...then ask for credentials if we don't already have a valid token.
        if (!bearerToken) {
            showModal();
        }
    } else {
        // Switching back to API key: discard the session entirely, as requested.
        logout();
        setMode("apikey");
    }
};

document.getElementById("login-cancel").onclick = () => {
    hideModal();
    // Login was not completed: snap the pill back to API key.
    setMode("apikey");
};

document.getElementById("login-submit").onclick = async () => {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    // /token expects classic form-encoded data, not JSON.
    const body = new URLSearchParams({ username, password });

    const r = await fetch("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    if (!r.ok) {
        loginError.textContent = "Incorrect username or password";
        return;
    }
    const d = await r.json();
    bearerToken = d.access_token;
    tokenExpiresAt = Date.now() + TOKEN_LIFETIME_SEC * 1000;

    hideModal();
    setMode("bearer");
    authStatus.hidden = false;
    startCountdown();
};

async function classify() {
    const out = document.getElementById("result");

    let url, headers;
    if (authMode === "bearer") {
        if (!bearerToken) {
            out.textContent = "Please log in first";
            return;
        }
        url = "/api/classify-bearer";
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + bearerToken
        };
    } else {
        url = "/api/classify";
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY
        };
    }

    const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ pixels: getPixels() })
    });

    if (!r.ok) {
        if (r.status === 401 && authMode === "bearer") {
            // Token expired or got rejected server-side: drop back to API key mode.
            logout();
            setMode("apikey");
            out.textContent = "Session expired, switched back to API Key";
            return;
        }
        out.textContent = "Error " + r.status;
        return;
    }
    const d = await r.json();
    out.textContent = `Prediction: ${d.prediction} ` +
        `(${(d.confidence * 100).toFixed(1)}%)`;
    refresh();
}

async function refresh() {
    const r = await fetch("/api/results");
    if (!r.ok) return;
    const ul = document.getElementById("history");
    ul.innerHTML = "";
    for (const row of (await r.json()).results) {
        const li = document.createElement("li");
        li.textContent = `${row.prediction}  ` +
            `${row.confidence.toFixed(2)}  ${row.created_at}`;
        ul.appendChild(li);
    }
}

document.getElementById("classify").onclick = classify;
document.getElementById("clear").onclick = () => {
    clearPad();
    document.getElementById("result").textContent = "";
};
refresh();
