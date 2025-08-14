// networkWorker.js - PeerJS worker for namespaced matchmaking and lobby system

// === MESSAGE PROTOCOL DEFINITION ===
// All communication between worker and main thread uses these types:
// { type: 'playerInput', data: { ... } }
// { type: 'gameStateUpdate', data: { ... } }
// { type: 'connectionStatus', data: { status: 'connected'|'disconnected'|'reconnecting', details } }
// { type: 'chatMessage', data: { ... } }
// { type: 'diagnostic', data: { ... } }
// { type: 'heartbeat', data: { timestamp } }
// { type: 'peerEvent', data: { event, peerId } }
// { type: 'error', data: { errorType, details } }

importScripts('lib/peerjs.min.js');

// Heartbeat/keepalive logic
let heartbeatInterval = 3000; // ms
setInterval(() => {
  postMessage({ type: 'heartbeat', data: { timestamp: Date.now() } });
  // TODO: Send heartbeat to peers
}, heartbeatInterval);

let peer = null;
let basePeer = null;
let myPeerId = null;
let isBase = false;
let lobbyConnectedPeers = [];
let lobbyPeerConnections = {};
let lobbyFull = false;
let LOBBY_SIZE = 3;
let BASE_PEER_ID = 'NeonGameBootstrap-2025-001';

function post(type, data) {
  postMessage({ type, data });
}

