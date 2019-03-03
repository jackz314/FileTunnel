/* eslint no-unused-expressions: 0 */
/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
'use strict';

let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;
let fileReader;

//elements that will be used
const byterateDiv = document.querySelector('div#byterate');
const fileInput = document.querySelector('input#fileInput');
const abortButton = document.querySelector('button#abortButton');
const downloadAnchor = document.querySelector('a#download');
const sendProgress = document.querySelector('progress#sendProgress');
const receiveProgress = document.querySelector('progress#receiveProgress');
const statusMessage = document.querySelector('span#status');
const sendFileButton = document.querySelector('button#sendFile');

let receiveBuffer = [];
let receivedSize = 0;

//calculate speed of transfer
let bytesPrev = 0;
let timestampPrev = 0;
let timestampStart;
let statsInterval = null;
let byterateMax = 0;

//webrtc config
let pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
// For future call functions, not needed for now
let sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

////////////////////////////////////////////////
//Socked stuff
//todo temporary method to get roomName name, update later
let roomName = prompt('Enter a fancy code name:');

let socket = io.connect();

//verify roomName name and join
if (roomName !== '') {
  socket.emit('create or join', roomName);
  console.log('Attempted to create or  join roomName', roomName);
}

//start of socket events
socket.on('created', function(roomName) {
  console.log('Created roomName ' + roomName);
  isInitiator = true;
});

socket.on('full', function(roomName) {
  console.log('Room ' + roomName + ' is full');
});

socket.on('join', function (roomName){
  console.log('Another peer made a request to join roomName ' + roomName);
  console.log('This peer is the initiator of roomName ' + roomName + '!');
  isChannelReady = true;
});

socket.on('joined', function(roomName) {
  console.log('joined: ' + roomName);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

// receives message via signaling method
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isPeerConnectionStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isPeerConnectionStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isPeerConnectionStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isPeerConnectionStarted) {
    handleRemoteHangup();
  }
});

//send message via signaling method
function sendSignalMsg(msg) {
  console.log('Client sending message: ', msg);
  socket.emit('message', msg);
}
//end of socket events
////////////////////////////////////////////////

sendFileButton.addEventListener('click', () => createPeerConnection());
fileInput.addEventListener('change', handleFileInputChange, false);
abortButton.addEventListener('click', () => {
  if (fileReader && fileReader.readyState === 1) {
    console.log('Abort read!');
    fileReader.abort();
  }
});

