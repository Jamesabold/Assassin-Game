import { useState, useEffect, useRef } from “react”;
import { initializeApp } from “firebase/app”;
import { getDatabase, ref, set, get, update, onValue, off } from “firebase/database”;

const FBCONFIG = {
apiKey: “AIzaSyBciI188nf7RgjPOSG8tp_qLjgnkrhcrx4”,
authDomain: “assassin-game-85ee6.firebaseapp.com”,
databaseURL: “https://assassin-game-85ee6-default-rtdb.europe-west1.firebasedatabase.app”,
projectId: “assassin-game-85ee6”,
storageBucket: “assassin-game-85ee6.firebasestorage.app”,
messagingSenderId: “556153642696”,
appId: “1:556153642696:web:00fc6b929b204ca4c80ffd”
};

const firebaseApp = initializeApp(FBCONFIG);
const db = getDatabase(firebaseApp);

const HOME = “home”;
const LOBBY = “lobby”;
const GAME = “game”;
const WIN = “win”;

const EMPTY = “”;

function generateCode(len) {
var l = len || 5;
return Math.random().toString(36).substring(2, 2 + l).toUpperCase();
}

function shuffle(arr) {
var a = arr.slice();
for (var i = a.length - 1; i > 0; i–) {
var j = Math.floor(Math.random() * (i + 1));
var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
}
return a;
}

function assignTargets(players) {
var ids = shuffle(players.map(function(p) { return p.id; }));
var targets = {};
for (var i = 0; i < ids.length; i++) {
targets[ids[i]] = ids[(i + 1) % ids.length];
}
return targets;
}

