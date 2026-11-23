// State Variables
let socket = null;
let peerConnection = null;
let dataChannel = null;
let localScreenStream = null;
let isHostActive = false;
let hostDimensions = { width: 1920, height: 1080 };
let pingInterval = null;

// STUN Server configuration for NAT Traversal
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

let iceCandidatesQueue = [];
let isRelayStreaming = false;
let relayStreamInterval = null;
let lastBlobUrl = null;
let hasEnteredFullscreen = false;

const remoteImage = document.getElementById('remoteImage');
const hostPreviewVideo = document.getElementById('hostPreviewVideo');

// DOM Elements
const tabHost = document.getElementById('tabHost');
const tabViewer = document.getElementById('tabViewer');
const viewHost = document.getElementById('viewHost');
const viewViewer = document.getElementById('viewViewer');

const serverUrlInput = document.getElementById('serverUrl');
const btnConnectServer = document.getElementById('btnConnectServer');
const serverStatusBadge = document.getElementById('serverStatusBadge');

// Host Elements
const hostDeviceIdInput = document.getElementById('hostDeviceId');
const hostPinInput = document.getElementById('hostPin');
const btnRegenId = document.getElementById('btnRegenId');
const btnToggleHost = document.getElementById('btnToggleHost');
const hostStatusText = document.getElementById('hostStatusText');

// Viewer Elements
const viewerSetupCard = document.getElementById('viewerSetupCard');
const targetDeviceIdInput = document.getElementById('targetDeviceId');
const targetPinInput = document.getElementById('targetPin');
const btnStartRemote = document.getElementById('btnStartRemote');
const connectionMessage = document.getElementById('connectionMessage');

const sessionContainer = document.getElementById('sessionContainer');
const activeTargetName = document.getElementById('activeTargetName');
const sessionLatency = document.getElementById('sessionLatency');
const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
const btnDisconnectSession = document.getElementById('btnDisconnectSession');
const viewportWrapper = document.getElementById('viewportWrapper');
const remoteVideo = document.getElementById('remoteVideo');
const viewportOverlay = document.getElementById('viewportOverlay');
const overlayMessage = document.getElementById('overlayMessage');

// Tab Switching
function switchTab(target) {
  if (target === 'host') {
    tabHost.classList.add('active');
    tabHost.setAttribute('aria-selected', 'true');
    tabViewer.classList.remove('active');
    tabViewer.setAttribute('aria-selected', 'false');

    viewHost.classList.add('active');
    viewHost.removeAttribute('hidden');
    viewViewer.classList.remove('active');
    viewViewer.setAttribute('hidden', '');
  } else {
    tabViewer.classList.add('active');
    tabViewer.setAttribute('aria-selected', 'true');
    tabHost.classList.remove('active');
    tabHost.setAttribute('aria-selected', 'false');

    viewViewer.classList.add('active');
    viewViewer.removeAttribute('hidden');
    viewHost.classList.remove('active');
    viewHost.setAttribute('hidden', '');
  }
}

tabHost.addEventListener('click', () => switchTab('host'));
tabViewer.addEventListener('click', () => switchTab('viewer'));

// Copy Device ID
const btnCopyId = document.getElementById('btnCopyId');
if (btnCopyId) {
  btnCopyId.addEventListener('click', () => {
    navigator.clipboard.writeText(hostDeviceIdInput.value).then(() => {
      const origText = btnCopyId.textContent;
      btnCopyId.textContent = 'Tersalin!';
      setTimeout(() => {
        btnCopyId.textContent = origText;
      }, 1500);
    });
  });
}

// Generate Random Device ID
function generateDeviceId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `HOME-PC-${num}`;
}

btnRegenId.addEventListener('click', () => {
  if (isHostActive) return;
  hostDeviceIdInput.value = generateDeviceId();
});

// Server Connection Management
function updateServerStatus(status, text) {
  serverStatusBadge.className = 'status-badge';
  if (status === 'online') {
    serverStatusBadge.classList.add('status-online');
    serverStatusBadge.textContent = text || 'Online';
  } else if (status === 'standby') {
    serverStatusBadge.classList.add('status-standby');
    serverStatusBadge.textContent = text || 'Connecting';
  } else {
    serverStatusBadge.classList.add('status-offline');
    serverStatusBadge.textContent = text || 'Offline';
  }
}

