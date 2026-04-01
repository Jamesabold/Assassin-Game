import { useState, useEffect, useRef } from "react";

const SCREENS = { HOME: "home", LOBBY: "lobby", GAME: "game", WIN: "win" };

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignTargets(players) {
  const shuffled = shuffle(players.map(p => p.id));
  const targets = {};
  for (let i = 0; i < shuffled.length; i++) {
    targets[shuffled[i]] = shuffled[(i + 1) % shuffled.length];
  }
  return targets;
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [myName, setMyName] = useState("");
  const [players, setPlayers] = useState([]);
  const [targets, setTargets] = useState({});
  const [alive, setAlive] = useState({});
  const [killFeed, setKillFeed] = useState([]);
  const [myId, setMyId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [pendingKill, setPendingKill] = useState(false);
  const [winner, setWinner] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [gameState, setGameState] = useState("lobby"); // lobby | active
  const killFeedRef = useRef(null);

  useEffect(() => {
    if (killFeedRef.current) {
      killFeedRef.current.scrollTop = killFeedRef.current.scrollHeight;
    }
  }, [killFeed]);

  function createGame() {
    if (!myName.trim()) return;
    const code = generateCode();
    const id = generateCode();
    const me = { id, name: myName.trim() };
    setRoomCode(code);
    setMyId(id);
    setPlayers([me]);
    setIsHost(true);
    setGameState("lobby");
    setScreen(SCREENS.LOBBY);
  }

  function joinGame() {
    if (!myName.trim() || !joinCode.trim()) return;
    const id = generateCode();
    const me = { id, name: myName.trim() };
    setRoomCode(joinCode.toUpperCase());
    setMyId(id);
    setIsHost(false);
    setPlayers(prev => [...prev, me]);
    setGameState("lobby");
    setScreen(SCREENS.LOBBY);
  }

  function addPlayer() {
    if (!nameInput.trim()) return;
    const id = generateCode();
    setPlayers(prev => [...prev, { id, name: nameInput.trim() }]);
    setNameInput("");
  }

  function startGame() {
    if (players.length < 3) return;
    const t = assignTargets(players);
    const a = {};
    players.forEach(p => (a[p.id] = true));
    setTargets(t);
    setAlive(a);
    setKillFeed([]);
    setGameState("active");
    setScreen(SCREENS.GAME);
  }

  function confirmKill(killerId) {
    const victim = targets[killerId];
    if (!victim) return;

    const killerName = players.find(p => p.id === killerId)?.name;
    const victimName = players.find(p => p.id === victim)?.name;
    const victimTarget = targets[victim];

    const newAlive = { ...alive, [victim]: false };
    const newTargets = { ...targets, [killerId]: victimTarget };
    delete newTargets[victim];

    const alivePlayers = Object.entries(newAlive).filter(([, v]) => v);
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setAlive(newAlive);
    setTargets(newTargets);
    setKillFeed(prev => [
      ...prev,
      { killer: killerName, victim: victimName, time, id: Date.now() }
    ]);
    setPendingKill(false);

    if (alivePlayers.length === 1) {
      const winnerId = alivePlayers[0][0];
      const winnerName = players.find(p => p.id === winnerId)?.name;
      setWinner(winnerName);
      setScreen(SCREENS.WIN);
    }
  }

  function resetGame() {
    setScreen(SCREENS.HOME);
    setRoomCode("");
    setJoinCode("");
    setMyName("");
    setPlayers([]);
    setTargets({});
    setAlive({});
    setKillFeed([]);
    setMyId(null);
    setIsHost(false);
    setPendingKill(false);
    setWinner(null);
    setGameState("lobby");
  }

  const myTarget = myId && targets[myId];
  const myTargetName = myTarget && players.find(p => p.id === myTarget)?.name;
  const alivePlayers = players.filter(p => alive[p.id]);
  const killCount = {};
  killFeed.forEach(k => {
    killCount[k.killer] = (killCount[k.killer] || 0) + 1;
  });

  return (
    <div style={styles.root}>
      <style>{cssReset}</style>

      {/* ── HOME ── */}
      {screen === SCREENS.HOME && (
        <div style={styles.centerPane}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>☠</span>
            <h1 style={styles.title}>ASSASSINS</h1>
            <p style={styles.subtitle}>The real-world elimination game</p>
          </div>

          <input
            style={styles.input}
            placeholder="Your name"
            value={myName}
            onChange={e => setMyName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createGame()}
          />

          <button style={styles.btnPrimary} onClick={createGame}>
            Create Game
          </button>

          <div style={styles.divider}><span>or join existing</span></div>

          <input
            style={styles.input}
            placeholder="Room code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={5}
          />
          <button style={styles.btnSecondary} onClick={joinGame}>
            Join Game
          </button>
        </div>
      )}

      {/* ── LOBBY ── */}
      {screen === SCREENS.LOBBY && (
        <div style={styles.pane}>
          <div style={styles.header}>
            <h2 style={styles.roomCode}>ROOM: <span style={styles.codeHighlight}>{roomCode}</span></h2>
            <p style={styles.hint}>Share this code with other players</p>
          </div>

          <div style={styles.playerList}>
            <h3 style={styles.sectionLabel}>Players ({players.length})</h3>
            {players.map(p => (
              <div key={p.id} style={styles.playerRow}>
                <span style={styles.playerDot} />
                <span style={styles.playerName}>{p.name}</span>
                {p.id === myId && <span style={styles.youBadge}>you</span>}
              </div>
            ))}
          </div>

          {isHost && (
            <div style={styles.addSection}>
              <h3 style={styles.sectionLabel}>Add players manually</h3>
              <div style={styles.row}>
                <input
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                  placeholder="Player name"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPlayer()}
                />
                <button style={styles.btnAdd} onClick={addPlayer}>+</button>
              </div>
            </div>
          )}

          <div style={styles.startSection}>
            {players.length < 3 && (
              <p style={styles.warning}>Need at least 3 players to start</p>
            )}
            {isHost && (
              <button
                style={players.length >= 3 ? styles.btnPrimary : styles.btnDisabled}
                onClick={startGame}
                disabled={players.length < 3}
              >
                Start Game ({players.length} players)
              </button>
            )}
            {!isHost && (
              <p style={styles.waiting}>⏳ Waiting for host to start…</p>
            )}
          </div>
        </div>
      )}

      {/* ── GAME ── */}
      {screen === SCREENS.GAME && (
        <div style={styles.pane}>
          {/* Target card */}
          {myId && alive[myId] && (
            <div style={styles.targetCard}>
              <p style={styles.targetLabel}>YOUR TARGET</p>
              <p style={styles.targetName}>{myTargetName}</p>
              <p style={styles.targetHint}>Hand them something to eliminate them</p>

              {!pendingKill ? (
                <button style={styles.btnKill} onClick={() => setPendingKill(true)}>
                  🗡 I got them
                </button>
              ) : (
                <div style={styles.confirmBox}>
                  <p style={styles.confirmText}>Did <strong>{myTargetName}</strong> receive something from you?</p>
                  <div style={styles.row}>
                    <button style={styles.btnConfirm} onClick={() => confirmKill(myId)}>✓ Confirm kill</button>
                    <button style={styles.btnCancel} onClick={() => setPendingKill(false)}>✗ Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {myId && !alive[myId] && (
            <div style={styles.deadCard}>
              <p style={styles.deadIcon}>💀</p>
              <p style={styles.deadText}>You've been eliminated</p>
              <p style={styles.deadHint}>Watch the carnage unfold…</p>
            </div>
          )}

          {/* Leaderboard */}
          <div style={styles.board}>
            <h3 style={styles.sectionLabel}>Alive ({alivePlayers.length})</h3>
            {alivePlayers.map(p => (
              <div key={p.id} style={styles.boardRow}>
                <span style={styles.aliveDot} />
                <span style={styles.playerName}>{p.name}{p.id === myId ? " (you)" : ""}</span>
                {killCount[p.name] > 0 && (
                  <span style={styles.killBadge}>🗡 {killCount[p.name]}</span>
                )}
              </div>
            ))}
            {players.filter(p => !alive[p.id]).map(p => (
              <div key={p.id} style={{ ...styles.boardRow, opacity: 0.35 }}>
                <span style={styles.deadDot} />
                <span style={{ ...styles.playerName, textDecoration: "line-through" }}>{p.name}</span>
                {killCount[p.name] > 0 && (
                  <span style={styles.killBadge}>🗡 {killCount[p.name]}</span>
                )}
              </div>
            ))}
          </div>

          {/* Kill feed */}
          <div style={styles.feedSection}>
            <h3 style={styles.sectionLabel}>Kill Feed</h3>
            <div style={styles.feed} ref={killFeedRef}>
              {killFeed.length === 0 && (
                <p style={styles.feedEmpty}>No eliminations yet…</p>
              )}
              {killFeed.map(k => (
                <div key={k.id} style={styles.feedEntry}>
                  <span style={styles.feedTime}>{k.time}</span>
                  <span>🗡 <strong>{k.killer}</strong> eliminated <strong>{k.victim}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── WIN ── */}
      {screen === SCREENS.WIN && (
        <div style={styles.centerPane}>
          <div style={styles.winCard}>
            <div style={styles.winCrown}>👑</div>
            <h1 style={styles.winTitle}>{winner}</h1>
            <p style={styles.winSub}>is the last one standing</p>

            <div style={styles.finalFeed}>
              <h3 style={{ ...styles.sectionLabel, marginBottom: 8 }}>Final Kill Feed</h3>
              {killFeed.map(k => (
                <div key={k.id} style={styles.feedEntry}>
                  <span style={styles.feedTime}>{k.time}</span>
                  <span>🗡 <strong>{k.killer}</strong> → <strong>{k.victim}</strong></span>
                </div>
              ))}
            </div>

            <button style={styles.btnPrimary} onClick={resetGame}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const colors = {
  bg: "#0a0a0f",
  surface: "#13131a",
  border: "#1e1e2e",
  accent: "#e63946",
  accentDim: "#7a1a20",
  text: "#e8e8f0",
  muted: "#6b6b80",
  green: "#2ecc71",
  yellow: "#f1c40f",
};

const styles = {
  root: {
    minHeight: "100vh",
    background: colors.bg,
    color: colors.text,
    fontFamily: "'Courier New', monospace",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px",
    boxSizing: "border-box",
  },
  centerPane: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    paddingTop: 40,
  },
  pane: {
    width: "100%",
    maxWidth: 480,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    paddingTop: 16,
  },
  logo: {
    textAlign: "center",
    marginBottom: 24,
  },
  logoIcon: {
    fontSize: 56,
    display: "block",
    marginBottom: 8,
    filter: "drop-shadow(0 0 12px #e63946aa)",
  },
  title: {
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: "0.25em",
    color: colors.accent,
    margin: 0,
    textShadow: "0 0 20px #e6394655",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: "0.1em",
    marginTop: 6,
  },
  input: {
    width: "100%",
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.text,
    fontFamily: "'Courier New', monospace",
    fontSize: 15,
    padding: "12px 14px",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 4,
    transition: "border-color 0.2s",
  },
  btnPrimary: {
    width: "100%",
    background: colors.accent,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "13px 0",
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "0.1em",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  btnSecondary: {
    width: "100%",
    background: "transparent",
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "12px 0",
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    letterSpacing: "0.08em",
    cursor: "pointer",
  },
  btnDisabled: {
    width: "100%",
    background: colors.border,
    color: colors.muted,
    border: "none",
    borderRadius: 6,
    padding: "13px 0",
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    cursor: "not-allowed",
    letterSpacing: "0.08em",
  },
  btnAdd: {
    background: colors.accent,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    width: 44,
    fontSize: 20,
    cursor: "pointer",
    marginLeft: 8,
    flexShrink: 0,
  },
  btnKill: {
    marginTop: 14,
    background: colors.accentDim,
    color: colors.accent,
    border: `1px solid ${colors.accent}`,
    borderRadius: 6,
    padding: "11px 24px",
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    letterSpacing: "0.08em",
    transition: "background 0.15s",
  },
  btnConfirm: {
    flex: 1,
    background: colors.accent,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 0",
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  btnCancel: {
    flex: 1,
    background: "transparent",
    color: colors.muted,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "10px 0",
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    cursor: "pointer",
    marginLeft: 8,
  },
  divider: {
    width: "100%",
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    position: "relative",
    padding: "4px 0",
  },
  header: {
    textAlign: "center",
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.border}`,
  },
  roomCode: {
    fontSize: 18,
    letterSpacing: "0.15em",
    margin: 0,
    color: colors.muted,
  },
  codeHighlight: {
    color: colors.accent,
    fontSize: 22,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: "0.2em",
    color: colors.muted,
    textTransform: "uppercase",
    margin: "0 0 10px 0",
  },
  playerList: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "14px 16px",
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    padding: "7px 0",
    borderBottom: `1px solid ${colors.border}`,
    gap: 10,
  },
  playerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: colors.green,
    flexShrink: 0,
  },
  aliveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: colors.green,
    flexShrink: 0,
    boxShadow: `0 0 6px ${colors.green}`,
  },
  deadDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: colors.muted,
    flexShrink: 0,
  },
  playerName: {
    flex: 1,
    fontSize: 14,
  },
  youBadge: {
    fontSize: 10,
    color: colors.accent,
    border: `1px solid ${colors.accentDim}`,
    borderRadius: 3,
    padding: "2px 6px",
    letterSpacing: "0.1em",
  },
  killBadge: {
    fontSize: 11,
    color: colors.accent,
    marginLeft: "auto",
  },
  addSection: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "14px 16px",
  },
  startSection: {
    textAlign: "center",
  },
  warning: {
    color: colors.yellow,
    fontSize: 12,
    marginBottom: 10,
    letterSpacing: "0.05em",
  },
  waiting: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: "0.05em",
  },
  row: {
    display: "flex",
    alignItems: "center",
  },
  targetCard: {
    background: colors.surface,
    border: `1px solid ${colors.accent}`,
    borderRadius: 10,
    padding: "20px 20px 16px",
    textAlign: "center",
    boxShadow: `0 0 24px ${colors.accentDim}55`,
  },
  targetLabel: {
    fontSize: 10,
    letterSpacing: "0.3em",
    color: colors.accent,
    margin: "0 0 8px 0",
    textTransform: "uppercase",
  },
  targetName: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "0.1em",
    margin: "0 0 6px 0",
    color: "#fff",
  },
  targetHint: {
    fontSize: 12,
    color: colors.muted,
    margin: 0,
  },
  confirmBox: {
    marginTop: 14,
    background: "#0f0f18",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: 14,
  },
  confirmText: {
    fontSize: 13,
    marginBottom: 12,
    color: colors.text,
  },
  deadCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: "24px 20px",
    textAlign: "center",
    opacity: 0.7,
  },
  deadIcon: {
    fontSize: 40,
    margin: 0,
  },
  deadText: {
    fontSize: 18,
    fontWeight: 700,
    margin: "8px 0 4px",
    color: colors.muted,
  },
  deadHint: {
    fontSize: 12,
    color: colors.muted,
  },
  board: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "14px 16px",
  },
  boardRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
    borderBottom: `1px solid ${colors.border}`,
  },
  feedSection: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "14px 16px",
  },
  feed: {
    maxHeight: 160,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  feedEmpty: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  feedEntry: {
    fontSize: 13,
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "6px 0",
    borderBottom: `1px solid ${colors.border}`,
  },
  feedTime: {
    color: colors.muted,
    fontSize: 11,
    flexShrink: 0,
    marginTop: 1,
  },
  winCard: {
    width: "100%",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  winCrown: {
    fontSize: 64,
    filter: "drop-shadow(0 0 16px #f1c40f88)",
    marginBottom: 4,
  },
  winTitle: {
    fontSize: 36,
    fontWeight: 900,
    color: colors.yellow,
    letterSpacing: "0.1em",
    margin: 0,
    textShadow: "0 0 24px #f1c40f55",
  },
  winSub: {
    color: colors.muted,
    fontSize: 14,
    letterSpacing: "0.1em",
    marginTop: -4,
  },
  finalFeed: {
    width: "100%",
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "14px 16px",
    maxHeight: 200,
    overflowY: "auto",
    marginBottom: 8,
    textAlign: "left",
  },
};

const cssReset = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; }
  input:focus { border-color: #e63946 !important; }
  button:hover:not(:disabled) { opacity: 0.85; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 4px; }
`;