export default function App() {
var sc = useState(HOME);
var screen = sc[0]; var setScreen = sc[1];
var rc = useState(EMPTY);
var roomCode = rc[0]; var setRoomCode = rc[1];
var jc = useState(EMPTY);
var joinCode = jc[0]; var setJoinCode = jc[1];
var mn = useState(EMPTY);
var myName = mn[0]; var setMyName = mn[1];
var mi = useState(null);
var myId = mi[0]; var setMyId = mi[1];
var ih = useState(false);
var isHost = ih[0]; var setIsHost = ih[1];
var gd = useState(null);
var gameData = gd[0]; var setGameData = gd[1];
var pk = useState(false);
var pendingKill = pk[0]; var setPendingKill = pk[1];
var er = useState(EMPTY);
var error = er[0]; var setError = er[1];
var ld = useState(false);
var loading = ld[0]; var setLoading = ld[1];
var killFeedRef = useRef(null);
var screenRef = useRef(screen);

useEffect(function() { screenRef.current = screen; }, [screen]);

useEffect(function() {
if (!roomCode) return;
var gameRef = ref(db, “games/” + roomCode);
var unsub = onValue(gameRef, function(snap) {
var data = snap.val();
if (!data) return;
setGameData(data);
if (data.status === “active” && screenRef.current === LOBBY) setScreen(GAME);
if (data.status === “won” && screenRef.current !== WIN) setScreen(WIN);
});
return function() { off(gameRef); };
}, [roomCode]);

useEffect(function() {
if (killFeedRef.current) killFeedRef.current.scrollTop = killFeedRef.current.scrollHeight;
}, [gameData && gameData.killFeed]);

async function createGame() {
if (!myName.trim()) return;
setLoading(true); setError(EMPTY);
var code = generateCode(5);
var id = generateCode(8);
var player = { id: id, name: myName.trim() };
var players = {}; players[id] = player;
await set(ref(db, “games/” + code), {
status: “lobby”, hostId: id, players: players,
targets: {}, alive: {}, killFeed: {}
});
setRoomCode(code); setMyId(id); setIsHost(true); setScreen(LOBBY); setLoading(false);
}

async function joinGame() {
if (!myName.trim() || !joinCode.trim()) return;
setLoading(true); setError(EMPTY);
var code = joinCode.toUpperCase();
var snap = await get(ref(db, “games/” + code));
if (!snap.exists()) { setError(“Room not found. Check the code.”); setLoading(false); return; }
var data = snap.val();
if (data.status !== “lobby”) { setError(“That game already started.”); setLoading(false); return; }
var id = generateCode(8);
var player = { id: id, name: myName.trim() };
var playerUpdate = {}; playerUpdate[id] = player;
await update(ref(db, “games/” + code + “/players”), playerUpdate);
setRoomCode(code); setMyId(id); setIsHost(false); setScreen(LOBBY); setLoading(false);
}

async function startGame() {
var players = Object.values(gameData.players);
if (players.length < 3) return;
var targets = assignTargets(players);
var alive = {};
players.forEach(function(p) { alive[p.id] = true; });
await update(ref(db, “games/” + roomCode), { status: “active”, targets: targets, alive: alive });
}

async function confirmKill() {
var targets = gameData.targets;
var alive = gameData.alive;
var players = gameData.players;
var victimId = targets[myId];
if (!victimId) return;
var killerName = players[myId] && players[myId].name;
var victimName = players[victimId] && players[victimId].name;
var victimTarget = targets[victimId];
var newAlive = Object.assign({}, alive); newAlive[victimId] = false;
var newTargets = Object.assign({}, targets); newTargets[myId] = victimTarget; delete newTargets[victimId];
var alivePlayers = Object.entries(newAlive).filter(function(e) { return e[1]; });
var time = new Date().toLocaleTimeString([], { hour: “2-digit”, minute: “2-digit” });
var killKey = generateCode(8);
var updates = {};
updates[“games/” + roomCode + “/alive”] = newAlive;
updates[“games/” + roomCode + “/targets”] = newTargets;
updates[“games/” + roomCode + “/killFeed/” + killKey] = { killer: killerName, victim: victimName, time: time };
if (alivePlayers.length === 1) {
updates[“games/” + roomCode + “/status”] = “won”;
updates[“games/” + roomCode + “/winner”] = players[alivePlayers[0][0]] && players[alivePlayers[0][0]].name;
}
await update(ref(db), updates);
setPendingKill(false);
}

function resetGame() {
setScreen(HOME); setRoomCode(EMPTY); setJoinCode(EMPTY); setMyName(EMPTY);
setMyId(null); setIsHost(false); setGameData(null); setPendingKill(false); setError(EMPTY);
}

var players = gameData && gameData.players ? Object.values(gameData.players) : [];
var alive = (gameData && gameData.alive) || {};
var targets = (gameData && gameData.targets) || {};
var killFeed = gameData && gameData.killFeed ? Object.values(gameData.killFeed) : [];
var alivePlayers = players.filter(function(p) { return alive[p.id]; });
var myTargetId = targets[myId];
var myTargetName = myTargetId && gameData && gameData.players && gameData.players[myTargetId] && gameData.players[myTargetId].name;
var killCount = {};
killFeed.forEach(function(k) { killCount[k.killer] = (killCount[k.killer] || 0) + 1; });

var C = { bg: “#0a0a0f”, sur: “#13131a”, brd: “#1e1e2e”, acc: “#e63946”, adm: “#7a1a20”, txt: “#e8e8f0”, mut: “#6b6b80”, grn: “#2ecc71”, yel: “#f1c40f” };
var F = “‘Courier New’, monospace”;

return (
<div style={{ minHeight: “100vh”, background: C.bg, color: C.txt, fontFamily: F, display: “flex”, flexDirection: “column”, alignItems: “center”, padding: “16px”, boxSizing: “border-box” }}>

```
  {screen === HOME && (
    <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 40 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span style={{ fontSize: 56, display: "block", marginBottom: 8, filter: "drop-shadow(0 0 12px #e63946aa)" }}>☠</span>
        <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "0.25em", color: C.acc, margin: 0 }}>ASSASSINS</h1>
        <p style={{ color: C.mut, fontSize: 13, marginTop: 6 }}>The real-world elimination game</p>
      </div>
      <input style={{ width: "100%", background: C.sur, border: "1px solid " + C.brd, borderRadius: 6, color: C.txt, fontFamily: F, fontSize: 15, padding: "12px 14px", outline: "none", boxSizing: "border-box" }} placeholder="Your name" value={myName} onChange={function(e) { setMyName(e.target.value); }} />
      <button style={{ width: "100%", background: C.acc, color: "#fff", border: "none", borderRadius: 6, padding: "13px 0", fontFamily: F, fontWeight: 700, fontSize: 14, cursor: "pointer" }} onClick={createGame}>{loading ? "Creating..." : "Create Game"}</button>
      <p style={{ color: C.mut, fontSize: 12 }}>— or join existing —</p>
      <input style={{ width: "100%", background: C.sur, border: "1px solid " + C.brd, borderRadius: 6, color: C.txt, fontFamily: F, fontSize: 15, padding: "12px 14px", outline: "none", boxSizing: "border-box" }} placeholder="Room code" value={joinCode} onChange={function(e) { setJoinCode(e.target.value.toUpperCase()); }} maxLength={5} />
      {error ? <p style={{ color: C.acc, fontSize: 12 }}>{error}</p> : null}
      <button style={{ width: "100%", background: "transparent", color: C.txt, border: "1px solid " + C.brd, borderRadius: 6, padding: "12px 0", fontFamily: F, fontSize: 14, cursor: "pointer" }} onClick={joinGame}>{loading ? "Joining..." : "Join Game"}</button>
    </div>
  )}

  {screen === LOBBY && (
    <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
      <div style={{ textAlign: "center", paddingBottom: 8, borderBottom: "1px solid " + C.brd }}>
        <h2 style={{ fontSize: 18, letterSpacing: "0.15em", margin: 0, color: C.mut }}>ROOM: <span style={{ color: C.acc, fontSize: 22 }}>{roomCode}</span></h2>
        <p style={{ color: C.mut, fontSize: 12, marginTop: 4 }}>Share this code with other players</p>
      </div>
      <div style={{ background: C.sur, border: "1px solid " + C.brd, borderRadius: 8, padding: "14px 16px" }}>
        <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: C.mut, textTransform: "uppercase", margin: "0 0 10px 0" }}>Players ({players.length})</h3>
        {players.map(function(p) {
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: "1px solid " + C.brd, gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.grn, flexShrink: 0, display: "inline-block" }} />
              <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
              {p.id === myId && <span style={{ fontSize: 10, color: C.acc, border: "1px solid " + C.adm, borderRadius: 3, padding: "2px 6px" }}>you</span>}
              {p.id === (gameData && gameData.hostId) && <span style={{ fontSize: 10, color: C.yel, border: "1px solid " + C.yel + "44", borderRadius: 3, padding: "2px 6px" }}>host</span>}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center" }}>
        {players.length < 3 && <p style={{ color: C.yel, fontSize: 12, marginBottom: 10 }}>Need at least 3 players to start</p>}
        {isHost ? (
          <button style={{ width: "100%", background: players.length >= 3 ? C.acc : C.brd, color: players.length >= 3 ? "#fff" : C.mut, border: "none", borderRadius: 6, padding: "13px 0", fontFamily: F, fontWeight: 700, fontSize: 14, cursor: players.length >= 3 ? "pointer" : "not-allowed" }} onClick={startGame} disabled={players.length < 3}>Start Game ({players.length} players)</button>
        ) : (
          <p style={{ color: C.mut, fontSize: 13 }}>Waiting for host to start...</p>
        )}
      </div>
    </div>
  )}

  {screen === GAME && (
    <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
      {myId && alive[myId] && (
        <div style={{ background: C.sur, border: "1px solid " + C.acc, borderRadius: 10, padding: "20px 20px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 10, letterSpacing: "0.3em", color: C.acc, margin: "0 0 8px 0", textTransform: "uppercase" }}>YOUR TARGET</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 6px 0", color: "#fff" }}>{myTargetName}</p>
          <p style={{ fontSize: 12, color: C.mut, margin: 0 }}>Hand them something to eliminate them</p>
          {!pendingKill ? (
            <button style={{ marginTop: 14, background: C.adm, color: C.acc, border: "1px solid " + C.acc, borderRadius: 6, padding: "11px 24px", fontFamily: F, fontWeight: 700, fontSize: 14, cursor: "pointer" }} onClick={function() { setPendingKill(true); }}>I got them</button>
          ) : (
            <div style={{ marginTop: 14, background: "#0f0f18", border: "1px solid " + C.brd, borderRadius: 6, padding: 14 }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>Did <strong>{myTargetName}</strong> receive something from you?</p>
              <div style={{ display: "flex" }}>
                <button style={{ flex: 1, background: C.acc, color: "#fff", border: "none", borderRadius: 6, padding: "10px 0", fontFamily: F, fontWeight: 700, fontSize: 13, cursor: "pointer" }} onClick={confirmKill}>Confirm kill</button>
                <button style={{ flex: 1, background: "transparent", color: C.mut, border: "1px solid " + C.brd, borderRadius: 6, padding: "10px 0", fontFamily: F, fontSize: 13, cursor: "pointer", marginLeft: 8 }} onClick={function() { setPendingKill(false); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {myId && alive[myId] === false && (
        <div style={{ background: C.sur, border: "1px solid " + C.brd, borderRadius: 10, padding: "24px 20px", textAlign: "center", opacity: 0.7 }}>
          <p style={{ fontSize: 40, margin: 0 }}>💀</p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 4px", color: C.mut }}>You have been eliminated</p>
          <p style={{ fontSize: 12, color: C.mut }}>Watch the carnage unfold...</p>
        </div>
      )}
      <div style={{ background: C.sur, border: "1px solid " + C.brd, borderRadius: 8, padding: "14px 16px" }}>
        <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: C.mut, textTransform: "uppercase", margin: "0 0 10px 0" }}>Alive ({alivePlayers.length})</h3>
        {players.map(function(p) {
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid " + C.brd, opacity: alive[p.id] ? 1 : 0.35 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: alive[p.id] ? C.grn : C.mut, flexShrink: 0, display: "inline-block" }} />
              <span style={{ flex: 1, fontSize: 14, textDecoration: alive[p.id] ? "none" : "line-through" }}>{p.name}{p.id === myId ? " (you)" : ""}</span>
              {killCount[p.name] > 0 && <span style={{ fontSize: 11, color: C.acc }}>x{killCount[p.name]}</span>}
            </div>
          );
        })}
      </div>
      <div style={{ background: C.sur, border: "1px solid " + C.brd, borderRadius: 8, padding: "14px 16px" }}>
        <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: C.mut, textTransform: "uppercase", margin: "0 0 10px 0" }}>Kill Feed</h3>
        <div style={{ maxHeight: 160, overflowY: "auto" }} ref={killFeedRef}>
          {killFeed.length === 0 && <p style={{ color: C.mut, fontSize: 12, textAlign: "center" }}>No eliminations yet...</p>}
          {killFeed.map(function(k, i) {
            return (
              <div key={i} style={{ fontSize: 13, display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid " + C.brd }}>
                <span style={{ color: C.mut, fontSize: 11 }}>{k.time}</span>
                <span><strong>{k.killer}</strong> eliminated <strong>{k.victim}</strong></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  )}

  {screen === WIN && (
    <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 40, textAlign: "center" }}>
      <div style={{ fontSize: 64 }}>👑</div>
      <h1 style={{ fontSize: 36, fontWeight: 900, color: C.yel, margin: 0 }}>{gameData && gameData.winner}</h1>
      <p style={{ color: C.mut, fontSize: 14 }}>is the last one standing</p>
      <div style={{ width: "100%", background: C.sur, border: "1px solid " + C.brd, borderRadius: 8, padding: "14px 16px", maxHeight: 200, overflowY: "auto", textAlign: "left" }}>
        {killFeed.map(function(k, i) {
          return (
            <div key={i} style={{ fontSize: 13, display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid " + C.brd }}>
              <span style={{ color: C.mut, fontSize: 11 }}>{k.time}</span>
              <span><strong>{k.killer}</strong> eliminated <strong>{k.victim}</strong></span>
            </div>
          );
        })}
      </div>
      <button style={{ width: "100%", background: C.acc, color: "#fff", border: "none", borderRadius: 6, padding: "13px 0", fontFamily: F, fontWeight: 700, fontSize: 14, cursor: "pointer" }} onClick={resetGame}>Play Again</button>
    </div>
  )}
</div>
```

);
}