function initSignalingSocket() {
  const url = serverUrlInput.value.trim();
  if (!url) return;

  if (socket) {
    socket.disconnect();
  }

  updateServerStatus('standby', 'Connecting...');

  try {
    if (typeof io === 'undefined') {
      console.error('[Socket] io is not loaded');
      updateServerStatus('offline', 'Library Error');
      return;
    }

    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to signaling server');
      updateServerStatus('online', 'Online');

      if (isHostActive) {
        registerHostOnServer();
      }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from signaling server');
      updateServerStatus('offline', 'Offline');
      if (isHostActive) {
        setHostState(false);
      }
    });

    socket.on('connect_error', () => {
      updateServerStatus('offline', 'Server Error');
    });

    // Signaling events
    setupSignalingListeners();
  } catch (err) {
    console.error('[Socket Init Error]', err);
    updateServerStatus('offline', 'Failed');
  }
}

btnConnectServer.addEventListener('click', initSignalingSocket);

// Signaling Message Handlers
function setupSignalingListeners() {
  // Host receives incoming controller request
  socket.on('incoming-controller', async ({ controllerSocketId }) => {
    console.log('[Host] Incoming controller from socket:', controllerSocketId);
    hostStatusText.textContent = 'Active (Sedang Dikontrol)';
    hostStatusText.style.color = '#34d399';

    await startHostPeerConnection(controllerSocketId);
  });

  // Offer received (Host receives offer from controller)
  socket.on('signal-offer', async ({ senderSocketId, offer }) => {
    console.log('[Signaling] Received Offer from:', senderSocketId);
    if (!peerConnection) {
      await startHostPeerConnection(senderSocketId);
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Flush queued candidates
    if (iceCandidatesQueue.length > 0) {
      for (const cand of iceCandidatesQueue) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.error('[ICE Error]', e);
        }
      }
      iceCandidatesQueue = [];
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('signal-answer', {
      targetSocketId: senderSocketId,
      answer
    });
  });

  // Answer received (Controller receives answer from host)
  socket.on('signal-answer', async ({ answer }) => {
    console.log('[Signaling] Received Answer from host');
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      // Flush queued candidates
      if (iceCandidatesQueue.length > 0) {
        for (const cand of iceCandidatesQueue) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.error('[ICE Error]', e);
          }
        }
        iceCandidatesQueue = [];
      }
    }
  });

  // ICE Candidate received
  socket.on('signal-ice', async ({ candidate }) => {
    if (!candidate) return;
    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('[ICE Error]', e);
      }
    } else {
      iceCandidatesQueue.push(candidate);
    }
  });

  // Peer disconnected
  socket.on('peer-disconnected', () => {
    console.log('[Signaling] Remote peer disconnected');
    closeActiveSession('Koneksi diputus oleh peer jarak jauh.');
  });

  // Dual-Engine Relay Listeners
  socket.on('relay-input', (msg) => {
    handleRemoteInput(msg);
  });

  socket.on('relay-frame', (data) => {
    if (!remoteImage) return;

    if (!remoteVideo.srcObject || remoteVideo.paused) {
      remoteVideo.setAttribute('hidden', '');
      remoteImage.removeAttribute('hidden');
      viewportOverlay.style.display = 'none';
      viewportOverlay.setAttribute('hidden', '');
      triggerAutoFullscreen();
    }

    const newUrl = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    remoteImage.src = newUrl;
    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
    }
    lastBlobUrl = newUrl;
  });
}