async function handleFileInputChange() {
  let file = fileInput.files[0];
  if (!file) {
    alert('No file chosen');
    console.log('No file chosen');
  } else {
    sendFileButton.disabled = false;
  }
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isPeerConnectionStarted, localStream, isChannelReady);
  if (!isPeerConnectionStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isPeerConnectionStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

async function createPeerConnection() {
  abortButton.disabled = false;
  sendFileButton.disabled = true;
  localConnection = new RTCPeerConnection();
  console.log('Created local peer connection object localConnection');

  transferChannel = localConnection.createDataChannel('sendDataChannel');
  transferChannel.binaryType = 'arraybuffer';
  console.log('Created send data channel');

  transferChannel.addEventListener('open', onTransferChannelStateChange);
  transferChannel.addEventListener('close', onTransferChannelStateChange);
  transferChannel.addEventListener('error', error => console.error('Error in sendChannel:', error));

  localConnection.addEventListener('icecandidate', async event => {
    console.log('Local ICE candidate: ', event.candidate);
    await remoteConnection.addIceCandidate(event.candidate);
  });

  remoteConnection = new RTCPeerConnection();
  console.log('Created remote peer connection object remoteConnection');

  remoteConnection.addEventListener('icecandidate', async event => {
    console.log('Remote ICE candidate: ', event.candidate);
    await localConnection.addIceCandidate(event.candidate);
  });
  remoteConnection.addEventListener('datachannel', receiveChannelCallback);

  try {
    const offer = await localConnection.createOffer();
    await gotLocalDescription(offer);
  } catch (e) {
    console.log('Failed to create session description: ', e);
  }

}

function sendData() {
  const file = fileInput.files[0];
  console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);

  // Handle 0 size files.
  statusMessage.textContent = '';
  downloadAnchor.textContent = '';
  if (file.size === 0) {
    byterateDiv.innerHTML = '';
    statusMessage.textContent = 'File is empty, please select a non-empty file';
    closeDataChannels();
    return;
  }
  sendProgress.max = file.size;
  receiveProgress.max = file.size;
  const chunkSize = 16384;
  fileReader = new FileReader();
  let offset = 0;
  fileReader.addEventListener('error', error => console.error('Error reading file:', error));
  fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
  fileReader.addEventListener('load', e => {
    console.log('FileRead.onload ', e);
    transferChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    sendProgress.value = offset;
    if (offset < file.size) {
      readSlice(offset);
    }
  });
  const readSlice = o => {
    console.log('readSlice ', o);
    const slice = file.slice(offset, o + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  };
  readSlice(0);
}

function closeDataChannels() {
  console.log('Closing data channels');
  transferChannel.close();
  console.log(`Closed data channel with label: ${transferChannel.label}`);
  if (receiveChannel) {
    receiveChannel.close();
    console.log(`Closed data channel with label: ${receiveChannel.label}`);
  }
  localConnection.close();
  remoteConnection.close();
  localConnection = null;
  remoteConnection = null;
  console.log('Closed peer connections');

  // re-enable the file select
  fileInput.disabled = false;
  abortButton.disabled = true;
  sendFileButton.disabled = false;
}

async function gotLocalDescription(desc) {
  await localConnection.setLocalDescription(desc);
  console.log(`Offer from localConnection\n ${desc.sdp}`);
  await remoteConnection.setRemoteDescription(desc);
  try {
    const answer = await remoteConnection.createAnswer();
    await gotRemoteDescription(answer);
  } catch (e) {
    console.log('Failed to create session description: ', e);
  }
}

async function gotRemoteDescription(desc) {
  await remoteConnection.setLocalDescription(desc);
  console.log(`Answer from remoteConnection\n ${desc.sdp}`);
  await localConnection.setRemoteDescription(desc);
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.binaryType = 'arraybuffer';
  receiveChannel.onmessage = onReceiveFromTransferChannel;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;

  receivedSize = 0;
  byterateMax = 0;
  downloadAnchor.textContent = '';
  downloadAnchor.removeAttribute('download');
  if (downloadAnchor.href) {
    URL.revokeObjectURL(downloadAnchor.href);
    downloadAnchor.removeAttribute('href');
  }
}

function onReceiveFromTransferChannel(event) {
  console.log(`Received Message ${event.data.byteLength}`);
  receiveBuffer.push(event.data);
  receivedSize += event.data.byteLength;

  receiveProgress.value = receivedSize;

  // we are assuming that our signaling protocol told
  // about the expected file size (and name, hash, etc).
  const file = fileInput.files[0];
  if (receivedSize === file.size) {
    const received = new Blob(receiveBuffer);
    receiveBuffer = [];

    downloadAnchor.href = URL.createObjectURL(received);
    downloadAnchor.download = file.name;
    downloadAnchor.textContent =
      `Click to download '${file.name}' (${file.size} bytes)`;
    downloadAnchor.style.display = 'block';

    const byterate = Math.round(receivedSize /
      ((new Date()).getTime() - timestampStart));
    byterateDiv.innerHTML
      = `<strong>Average Speed:</strong> ${byterate / 1000} MB/s (max: ${byterateMax / 1000} MB/s)`;

    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }

    closeDataChannels();
  }
}

function onTransferChannelStateChange() {
  const readyState = transferChannel.readyState;
  console.log(`Send channel state is: ${readyState}`);
  if (readyState === 'open') {
    sendData();
  }
}

async function onReceiveChannelStateChange() {
  const readyState = receiveChannel.readyState;
  console.log(`Receive channel state is: ${readyState}`);
  if (readyState === 'open') {
    timestampStart = (new Date()).getTime();
    timestampPrev = timestampStart;
    statsInterval = setInterval(displayStats, 500);
    await displayStats();
  }
}

// display byterate statistics.
async function displayStats() {
  if (remoteConnection && remoteConnection.iceConnectionState === 'connected') {
    const stats = await remoteConnection.getStats();
    let activeCandidatePair;
    stats.forEach(report => {
      if (report.type === 'transport') {
        activeCandidatePair = stats.get(report.selectedCandidatePairId);
      }
    });
    if (activeCandidatePair) {
      if (timestampPrev === activeCandidatePair.timestamp) {
        return;
      }
      // calculate current byterate
      const bytesNow = activeCandidatePair.bytesReceived;
      const byterate = Math.round((bytesNow - bytesPrev)/
        (activeCandidatePair.timestamp - timestampPrev));
      byterateDiv.innerHTML = `<strong>Current Bitrate:</strong> ${byterate / 1000} MB/s`;
      timestampPrev = activeCandidatePair.timestamp;
      bytesPrev = bytesNow;
      if (byterate > byterateMax) {
        byterateMax = byterate;
      }
    }
  }
}

//gets local user media and signals gotStream
function getLocalMedia(){
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
  })
  .then(gotStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });
}
