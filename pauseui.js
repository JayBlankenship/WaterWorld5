// pauseui.js - UI management module for pause menu

// --- UI MODULE ---
const PauseUI = {
  // UI Elements
  elements: {},
  
  // UI State
  messagesArray: [],
  
  // Initialize UI elements
  init() {
    this.elements = {
      chainStatus: document.getElementById('chainStatus'),
      chainPositionSpan: document.getElementById('chainPosition'),
      peerCount: document.getElementById('peerCount'),
      nextPeerSpan: document.getElementById('nextPeer'),
      chatMessages: document.getElementById('chatMessages'),
      messageInput: document.getElementById('messageInput'),
      targetPeerId: document.getElementById('targetPeerId'),
      peerInfoDiv: document.getElementById('peerInfo'),
      connectionStatusDiv: document.getElementById('connectionStatus'),
      outputPanel: document.getElementById('outputPanel'),
      diagnosticsDiv: document.getElementById('diagnostics'),
      diagnosticsStaticDiv: document.getElementById('diagnosticsStatic'),
      peerChainList: document.getElementById('peerChainList'),
      frontPeerIdSpan: document.getElementById('frontPeerId'),
      backPeerIdSpan: document.getElementById('backPeerId'),
      frontConnStatusSpan: document.getElementById('frontConnStatus'),
      backConnStatusSpan: document.getElementById('backConnStatus'),
      chainLogDiv: document.getElementById('chainLog'),
      basePeerIndicator: document.getElementById('basePeerIndicator')
    };
  },
  
  // Logging functions
  logChainEvent(msg, color = '#ffaa00') {
    if (this.elements.chainLogDiv) {
      this.elements.chainLogDiv.insertAdjacentHTML('beforeend', `<div style='color:${color}'>${msg}</div>`);
      this.elements.chainLogDiv.scrollTop = this.elements.chainLogDiv.scrollHeight;
    }
  },
  
  logDiag(msg, color = '#44ff44') {
    if (this.elements.diagnosticsDiv) {
      this.elements.diagnosticsDiv.insertAdjacentHTML('beforeend', `<div style='color:${color}'>${msg}</div>`);
      this.elements.diagnosticsDiv.scrollTop = this.elements.diagnosticsDiv.scrollHeight;
    }
  },
  
  // Update connection status
  updateConnectionStatus(status) {
    if (this.elements.connectionStatusDiv) {
      this.elements.connectionStatusDiv.textContent = status;
    }
  },
  
  // Handle incoming messages
  handleMessage(data) {
    if (data.messages) {
      data.messages.forEach((m) => {
        if (!this.messagesArray.some((existing) => existing.id === m.id)) {
          this.messagesArray.push(m);
        }
      });
      this.messagesArray.sort((a, b) => a.timestamp - b.timestamp);
      this.updateUI();
    }
  },
  
  // Send message function
  sendMessage() {
    const text = this.elements.messageInput.value.trim();
    const message = Network.sendMessage(text);
    
    if (message) {
      this.messagesArray.push(message);
      this.messagesArray.sort((a, b) => a.timestamp - b.timestamp);
      this.elements.messageInput.value = '';
      this.elements.targetPeerId.value = '';
      this.updateUI();
    }
  },
  
  // Join chain function
  joinChain() {
    Network.joinChain();
  },
  
  // Update the entire UI
  updateUI() {
    // Get current network state
    const networkState = {
      myPeerId: Network.myPeerId,
      isBase: Network.isBase,
      paired: Network.paired,
      partnerPeerId: Network.partnerPeerId,
      partnerConn: Network.partnerConn,
      baseConn: Network.baseConn,
      isInitialized: Network.isInitialized,
      lobbyPeers: Network.lobbyPeers || [],
      partnerConnections: Network.partnerConnections || {},
      lobbyConnectedPeers: Network.lobbyConnectedPeers || [],
      lobbyFull: Network.lobbyFull || false
    };

    // Update the dedicated 'Lobby Players' list (top right)
    const lobbyPlayersDiv = document.getElementById('lobbyPlayers');
    if (lobbyPlayersDiv) {
      // Create a Set to ensure no duplicates
      let uniquePeers = new Set();
      
      // Add all lobby peers
      if (Array.isArray(networkState.lobbyPeers)) {
        networkState.lobbyPeers.forEach(peer => {
          if (peer) uniquePeers.add(peer);
        });
      }
      
      // Always ensure myPeerId is included
      if (networkState.myPeerId) {
        uniquePeers.add(networkState.myPeerId);
      }
      
      // Add partnerPeerId if it exists
      if (networkState.partnerPeerId) {
        uniquePeers.add(networkState.partnerPeerId);
      }
      
      // Convert Set to Array
      let playerList = Array.from(uniquePeers);
      
      lobbyPlayersDiv.innerHTML = '<strong>Lobby Players</strong><br>' + playerList.map((peerId, idx) => {
        if (networkState.isBase && peerId === networkState.myPeerId) {
          return `#${idx + 1} (Host): ${peerId} (You)`;
        } else if (!networkState.isBase && peerId === networkState.partnerPeerId) {
          return `#${idx + 1} (Host): ${peerId}`;
        } else if (peerId === networkState.myPeerId) {
          return `#${idx + 1} (You): ${peerId}`;
        } else {
          return `#${idx + 1} (Client): ${peerId}`;
        }
      }).join('<br>');
    }
    
    // Update peer ID display
    if (networkState.myPeerId && this.elements.peerInfoDiv) {
      const myPeerIdElement = this.elements.peerInfoDiv.querySelector('#myPeerId');
      if (myPeerIdElement) {
        myPeerIdElement.textContent = networkState.myPeerId;
      }
    }
    
    // Update role and status for lobby system
    if (this.elements.chainPositionSpan) {
      if (networkState.isBase && networkState.paired) {
        this.elements.chainPositionSpan.textContent = 'Host';
      } else if (networkState.paired && !networkState.isBase) {
        this.elements.chainPositionSpan.textContent = 'Client';
      } else if (networkState.isBase) {
        this.elements.chainPositionSpan.textContent = 'Host (Waiting)';
      } else {
        this.elements.chainPositionSpan.textContent = 'Joining';
      }
    }

    // Update lobby size for dynamic lobby size
    if (this.elements.peerCount) {
      const LOBBY_SIZE = Network.LOBBY_SIZE;
      const currentCount = networkState.lobbyConnectedPeers.length || 1;
      if (networkState.isBase) {
        if (networkState.lobbyFull && currentCount === LOBBY_SIZE) {
          this.elements.peerCount.textContent = `${LOBBY_SIZE}/${LOBBY_SIZE} Player${LOBBY_SIZE !== 1 ? 's' : ''} (Full)`;
        } else {
          this.elements.peerCount.textContent = `${currentCount}/${LOBBY_SIZE} Player${LOBBY_SIZE !== 1 ? 's' : ''}`;
        }
      } else if (networkState.paired) {
        this.elements.peerCount.textContent = `${LOBBY_SIZE}/${LOBBY_SIZE} Player${LOBBY_SIZE !== 1 ? 's' : ''} (Full)`;
      } else {
        this.elements.peerCount.textContent = 'Connecting...';
      }
    }

    // Update connected players info
    if (this.elements.nextPeerSpan) {
      if (networkState.isBase) {
        // Host view - show all connected clients
        const clientCount = (networkState.lobbyConnectedPeers.length || 1) - 1; // Subtract host
        if (clientCount > 0) {
          this.elements.nextPeerSpan.textContent = `${clientCount} client${clientCount !== 1 ? 's' : ''}`;
        } else {
          this.elements.nextPeerSpan.textContent = 'No clients yet';
        }
      } else if (networkState.paired) {
        // Client view - show host and other clients
        const totalClients = networkState.lobbyPeers.length - 1;
        if (totalClients > 1) {
          this.elements.nextPeerSpan.textContent = `Host + ${totalClients} other clients`;
        } else if (totalClients === 1) {
          this.elements.nextPeerSpan.textContent = `Host + 1 other client`;
        } else {
          this.elements.nextPeerSpan.textContent = `Host only`;
        }
      } else {
        this.elements.nextPeerSpan.textContent = 'Searching...';
      }
    }    // Update lobby connection info
    if (this.elements.frontPeerIdSpan) {
      if (networkState.isBase) {
        this.elements.frontPeerIdSpan.textContent = `${networkState.myPeerId} (You)`;
      } else {
        this.elements.frontPeerIdSpan.textContent = networkState.partnerPeerId || 'Unknown';
      }
    }

    if (this.elements.backPeerIdSpan) {
      if (networkState.isBase && networkState.paired) {
        const clientIds = Object.keys(networkState.partnerConnections);
        this.elements.backPeerIdSpan.textContent = clientIds.length > 0 ? `${clientIds.length} clients` : 'No clients';
      } else if (networkState.paired && !networkState.isBase) {
        this.elements.backPeerIdSpan.textContent = `${networkState.lobbyPeers.length - 1} other clients`;
      } else {
        this.elements.backPeerIdSpan.textContent = 'None';
      }
    }

    if (this.elements.frontConnStatusSpan) {
      if (networkState.isBase && networkState.paired) {
        // Show client connection status
        const connectedClients = Object.values(networkState.partnerConnections).filter(conn => conn && conn.open).length;
        const totalClients = Object.keys(networkState.partnerConnections).length;
        this.elements.frontConnStatusSpan.textContent = `Connected (${connectedClients}/${totalClients} clients active)`;
      } else if (networkState.paired && !networkState.isBase) {
        // Show host connection status
        this.elements.frontConnStatusSpan.textContent = (networkState.baseConn && networkState.baseConn.open) ? 'Connected to Host' : 'Disconnected';
      } else {
        this.elements.frontConnStatusSpan.textContent = networkState.isBase ? 'Waiting for clients' : 'Connecting...';
      }
    }

    if (this.elements.backConnStatusSpan) {
      const LOBBY_SIZE = Network.LOBBY_SIZE;
      const currentCount = networkState.lobbyConnectedPeers.length || 1;
      if (networkState.isBase) {
        if (networkState.lobbyFull && currentCount === LOBBY_SIZE) {
          this.elements.backConnStatusSpan.textContent = `Active Lobby (${LOBBY_SIZE}/${LOBBY_SIZE})`;
        } else {
          this.elements.backConnStatusSpan.textContent = `Waiting (${currentCount}/${LOBBY_SIZE})`;
        }
      } else if (networkState.paired) {
        this.elements.backConnStatusSpan.textContent = `Active Lobby (${LOBBY_SIZE}/${LOBBY_SIZE})`;
      } else {
        this.elements.backConnStatusSpan.textContent = 'Joining lobby...';
      }
    }
    
    // Update peer chain list for dynamic lobby size - DISABLED to prevent duplicates
    // Now using lobbyPlayers div instead
    /*
    if (this.elements.peerChainList) {
      const LOBBY_SIZE = Network.LOBBY_SIZE;
      this.elements.peerChainList.innerHTML = '';
      // Always show all lobby members for both host and clients
      let peerList = [];
      if (networkState.isBase) {
        // Host: show self and all connected clients
        peerList = [networkState.myPeerId, ...Object.keys(networkState.partnerConnections)];
      } else if (networkState.paired) {
        // Client: show host and all lobby peers
        peerList = [networkState.partnerPeerId, ...networkState.lobbyPeers.filter(p => p !== networkState.partnerPeerId)];
      } else {
        // Not connected yet
        peerList = [networkState.myPeerId];
      }
      peerList.forEach((peerId, idx) => {
        const li = document.createElement('li');
        if (networkState.isBase && idx === 0) {
          li.textContent = `#${idx} (Host): ${peerId}`;
          li.style.color = '#00ff99';
        } else if (!networkState.isBase && idx === 0) {
          li.textContent = `#${idx} (Host): ${peerId}`;
          li.style.color = '#ffaa00';
        } else {
          li.textContent = `#${idx} (${peerId === networkState.myPeerId ? 'You' : 'Client'}): ${peerId}`;
          li.style.color = peerId === networkState.myPeerId ? '#00ffcc' : '#00ccff';
        }
        this.elements.peerChainList.appendChild(li);
      });
    }
    */
    
    // Update base peer indicator for host-based system
    if (this.elements.basePeerIndicator) {
      const LOBBY_SIZE = Network.LOBBY_SIZE;
      const currentCount = networkState.lobbyConnectedPeers.length || 1;
      if (networkState.isBase) {
        if (networkState.lobbyFull && currentCount === LOBBY_SIZE) {
          this.elements.basePeerIndicator.textContent = `You are the HOST of a full ${LOBBY_SIZE}-player lobby`;
          this.elements.basePeerIndicator.style.color = '#00ff99';
        } else {
          this.elements.basePeerIndicator.textContent = `You are the HOST (${currentCount}/${LOBBY_SIZE} player${LOBBY_SIZE !== 1 ? 's' : ''})`;
          this.elements.basePeerIndicator.style.color = '#ffaa00';
        }
      } else if (networkState.paired) {
        this.elements.basePeerIndicator.textContent = `You are a CLIENT in a ${LOBBY_SIZE}-player lobby`;
        this.elements.basePeerIndicator.style.color = '#00ccff';
      } else {
        this.elements.basePeerIndicator.textContent = `Connecting to ${LOBBY_SIZE}-player lobby...`;
        this.elements.basePeerIndicator.style.color = '#ffaa00';
      }
    }
    
    // Update diagnostics for host-based system
    if (this.elements.diagnosticsStaticDiv) {
      const LOBBY_SIZE = Network.LOBBY_SIZE;
      const roleText = networkState.isBase ? 
        (networkState.lobbyFull ? `HOST (Full Lobby)` : `HOST (${networkState.lobbyConnectedPeers.length || 1}/${LOBBY_SIZE})`) :
        (networkState.paired ? 'CLIENT (Connected)' : 'CONNECTING');
      
      const connectionInfo = networkState.isBase ? 
        `${(networkState.lobbyConnectedPeers.length || 1) - 1} clients connected` :
        (networkState.baseConn && networkState.baseConn.open ? 'Connected to Host' : 'Disconnected from Host');
      
      const lobbySize = networkState.isBase ?
        `${networkState.lobbyConnectedPeers.length || 1}/${LOBBY_SIZE} player${LOBBY_SIZE !== 1 ? 's' : ''}` :
        (networkState.paired ? `${LOBBY_SIZE}/${LOBBY_SIZE} player${LOBBY_SIZE !== 1 ? 's' : ''} (full)` : 'Joining...');
      
      this.elements.diagnosticsStaticDiv.innerHTML = `
        <div><strong>My Peer ID:</strong> ${networkState.myPeerId}</div>
        <div><strong>Role:</strong> ${roleText}</div>
        <div><strong>Lobby Size:</strong> ${lobbySize}</div>
        <div><strong>Connection Info:</strong> ${connectionInfo}</div>
        <div><strong>Host ID:</strong> ${networkState.isBase ? networkState.myPeerId + ' (You)' : (networkState.partnerPeerId || 'Unknown')}</div>
        <div><strong>Status:</strong> ${networkState.isBase ? (networkState.lobbyFull ? 'Full Lobby Ready' : 'Waiting for Players') : (networkState.paired ? `In ${LOBBY_SIZE}-Player Lobby` : 'Connecting...')}</div>
      `;
    }
    
    // Update chat messages
    if (this.elements.chatMessages) {
      this.elements.chatMessages.innerHTML = this.messagesArray
        .map((m) => {
          const isMyMessage = m.peerId === networkState.myPeerId;
          return `<div${isMyMessage ? ' class="my-message"' : ''}>${m.peerId}: ${m.text}</div>`;
        })
        .join('');
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
  },
  
  // Legacy functions for compatibility
  broadcastChain() {
    // Only base peer does this (keeping for compatibility)
    const networkState = {
      myPeerId: Network.myPeerId,
      isBase: Network.isBase
    };
    
    if (!networkState.isBase) return;
    // This function is kept for compatibility but may not be used in current implementation
  },
  
  updateChainLinks() {
    // Legacy function kept for compatibility
    // Current implementation uses simple pairing, not chain linking
  }
};

// Export the PauseUI object for use in other files
window.PauseUI = PauseUI;