// HOST MODE LOGIC
async function setHostState(active) {
  isHostActive = active;

  if (active) {
    btnToggleHost.textContent = 'Nonaktifkan Host';
    btnToggleHost.className = 'btn btn-danger';
    hostStatusText.textContent = 'Standby (Siap Menerima Koneksi)';
    hostStatusText.style.color = '#fbbf24';
    hostDeviceIdInput.readOnly = true;
    hostPinInput.readOnly = true;
    btnRegenId.disabled = true;

    // Get display resolution
    hostDimensions = await window.api.getScreenDimensions();

    // Acquire desktop capture stream
    try {
      const sources = await window.api.getScreenSources();
      if (!sources || sources.length === 0) {
        throw new Error('No screen capture source found');
      }

      localScreenStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            minFrameRate: 30,
            maxFrameRate: 60
          }
        }
      });

      registerHostOnServer();
    } catch (err) {
      console.error('[Capture Error]', err);
      alert('Gagal mengambil tangkapan layar desktop: ' + err.message);
      setHostState(false);
    }
  } else {
    btnToggleHost.textContent = 'Aktifkan Host Standby';
    btnToggleHost.className = 'btn btn-primary';
    hostStatusText.textContent = 'Tidak Aktif';
    hostStatusText.style.color = 'inherit';
    hostDeviceIdInput.readOnly = false;
    hostPinInput.readOnly = false;
    btnRegenId.disabled = false;

    stopHostRelayStream();
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop());
      localScreenStream = null;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  }
}

function registerHostOnServer() {
  if (!socket || !socket.connected) return;

  const deviceId = hostDeviceIdInput.value.trim();
  const pin = hostPinInput.value.trim();

  socket.emit('register-host', {
    deviceId,
    deviceName: 'PC Rumah (' + deviceId + ')',
    pin
  }, (response) => {
    if (response && response.success) {
      console.log('[Host] Successfully registered on server');
    } else {
      console.error('[Host] Registration failed:', response?.error);
    }
  });
}

btnToggleHost.addEventListener('click', () => {
  if (!socket || !socket.connected) {
    alert('Harap hubungkan aplikasi ke Signaling Server terlebih dahulu.');
    return;
  }
  setHostState(!isHostActive);
});

function startHostRelayStream() {
  if (isRelayStreaming) return;
  isRelayStreaming = true;

  if (localScreenStream && hostPreviewVideo) {
    hostPreviewVideo.srcObject = localScreenStream;
    hostPreviewVideo.play().catch(e => console.error('[Host Video Play Error]', e));
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  let isEncoding = false;
  relayStreamInterval = setInterval(() => {
    if (!isRelayStreaming || isEncoding) return;
    if (!hostPreviewVideo || hostPreviewVideo.readyState < 2) return;

    try {
      isEncoding = true;
      ctx.drawImage(hostPreviewVideo, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        isEncoding = false;
        if (blob && socket && socket.connected && isRelayStreaming) {
          socket.emit('relay-frame', blob);
        }
      }, 'image/jpeg', 0.6);
    } catch (e) {
      isEncoding = false;
    }
  }, 40); // 25 FPS
}

function stopHostRelayStream() {
  isRelayStreaming = false;
  if (relayStreamInterval) {
    clearInterval(relayStreamInterval);
    relayStreamInterval = null;
  }
}

async function startHostPeerConnection(controllerSocketId) {
  startHostRelayStream();

  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Ensure screen stream tracks exist
  if (!localScreenStream || localScreenStream.getTracks().length === 0) {
    try {
      const sources = await window.api.getScreenSources();
      if (sources && sources.length > 0) {
        localScreenStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources[0].id,
              minFrameRate: 30,
              maxFrameRate: 60
            }
          }
        });
      }
    } catch (err) {
      console.error('[Host] Failed to reacquire screen stream:', err);
    }
  }

  // Add screen stream tracks
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => {
      console.log('[Host] Adding screen track:', track.kind, track.label);
      peerConnection.addTrack(track, localScreenStream);
    });
  }

  // Handle ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal-ice', {
        targetSocketId: controllerSocketId,
        candidate: event.candidate
      });
    }
  };

  // Listen for data channel created by controller
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupHostDataChannel();
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('[Host Connection State]', peerConnection.connectionState);
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      hostStatusText.textContent = 'Standby (Siap Menerima Koneksi)';
      hostStatusText.style.color = '#fbbf24';
    }
  };
}

function setupHostDataChannel() {
  if (!dataChannel) return;

  dataChannel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleRemoteInput(data);
    } catch (err) {
      console.error('[DataChannel Parse Error]', err);
    }
  };
}

