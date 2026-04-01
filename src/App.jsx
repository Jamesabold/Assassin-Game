import { useEffect, useMemo, useRef, useState } from 'react';
import {
  get,
  off,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { database, hasFirebaseConfig } from './firebase';

const SCREENS = { HOME: 'home', LOBBY: 'lobby', GAME: 'game', WIN: 'win' };
const STORAGE_KEY = 'assassins-session-v1';

function makeCode(length = 5) {
  return Math.random().toString(36).replace(/[^a-z0-9]+/gi, '').slice(0, length).toUpperCase();
}

function makeId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function assignTargets(playerIds) {
  const order = shuffle(playerIds);
  const map = {};
  for (let i = 0; i < order.length; i += 1) {
    map[order[i]] = order[(i + 1) % order.length];
  }
  return map;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function sortPlayers(playersMap) {
  return Object.values(playersMap || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

function sortKillFeed(killFeedMap) {
  return Object.values(killFeedMap || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [myName, setMyName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [myId, setMyId] = useState(null);
  const [pendingKill, setPendingKill] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const killFeedRef = useRef(null);
  const listenerRef = useRef(null);

  const players = useMemo(() => sortPlayers(room?.players), [room]);
  const killFeed = useMemo(() => sortKillFeed(room?.killFeed), [room]);
  const alivePlayers = useMemo(() => players.filter((player) => player.alive), [players]);
  const me = myId ? room?.players?.[myId] : null;
  const myTarget = me?.targetId ? room?.players?.[me.targetId] : null;
  const isHost = Boolean(room && myId && room.hostId === myId);
  const winner = room?.winnerId ? room?.players?.[room.winnerId] : null;

  useEffect(() => {
    if (killFeedRef.current) {
      killFeedRef.current.scrollTop = killFeedRef.current.scrollHeight;
    }
  }, [killFeed]);

  useEffect(() => {
    const session = loadSession();
    if (session?.roomCode && session?.playerId) {
      setMyId(session.playerId);
      setRoomCode(session.roomCode);
      subscribeToRoom(session.roomCode, session.playerId);
    }
    return () => {
      if (listenerRef.current) {
        off(listenerRef.current);
      }
    };
  }, []);

  function subscribeToRoom(code, playerId) {
    if (!hasFirebaseConfig || !database) return;
    if (listenerRef.current) {
      off(listenerRef.current);
    }

    const roomRef = ref(database, `rooms/${code}`);
    listenerRef.current = roomRef;

    onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setError('That game no longer exists.');
        setRoom(null);
        setScreen(SCREENS.HOME);
        clearSession();
        return;
      }

      const stillInRoom = !playerId || data.players?.[playerId];
      if (!stillInRoom) {
        setError('You are no longer part of this room.');
        setRoom(null);
        setScreen(SCREENS.HOME);
        clearSession();
        return;
      }

      setRoom(data);
      setRoomCode(code);
      setMyId(playerId);

      if (data.status === 'active') {
        setScreen(SCREENS.GAME);
      } else if (data.status === 'finished') {
        setScreen(SCREENS.WIN);
      } else {
        setScreen(SCREENS.LOBBY);
      }
    });
  }

  async function createGame() {
    if (!hasFirebaseConfig || !database) return;
    const trimmedName = myName.trim();
    if (!trimmedName) {
      setError('Enter your name first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let code = '';
      let exists = true;
      while (exists) {
        code = makeCode();
        const snapshot = await get(ref(database, `rooms/${code}`));
        exists = snapshot.exists();
      }

      const playerId = makeId('player');
      const now = Date.now();
      const newRoom = {
        code,
        hostId: playerId,
        status: 'lobby',
        createdAt: now,
        updatedAt: now,
        winnerId: null,
        players: {
          [playerId]: {
            id: playerId,
            name: trimmedName,
            alive: true,
            targetId: null,
            killCount: 0,
            joinedAt: now,
          },
        },
        killFeed: {},
      };

      await set(ref(database, `rooms/${code}`), newRoom);
      saveSession({ roomCode: code, playerId });
      setMyId(playerId);
      setRoomCode(code);
      subscribeToRoom(code, playerId);
    } catch (err) {
      setError(err.message || 'Could not create game.');
    } finally {
      setLoading(false);
    }
  }

  async function joinGame() {
    if (!hasFirebaseConfig || !database) return;
    const trimmedName = myName.trim();
    const code = joinCode.trim().toUpperCase();

    if (!trimmedName || !code) {
      setError('Enter your name and a room code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const roomRef = ref(database, `rooms/${code}`);
      const snapshot = await get(roomRef);
      const data = snapshot.val();

      if (!data) {
        throw new Error('Room not found.');
      }
      if (data.status !== 'lobby') {
        throw new Error('That game already started. Ask the host to make a new room.');
      }
      const duplicateName = Object.values(data.players || {}).some(
        (player) => player.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicateName) {
        throw new Error('That name is already taken in this room.');
      }

      const playerId = makeId('player');
      const now = Date.now();
      await update(roomRef, {
        [`players/${playerId}`]: {
          id: playerId,
          name: trimmedName,
          alive: true,
          targetId: null,
          killCount: 0,
          joinedAt: now,
        },
        updatedAt: now,
      });

      saveSession({ roomCode: code, playerId });
      setMyId(playerId);
      setRoomCode(code);
      subscribeToRoom(code, playerId);
    } catch (err) {
      setError(err.message || 'Could not join game.');
    } finally {
      setLoading(false);
    }
  }

  async function startGame() {
    if (!database || !roomCode || !isHost || players.length < 3) return;
    setLoading(true);
    setError('');

    try {
      await runTransaction(ref(database, `rooms/${roomCode}`), (currentRoom) => {
        if (!currentRoom) return currentRoom;
        if (currentRoom.hostId !== myId) return currentRoom;
        const currentPlayers = sortPlayers(currentRoom.players);
        if (currentPlayers.length < 3) return currentRoom;

        const targetMap = assignTargets(currentPlayers.map((player) => player.id));
        const updatedPlayers = { ...currentRoom.players };
        currentPlayers.forEach((player) => {
          updatedPlayers[player.id] = {
            ...updatedPlayers[player.id],
            alive: true,
            targetId: targetMap[player.id],
            killCount: 0,
          };
        });

        return {
          ...currentRoom,
          status: 'active',
          winnerId: null,
          updatedAt: Date.now(),
          killFeed: {},
          players: updatedPlayers,
        };
      });
    } catch (err) {
      setError(err.message || 'Could not start game.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmKill() {
    if (!database || !roomCode || !me?.alive || !myTarget) return;
    setLoading(true);
    setError('');

    try {
      await runTransaction(ref(database, `rooms/${roomCode}`), (currentRoom) => {
        if (!currentRoom || currentRoom.status !== 'active') return currentRoom;
        const killer = currentRoom.players?.[myId];
        if (!killer?.alive || !killer.targetId) return currentRoom;

        const victimId = killer.targetId;
        const victim = currentRoom.players?.[victimId];
        if (!victim?.alive) return currentRoom;

        const nextTargetId = victim.targetId && victim.targetId !== myId ? victim.targetId : null;
        const updatedPlayers = { ...currentRoom.players };

        updatedPlayers[victimId] = {
          ...victim,
          alive: false,
          targetId: null,
        };

        updatedPlayers[myId] = {
          ...killer,
          targetId: nextTargetId,
          killCount: (killer.killCount || 0) + 1,
        };

        const aliveIds = Object.values(updatedPlayers)
          .filter((player) => player.alive)
          .map((player) => player.id);

        const entryId = makeId('kill');
        const feed = {
          ...(currentRoom.killFeed || {}),
          [entryId]: {
            id: entryId,
            killerId: myId,
            killerName: killer.name,
            victimId,
            victimName: victim.name,
            createdAt: Date.now(),
          },
        };

        return {
          ...currentRoom,
          players: updatedPlayers,
          killFeed: feed,
          status: aliveIds.length <= 1 ? 'finished' : 'active',
          winnerId: aliveIds.length <= 1 ? aliveIds[0] : null,
          updatedAt: Date.now(),
        };
      });
      setPendingKill(false);
    } catch (err) {
      setError(err.message || 'Could not record kill.');
    } finally {
      setLoading(false);
    }
  }

  async function playAgain() {
    if (!database || !roomCode || !isHost) return;
    setLoading(true);
    setError('');
    try {
      await runTransaction(ref(database, `rooms/${roomCode}`), (currentRoom) => {
        if (!currentRoom || currentRoom.hostId !== myId) return currentRoom;
        const updatedPlayers = { ...currentRoom.players };
        Object.keys(updatedPlayers).forEach((playerId) => {
          updatedPlayers[playerId] = {
            ...updatedPlayers[playerId],
            alive: true,
            targetId: null,
            killCount: 0,
          };
        });
        return {
          ...currentRoom,
          status: 'lobby',
          winnerId: null,
          updatedAt: Date.now(),
          killFeed: {},
          players: updatedPlayers,
        };
      });
    } catch (err) {
      setError(err.message || 'Could not reset game.');
    } finally {
      setLoading(false);
    }
  }

  function leaveRoom() {
    if (listenerRef.current) {
      off(listenerRef.current);
      listenerRef.current = null;
    }
    clearSession();
    setRoom(null);
    setRoomCode('');
    setJoinCode('');
    setMyId(null);
    setPendingKill(false);
    setScreen(SCREENS.HOME);
    setError('');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  if (!hasFirebaseConfig) {
    return (
      <div style={styles.root}>
        <style>{cssReset}</style>
        <div style={styles.centerPane}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>☠</span>
            <h1 style={styles.title}>ASSASSINS</h1>
            <p style={styles.subtitle}>Real multiplayer setup needed once</p>
          </div>
          <div style={styles.setupCard}>
            <p style={styles.setupText}>This version is already wired for real phone-to-phone multiplayer.</p>
            <p style={styles.setupText}>To turn it on, add your Firebase keys in a <code>.env</code> file from <code>.env.example</code>.</p>
            <p style={styles.setupText}>Then deploy to Vercel or Netlify and share the link.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <style>{cssReset}</style>

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
            onChange={(event) => setMyName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && createGame()}
          />
          <button style={styles.btnPrimary} onClick={createGame} disabled={loading}>
            {loading ? 'Creating…' : 'Create Game'}
          </button>

          <div style={styles.divider}><span>or join existing</span></div>

          <input
            style={styles.input}
            placeholder="Room code"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            maxLength={5}
          />
          <button style={styles.btnSecondary} onClick={joinGame} disabled={loading}>
            {loading ? 'Joining…' : 'Join Game'}
          </button>

          {error ? <p style={styles.error}>{error}</p> : null}
        </div>
      )}

      {screen === SCREENS.LOBBY && (
        <div style={styles.pane}>
          <div style={styles.headerRow}>
            <div>
              <h2 style={styles.roomCode}>ROOM <span style={styles.codeHighlight}>{roomCode}</span></h2>
              <p style={styles.hint}>Share this code. Everyone joins on their own phone.</p>
            </div>
            <button style={styles.smallButton} onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
          </div>

          <div style={styles.playerList}>
            <h3 style={styles.sectionLabel}>Players ({players.length})</h3>
            {players.map((player) => (
              <div key={player.id} style={styles.playerRow}>
                <span style={styles.playerDot} />
                <span style={styles.playerName}>{player.name}</span>
                {player.id === myId ? <span style={styles.youBadge}>you</span> : null}
                {player.id === room?.hostId ? <span style={styles.hostBadge}>host</span> : null}
              </div>
            ))}
          </div>

          <div style={styles.startSection}>
            {players.length < 3 ? <p style={styles.warning}>Need at least 3 players to start.</p> : null}
            {isHost ? (
              <button
                style={players.length >= 3 ? styles.btnPrimary : styles.btnDisabled}
                onClick={startGame}
                disabled={players.length < 3 || loading}
              >
                Start Game
              </button>
            ) : (
              <p style={styles.waiting}>Waiting for the host to start…</p>
            )}
            <button style={styles.btnSecondary} onClick={leaveRoom}>Leave Room</button>
            {error ? <p style={styles.error}>{error}</p> : null}
          </div>
        </div>
      )}

      {screen === SCREENS.GAME && (
        <div style={styles.pane}>
          {me?.alive ? (
            <div style={styles.targetCard}>
              <p style={styles.targetLabel}>YOUR TARGET</p>
              <p style={styles.targetName}>{myTarget?.name || 'Waiting…'}</p>
              <p style={styles.targetHint}>Hand them something to eliminate them.</p>
              {!pendingKill ? (
                <button style={styles.btnKill} onClick={() => setPendingKill(true)}>
                  I got them
                </button>
              ) : (
                <div style={styles.confirmBox}>
                  <p style={styles.confirmText}>Confirm that you eliminated <strong>{myTarget?.name}</strong>.</p>
                  <div style={styles.row}>
                    <button style={styles.btnConfirm} onClick={confirmKill} disabled={loading}>Confirm</button>
                    <button style={styles.btnCancel} onClick={() => setPendingKill(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.deadCard}>
              <p style={styles.deadIcon}>💀</p>
              <p style={styles.deadText}>You have been eliminated</p>
              <p style={styles.deadHint}>Stay in the app to watch the rest.</p>
            </div>
          )}

          <div style={styles.board}>
            <h3 style={styles.sectionLabel}>Alive ({alivePlayers.length})</h3>
            {players.map((player) => (
              <div key={player.id} style={{ ...styles.boardRow, opacity: player.alive ? 1 : 0.4 }}>
                <span style={player.alive ? styles.aliveDot : styles.deadDot} />
                <span style={{ ...styles.playerName, textDecoration: player.alive ? 'none' : 'line-through' }}>
                  {player.name}{player.id === myId ? ' (you)' : ''}
                </span>
                {player.killCount ? <span style={styles.killBadge}>🗡 {player.killCount}</span> : null}
              </div>
            ))}
          </div>

          <div style={styles.feedSection}>
            <h3 style={styles.sectionLabel}>Kill Feed</h3>
            <div style={styles.feed} ref={killFeedRef}>
              {killFeed.length === 0 ? <p style={styles.feedEmpty}>No eliminations yet…</p> : null}
              {killFeed.map((entry) => (
                <div key={entry.id} style={styles.feedEntry}>
                  <span style={styles.feedTime}>{formatTime(entry.createdAt)}</span>
                  <span><strong>{entry.killerName}</strong> eliminated <strong>{entry.victimName}</strong></span>
                </div>
              ))}
            </div>
          </div>

          <button style={styles.btnSecondary} onClick={leaveRoom}>Leave on this phone</button>
          {error ? <p style={styles.error}>{error}</p> : null}
        </div>
      )}

      {screen === SCREENS.WIN && (
        <div style={styles.centerPane}>
          <div style={styles.winCard}>
            <div style={styles.winCrown}>👑</div>
            <h1 style={styles.winTitle}>{winner?.name || 'Winner'}</h1>
            <p style={styles.winSub}>is the last one standing</p>
            <div style={styles.finalFeed}>
              <h3 style={{ ...styles.sectionLabel, marginBottom: 8 }}>Final Kill Feed</h3>
              {killFeed.map((entry) => (
                <div key={entry.id} style={styles.feedEntry}>
                  <span style={styles.feedTime}>{formatTime(entry.createdAt)}</span>
                  <span><strong>{entry.killerName}</strong> → <strong>{entry.victimName}</strong></span>
                </div>
              ))}
            </div>
            {isHost ? (
              <button style={styles.btnPrimary} onClick={playAgain}>Back to lobby</button>
            ) : null}
            <button style={styles.btnSecondary} onClick={leaveRoom}>Exit</button>
            {error ? <p style={styles.error}>{error}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

const colors = {
  bg: '#0a0a0f',
  surface: '#13131a',
  border: '#1e1e2e',
  accent: '#e63946',
  accentDim: '#7a1a20',
  text: '#e8e8f0',
  muted: '#6b6b80',
  green: '#2ecc71',
  yellow: '#f1c40f',
};

const styles = {
  root: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: "'Courier New', monospace",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px',
    boxSizing: 'border-box',
  },
  centerPane: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingTop: 40,
  },
  pane: {
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    paddingTop: 16,
  },
  logo: {
    textAlign: 'center',
    marginBottom: 24,
  },
  logoIcon: {
    fontSize: 56,
    display: 'block',
    marginBottom: 8,
    filter: 'drop-shadow(0 0 12px #e63946aa)',
  },
  title: {
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: '0.25em',
    color: colors.accent,
    margin: 0,
    textShadow: '0 0 20px #e6394655',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: '0.1em',
    marginTop: 6,
  },
  input: {
    width: '100%',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.text,
    fontFamily: "'Courier New', monospace",
    fontSize: 15,
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 4,
  },
  btnPrimary: {
    width: '100%',
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '13px 0',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
  btnSecondary: {
    width: '100%',
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: '12px 0',
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    letterSpacing: '0.08em',
    cursor: 'pointer',
  },
  btnDisabled: {
    width: '100%',
    background: colors.border,
    color: colors.muted,
    border: 'none',
    borderRadius: 6,
    padding: '13px 0',
    fontFamily: "'Courier New', monospace",
    fontSize: 14,
    cursor: 'not-allowed',
    letterSpacing: '0.08em',
  },
  btnKill: {
    marginTop: 14,
    background: colors.accentDim,
    color: colors.accent,
    border: `1px solid ${colors.accent}`,
    borderRadius: 6,
    padding: '11px 24px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    letterSpacing: '0.08em',
  },
  btnConfirm: {
    flex: 1,
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 0',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnCancel: {
    flex: 1,
    background: 'transparent',
    color: colors.muted,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: '10px 0',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    cursor: 'pointer',
    marginLeft: 8,
  },
  divider: {
    width: '100%',
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    position: 'relative',
    padding: '4px 0',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  roomCode: {
    margin: 0,
    fontSize: 22,
    letterSpacing: '0.12em',
  },
  codeHighlight: {
    color: colors.accent,
  },
  hint: {
    color: colors.muted,
    margin: '6px 0 0',
    fontSize: 13,
  },
  playerList: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 14,
  },
  sectionLabel: {
    fontSize: 13,
    color: colors.muted,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    margin: '0 0 12px',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: `1px solid ${colors.border}`,
  },
  playerDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: colors.green,
    display: 'inline-block',
    flexShrink: 0,
  },
  aliveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: colors.green,
    display: 'inline-block',
    flexShrink: 0,
  },
  deadDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: colors.accent,
    display: 'inline-block',
    flexShrink: 0,
  },
  playerName: {
    flex: 1,
    fontSize: 15,
  },
  youBadge: {
    background: '#1d2735',
    color: '#7cc0ff',
    borderRadius: 999,
    padding: '4px 8px',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  hostBadge: {
    background: '#3b3020',
    color: colors.yellow,
    borderRadius: 999,
    padding: '4px 8px',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  startSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  waiting: {
    color: colors.muted,
    textAlign: 'center',
    margin: 0,
  },
  warning: {
    color: colors.yellow,
    margin: 0,
  },
  targetCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 18,
    textAlign: 'center',
  },
  targetLabel: {
    margin: 0,
    color: colors.muted,
    fontSize: 12,
    letterSpacing: '0.14em',
  },
  targetName: {
    margin: '10px 0 6px',
    fontSize: 28,
    color: colors.accent,
    fontWeight: 700,
  },
  targetHint: {
    color: colors.muted,
    margin: 0,
    fontSize: 13,
  },
  confirmBox: {
    marginTop: 16,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 14,
  },
  confirmText: {
    marginTop: 0,
    marginBottom: 12,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
  },
  deadCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 18,
    textAlign: 'center',
  },
  deadIcon: {
    fontSize: 34,
    margin: 0,
  },
  deadText: {
    fontSize: 20,
    marginBottom: 6,
  },
  deadHint: {
    color: colors.muted,
    margin: 0,
  },
  board: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 14,
  },
  boardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: `1px solid ${colors.border}`,
  },
  killBadge: {
    color: colors.yellow,
    fontSize: 13,
  },
  feedSection: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 14,
  },
  feed: {
    maxHeight: 220,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  feedEmpty: {
    color: colors.muted,
    margin: 0,
  },
  feedEntry: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: 14,
  },
  feedTime: {
    color: colors.muted,
    minWidth: 44,
  },
  winCard: {
    width: '100%',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 20,
    textAlign: 'center',
  },
  winCrown: {
    fontSize: 42,
    marginBottom: 8,
  },
  winTitle: {
    color: colors.accent,
    margin: 0,
    fontSize: 32,
  },
  winSub: {
    color: colors.muted,
    marginTop: 8,
  },
  finalFeed: {
    textAlign: 'left',
    margin: '18px 0',
    padding: 14,
    background: '#0f0f15',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
  },
  error: {
    color: '#ff8f8f',
    margin: 0,
    textAlign: 'center',
  },
  smallButton: {
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: '10px 14px',
    cursor: 'pointer',
  },
  setupCard: {
    width: '100%',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 18,
  },
  setupText: {
    marginTop: 0,
    marginBottom: 12,
    lineHeight: 1.5,
  },
};

const cssReset = `
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; min-height: 100%; }
  button, input { font: inherit; }
  button:disabled { opacity: 0.7; cursor: not-allowed; }
  code {
    background: #0f0f15;
    padding: 2px 6px;
    border-radius: 4px;
  }
`;