onmessage = function(event) {
  const { type, lobbySize } = event.data;
  if (type === 'init') {
    LOBBY_SIZE = lobbySize || LOBBY_SIZE;
    myPeerId = `ChainNode-${Math.random().toString(36).substr(2, 8)}`;
    peer = new Peer(myPeerId, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    peer.on('open', (id) => {
      post('updateConnectionStatus', `Connected as ${id}`);
      post('logChainEvent', `[Worker] Peer opened with ID: ${id}`);
      post('updateUI');
      tryBecomeBase();
    });
    peer.on('error', (err) => {
      post('logChainEvent', `[Worker] Peer error: ${err.message}`);
      post('updateConnectionStatus', `Peer error: ${err.message}`);
    });
  }
};

function tryBecomeBase() {
  basePeer = new Peer(BASE_PEER_ID, {
    host: '0.peerjs.com', port: 443, path: '/', secure: true,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });
  isBase = true;
  lobbyConnectedPeers = [myPeerId];
  lobbyPeerConnections = {};
  lobbyFull = false;
  post('logChainEvent', `[Worker] Trying to claim BASE_PEER_ID: ${BASE_PEER_ID}`);

  basePeer.on('open', (id) => {
    post('logChainEvent', `[Worker] Successfully claimed BASE_PEER_ID: ${id}`);
    post('updateConnectionStatus', `Waiting for ${LOBBY_SIZE} players... (1/${LOBBY_SIZE})`);
    post('updateUI', { lobbyPeers: lobbyConnectedPeers });
    basePeer.on('connection', (conn) => {
      conn.on('data', (data) => {
        if (data.type === 'join') {
          if (lobbyFull || lobbyConnectedPeers.length >= LOBBY_SIZE) {
            post('logChainEvent', `[Worker] Lobby full, rejecting ${data.peerId}`);
            conn.send({ type: 'lobby_full', message: 'Lobby is full, try again later' });
            conn.close();
            return;
          }
          post('logChainEvent', `[Worker] Discovery request from ${data.peerId}, redirecting to host ${myPeerId}`);
          conn.send({
            type: 'redirect_to_host',
            hostId: myPeerId,
            currentPlayers: lobbyConnectedPeers.length,
            totalPlayers: LOBBY_SIZE
          });
          conn.close();
        }
      });
      conn.on('close', () => {
        post('logChainEvent', `[Worker] Discovery connection closed`);
      });
    });
  });
  basePeer.on('error', (err) => {
    post('logChainEvent', `[Worker] Failed to claim BASE_PEER_ID, error: ${err.type}`);
    isBase = false;
    basePeer.destroy();
    post('updateUI');
    setTimeout(() => {
      joinChain();
    }, 1000);
  });

  // Host logic: accept direct connections from clients
  peer.on('connection', (conn) => {
    conn.on('data', (data) => {
      if (data.type === 'join_host') {
        // Prevent duplicate joins and connection overwrite
        if (lobbyConnectedPeers.includes(data.peerId)) {
          // If the connection for this peerId is already open, ignore this join
          if (lobbyPeerConnections[data.peerId] && lobbyPeerConnections[data.peerId] !== conn && lobbyPeerConnections[data.peerId].open) {
            post('logChainEvent', `[Worker] Duplicate join_host for ${data.peerId}, ignoring new connection.`);
            conn.send({ type: 'waiting', current: lobbyConnectedPeers.length, total: LOBBY_SIZE });
            return;
          }
        } else {
          lobbyConnectedPeers.push(data.peerId);
        }
        // Only set connection if not already set or if previous is closed
        if (!lobbyPeerConnections[data.peerId] || !lobbyPeerConnections[data.peerId].open) {
          lobbyPeerConnections[data.peerId] = conn;
        } else {
          post('logChainEvent', `[Worker] Connection for ${data.peerId} already exists and is open.`);
        }
        post('logChainEvent', `[Worker] Player ${lobbyConnectedPeers.length}/${LOBBY_SIZE} joined: ${data.peerId}`);
        post('updateConnectionStatus', `Waiting for ${LOBBY_SIZE} players... (${lobbyConnectedPeers.length}/${LOBBY_SIZE})`);
        post('updateUI', { lobbyPeers: lobbyConnectedPeers });
        // If lobby is full, notify all clients
        if (lobbyConnectedPeers.length === LOBBY_SIZE) {
          lobbyFull = true;
          post('logChainEvent', `[Worker] Lobby full! ${LOBBY_SIZE} players: ${lobbyConnectedPeers.join(', ')}`);
          for (let i = 1; i < lobbyConnectedPeers.length; i++) {
            const peerId = lobbyConnectedPeers[i];
            if (lobbyPeerConnections[peerId]) {
              lobbyPeerConnections[peerId].send({
                type: 'host_ready',
                hostId: myPeerId,
                allPlayers: lobbyConnectedPeers
              });
            }
          }
        } else {
          // Not full yet, send waiting notification
          conn.send({ type: 'waiting', current: lobbyConnectedPeers.length, total: LOBBY_SIZE });
        }
      } else if (data.type === 'message' || data.type === 'player_state') {
        // Relay to all other clients
        for (const [peerId, c] of Object.entries(lobbyPeerConnections)) {
          if (peerId !== data.peerId && c && c.open) {
            c.send(data);
          }
        }
        // Also post to main thread for local display
        post('networkData', data);
      }
    });
    conn.on('close', () => {
      // Remove from lobby on disconnect ONLY if this connection is still the tracked one
      let disconnectedPeerId = null;
      for (const pid in lobbyPeerConnections) {
        if (lobbyPeerConnections[pid] === conn) {
          disconnectedPeerId = pid;
          break;
        }
      }
      if (disconnectedPeerId) {
        // Check if a new connection replaced this one before cleaning up
        if (lobbyPeerConnections[disconnectedPeerId] === conn) {
          const idx = lobbyConnectedPeers.indexOf(disconnectedPeerId);
          if (idx > -1) lobbyConnectedPeers.splice(idx, 1);
          delete lobbyPeerConnections[disconnectedPeerId];
          post('logChainEvent', `[Worker] Player ${disconnectedPeerId} disconnected, removed from lobby. Lobby now: [${lobbyConnectedPeers.join(', ')}]`);
          // If lobby was full, allow it to refill
          if (lobbyFull) {
            lobbyFull = false;
            post('logChainEvent', `[Worker] Lobby no longer full after disconnect.`);
          }
          post('updateUI', { lobbyPeers: lobbyConnectedPeers });
        } else {
          post('logChainEvent', `[Worker] Connection for ${disconnectedPeerId} already replaced, not cleaning up.`);
        }
      } else {
        post('logChainEvent', `[Worker] Connection closed, but no matching peerId found.`);
      }
    });
    conn.on('error', (err) => {
      post('logChainEvent', `[Worker] Conn error: ${err.message}`);
    });
  });
}

function joinChain() {
  const baseConn = peer.connect(BASE_PEER_ID);
  post('updateConnectionStatus', 'Discovering lobby...');
  post('updateUI');
  baseConn.on('open', () => {
    post('logChainEvent', `[Worker] Discovery connection opened, sending join request`);
    baseConn.send({ type: 'join', peerId: myPeerId });
  });
  baseConn.on('data', (data) => {
    if (data.type === 'redirect_to_host') {
      baseConn.close();
      post('logChainEvent', `[Worker] Redirected to host: ${data.hostId}`);
      connectToHost(data.hostId);
    } else if (data.type === 'lobby_full') {
      post('logChainEvent', `[Worker] Lobby is full, starting new lobby...`);
      post('updateConnectionStatus', 'Lobby full, starting new lobby...');
      baseConn.close();
      setTimeout(() => {
        tryBecomeBase();
      }, 2000);
    }
  });
  baseConn.on('error', (err) => {
    post('logChainEvent', `[Worker] Discovery connection error: ${err.type}`);
    post('updateConnectionStatus', 'Failed to discover lobby');
    setTimeout(() => {
      tryBecomeBase();
    }, 3000);
  });
}

function connectToHost(hostId) {
  const hostConn = peer.connect(hostId);
  post('updateConnectionStatus', 'Connecting to host...');
  let lobbyPeers = [];
  hostConn.on('open', () => {
    hostConn.send({ type: 'join_host', peerId: myPeerId });
    post('logChainEvent', `[Worker] Connected to host: ${hostId}`);
  });
  hostConn.on('data', (data) => {
    if (data.type === 'host_ready') {
      // Host sends full peer list
      lobbyPeers = data.allPlayers;
      post('updateConnectionStatus', `Connected to host in ${lobbyPeers.length}-player lobby!`);
      post('updateUI', { lobbyPeers });
      post('logChainEvent', `[Worker] Host ready, lobby: ${JSON.stringify(lobbyPeers)}`);
    } else if (data.type === 'waiting') {
      post('logChainEvent', `[Worker] Waiting for more players... (${data.current}/${data.total})`);
      post('updateConnectionStatus', `Waiting in queue... (${data.current}/${data.total})`);
      post('updateUI', { lobbyPeers });
    } else if (data.type === 'lobby_full') {
      post('logChainEvent', `[Worker] Host lobby is full, starting new lobby...`);
      post('updateConnectionStatus', 'Lobby full, starting new lobby...');
      hostConn.close();
      setTimeout(() => {
        tryBecomeBase();
      }, 1000);
    } else if (data.type === 'message' || data.type === 'player_state') {
      // Relay message/player_state to main thread
      post('networkData', data);
    }
  });
  hostConn.on('error', (err) => {
    post('updateConnectionStatus', 'Failed to connect to host');
    post('logChainEvent', `[Worker] Host connection error: ${err.message}`);
  });
}