function handleRemoteInput(msg) {
  switch (msg.type) {
    case 'move': {
      const x = Math.round(msg.xPercent * hostDimensions.width);
      const y = Math.round(msg.yPercent * hostDimensions.height);
      window.api.injectInput(`move ${x} ${y}`);
      break;
    }
    case 'down':
      window.api.injectInput(`down ${msg.button}`);
      break;
    case 'up':
      window.api.injectInput(`up ${msg.button}`);
      break;
    case 'wheel':
      window.api.injectInput(`wheel ${msg.delta}`);
      break;
    case 'keydown':
      if (msg.keyCode) window.api.injectInput(`keydown ${msg.keyCode}`);
      break;
    case 'keyup':
      if (msg.keyCode) window.api.injectInput(`keyup ${msg.keyCode}`);
      break;
    case 'char':
      if (msg.charCode) window.api.injectInput(`char ${msg.charCode}`);
      break;
  }
}

// VIEWER MODE LOGIC
function showConnectionFeedback(text, isError = false) {
  connectionMessage.textContent = text;
  connectionMessage.className = 'feedback-msg ' + (isError ? 'error' : 'info');
  connectionMessage.removeAttribute('hidden');
}

btnStartRemote.addEventListener('click', () => {
  const targetId = targetDeviceIdInput.value.trim();
  const pin = targetPinInput.value.trim();

  if (!socket || !socket.connected) {
    showConnectionFeedback('Signaling server belum terhubung. Periksa server URL di atas.', true);
    return;
  }

  if (!targetId || !pin) {
    showConnectionFeedback('Harap masukkan Target Device ID dan Security PIN.', true);
    return;
  }

  showConnectionFeedback('Meminta otorisasi ke server...', false);

  socket.emit('request-connect', {
    targetDeviceId: targetId,
    pin
  }, async (res) => {
    if (!res || !res.success) {
      showConnectionFeedback(res?.error || 'Gagal terhubung ke host.', true);
      return;
    }

    console.log('[Viewer] Auth successful. Connecting to host socket:', res.hostSocketId);
    showConnectionFeedback('PIN valid. Memulai pertukaran media WebRTC...', false);

    startViewerPeerConnection(res.hostSocketId, res.deviceName);
  });
});

async function startViewerPeerConnection(hostSocketId, deviceName) {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Switch UI to Live Viewport
  viewerSetupCard.setAttribute('hidden', '');
  sessionContainer.removeAttribute('hidden');
  viewportOverlay.style.display = 'flex';
  viewportOverlay.removeAttribute('hidden');
  overlayMessage.textContent = 'Menghubungkan jalur video...';
  activeTargetName.textContent = deviceName || targetDeviceIdInput.value;

  // Create DataChannel for low-latency input streaming
  dataChannel = peerConnection.createDataChannel('remote-control-input', {
    ordered: true
  });
  dataChannel.onopen = () => {
    console.log('[Viewer DataChannel] Open and ready for inputs');
    viewportWrapper.focus();
  };

  // Add video transceiver to explicitly inform offer that we are ready to receive video
  peerConnection.addTransceiver('video', { direction: 'recvonly' });

function triggerAutoFullscreen() {
  if (hasEnteredFullscreen) return;
  hasEnteredFullscreen = true;
  console.log('[Viewer] Entering auto fullscreen mode');

  setTimeout(() => {
    if (window.api && window.api.setFullscreen) {
      window.api.setFullscreen(true);
    } else if (!document.fullscreenElement && sessionContainer) {
      sessionContainer.requestFullscreen().catch(() => {});
    }
  }, 200);
}

// Receive Remote Screen Stream
  peerConnection.ontrack = (event) => {
    console.log('[Viewer] Video track received', event);
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    } else if (event.track) {
      remoteVideo.srcObject = new MediaStream([event.track]);
    }
    remoteVideo.muted = true;
    remoteVideo.play().catch(e => console.error('[Video Play Error]', e));
    viewportOverlay.style.display = 'none';
    viewportOverlay.setAttribute('hidden', '');
    triggerAutoFullscreen();
  };

  remoteVideo.onloadeddata = () => {
    viewportOverlay.style.display = 'none';
    viewportOverlay.setAttribute('hidden', '');
    triggerAutoFullscreen();
  };

  // ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal-ice', {
        targetSocketId: hostSocketId,
        candidate: event.candidate
      });
    }
  };

  // Connection State Monitor
  peerConnection.onconnectionstatechange = () => {
    console.log('[Viewer Connection State]', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      remoteImage.setAttribute('hidden', '');
      remoteVideo.removeAttribute('hidden');
    } else if (peerConnection.connectionState === 'failed') {
      console.log('[Viewer] WebRTC direct P2P unavailable. Active on WebSocket Relay.');
    }
  };

  // Measure RTT / Latency
  startLatencyMonitor();

  // Create and send WebRTC Offer with explicit video receiving enabled
  const offer = await peerConnection.createOffer({
    offerToReceiveVideo: true,
    offerToReceiveAudio: false
  });
  await peerConnection.setLocalDescription(offer);

  socket.emit('signal-offer', {
    targetSocketId: hostSocketId,
    offer
  });

  // Attach Input Listeners
  setupViewerInputCapture();
}

function startLatencyMonitor() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(async () => {
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.currentRoundTripTime !== undefined) {
          const rttMs = Math.round(report.currentRoundTripTime * 1000);
          sessionLatency.textContent = `RTT: ${rttMs} ms`;
        }
      });
    } catch (e) {}
  }, 1000);
}

function sendControl(msg) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(msg));
  } else if (socket && socket.connected) {
    socket.emit('relay-input', msg);
  }
}

function getActiveViewportRect() {
  const el = (!remoteImage.hasAttribute('hidden') && remoteImage.src) ? remoteImage : remoteVideo;
  return el.getBoundingClientRect();
}

function setupViewerInputCapture() {
  // Mouse Move
  viewportWrapper.onmousemove = (e) => {
    const rect = getActiveViewportRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      return;
    }
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    sendControl({
      type: 'move',
      xPercent,
      yPercent
    });
  };

  // Mouse Down
  viewportWrapper.onmousedown = (e) => {
    viewportWrapper.focus();
    let btn = 'left';
    if (e.button === 2) btn = 'right';
    else if (e.button === 1) btn = 'middle';

    sendControl({ type: 'down', button: btn });
  };

  // Mouse Up
  viewportWrapper.onmouseup = (e) => {
    let btn = 'left';
    if (e.button === 2) btn = 'right';
    else if (e.button === 1) btn = 'middle';

    sendControl({ type: 'up', button: btn });
  };

  // Prevent right-click context menu on remote canvas
  viewportWrapper.oncontextmenu = (e) => e.preventDefault();

  // Mouse Wheel
  viewportWrapper.onwheel = (e) => {
    const delta = e.deltaY > 0 ? -120 : 120;
    sendControl({ type: 'wheel', delta });
  };

  // Keyboard capture
  viewportWrapper.onkeydown = (e) => {
    e.preventDefault();

    if (e.key && e.key.length === 1) {
      sendControl({ type: 'char', charCode: e.key.charCodeAt(0) });
    } else {
      sendControl({ type: 'keydown', keyCode: e.keyCode });
    }
  };

  viewportWrapper.onkeyup = (e) => {
    e.preventDefault();
    sendControl({ type: 'keyup', keyCode: e.keyCode });
  };
}

// Fullscreen Toggle
btnToggleFullscreen.addEventListener('click', () => {
  const isFs = Boolean(document.fullscreenElement);
  if (window.api && window.api.setFullscreen) {
    window.api.setFullscreen(!isFs);
  } else if (!isFs) {
    sessionContainer.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Disconnect Session
function closeActiveSession(message) {
  stopHostRelayStream();

  // Restore fullscreen
  if (window.api && window.api.setFullscreen) {
    window.api.setFullscreen(false);
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  hasEnteredFullscreen = false;
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }
  if (remoteImage) {
    remoteImage.src = '';
    remoteImage.setAttribute('hidden', '');
  }
  if (remoteVideo) {
    remoteVideo.removeAttribute('hidden');
    remoteVideo.srcObject = null;
  }

  if (pingInterval) clearInterval(pingInterval);
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (dataChannel) {
    dataChannel = null;
  }
  if (socket && socket.connected) {
    socket.emit('end-session');
  }

  sessionContainer.setAttribute('hidden', '');
  viewerSetupCard.removeAttribute('hidden');

  if (message) {
    showConnectionFeedback(message, false);
  }
}

btnDisconnectSession.addEventListener('click', () => {
  closeActiveSession('Sesi remote diakhiri.');
});

// Initial boot
window.addEventListener('DOMContentLoaded', () => {
  hostDeviceIdInput.value = generateDeviceId();
  initSignalingSocket();

  // Auto-Updater Modal Popup Handlers
  const updateModal = document.getElementById('updateModal');
  const updateModalTitle = document.getElementById('updateModalTitle');
  const updateModalVersion = document.getElementById('updateModalVersion');
  const updateModalDesc = document.getElementById('updateModalDesc');
  const updateProgressContainer = document.getElementById('updateProgressContainer');
  const updateProgressBar = document.getElementById('updateProgressBar');
  const updateProgressPercent = document.getElementById('updateProgressPercent');
  const updateProgressStatus = document.getElementById('updateProgressStatus');

  const btnDismissUpdate = document.getElementById('btnDismissUpdate');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
  const btnApplyUpdate = document.getElementById('btnApplyUpdate');

  if (btnDismissUpdate) {
    btnDismissUpdate.addEventListener('click', () => {
      updateModal.setAttribute('hidden', '');
    });
  }

  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener('click', () => {
      btnDownloadUpdate.disabled = true;
      btnDownloadUpdate.textContent = 'Mengunduh...';
      updateProgressContainer.removeAttribute('hidden');
      if (window.api && window.api.startDownloadUpdate) {
        window.api.startDownloadUpdate();
      }
    });
  }

  if (btnApplyUpdate) {
    btnApplyUpdate.addEventListener('click', () => {
      if (window.api && window.api.restartForUpdate) {
        window.api.restartForUpdate();
      }
    });
  }

  if (window.api && window.api.onUpdaterEvent) {
    window.api.onUpdaterEvent((data) => {
      if (!updateModal) return;

      if (data.type === 'available') {
        updateModalVersion.textContent = `v${data.version}`;
        updateModalTitle.textContent = 'Pembaruan Baru Tersedia!';
        if (data.releaseNotes) {
          if (Array.isArray(data.releaseNotes)) {
            const notes = data.releaseNotes.map(n => (n.note || '').replace(/<[^>]*>/g, '').trim()).filter(Boolean).join('\n');
            updateModalDesc.textContent = notes || 'Pembaruan stabilitas dan peningkatan performa.';
          } else if (typeof data.releaseNotes === 'string') {
            const clean = data.releaseNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            updateModalDesc.textContent = clean || 'Pembaruan stabilitas dan peningkatan performa.';
          }
        }
        btnDownloadUpdate.removeAttribute('hidden');
        btnDownloadUpdate.disabled = false;
        btnDownloadUpdate.textContent = 'Unduh Sekarang';
        btnApplyUpdate.setAttribute('hidden', '');
        updateProgressContainer.setAttribute('hidden', '');
        updateModal.removeAttribute('hidden');
      } else if (data.type === 'progress') {
        updateProgressContainer.removeAttribute('hidden');
        updateProgressBar.style.width = `${data.percent}%`;
        updateProgressPercent.textContent = `${data.percent}%`;
        const kbps = Math.round((data.bytesPerSecond || 0) / 1024);
        updateProgressStatus.textContent = `Mengunduh... (${kbps} KB/s)`;
      } else if (data.type === 'downloaded') {
        updateProgressContainer.setAttribute('hidden', '');
        btnDownloadUpdate.setAttribute('hidden', '');
        btnApplyUpdate.removeAttribute('hidden');
        updateModalTitle.textContent = 'Pembaruan Siap Dipasang!';
        updateModalDesc.textContent = `Remote Desk v${data.version} telah selesai diunduh. Silakan restart aplikasi untuk menerapkan pembaruan.`;
        updateModal.removeAttribute('hidden');
      }
    });
  }
});
