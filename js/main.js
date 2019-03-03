/* eslint no-unused-expressions: 0 */
/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
'use strict';

let pc;
let transferChannel;
let msgChannel;
let fileReader;
let isInitiator;
let isPcOK = false, isBaseConnectionOK = false, isDataChannelOK = false;
let willKeepSending = false;
let remoteFileMetaList = new Array();
let allowTransfer = false, allowedTransfer = false;
let fileQueue = new Array();

//elements that will be used
const byterateDiv = document.querySelector('div#byterate');
const abortButton = document.querySelector('button#abortButton');
const downloadAnchor = document.querySelector('a#download');
const sendProgress = document.querySelector('progress#sendProgress');
const receiveProgress = document.querySelector('progress#receiveProgress');
const sendCountProgress = document.getElementById('sendCountProgress');
const receiveCountProgress = document.getElementById('receiveCountProgress');
const sendProgressContainer = document.getElementById('sendProgressContainer');
const receiveProgressContainer = document.getElementById('receiveProgressContainer');
const sendFileButton = document.querySelector('button#sendFile');
const allowTransferButton = document.querySelector('button#allowButton');
const roomLabel = document.querySelector('a#roomLabel');
const fileDropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');
const statusText = document.getElementById('status-text');

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

//drop file features
fileDropZone.ondrop = function(e) {
  e.preventDefault();
  this.className = 'drop-zone';

  if (ev.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file(s)
    for (var i = 0; i < ev.dataTransfer.items.length; i++) {
      // If dropped items aren't files, reject them
      if (ev.dataTransfer.items[i].kind === 'file') {
        const file = ev.dataTransfer.items[i].getAsFile();
        console.log('file[' + i + '].name = ' + file.name);
        addToFileQueue(file);
      }else{
        console.log('selected none files, ignoring them', ev.dataTransfer.items[i].kind);
      }
    }
  } else {
    // Use DataTransfer interface to access the file(s) if the above is not supported
    for (var i = 0; i < ev.dataTransfer.files.length; i++) {
      console.log('file[' + i + '].name = ' + ev.dataTransfer.files[i].name);
      addToFileQueue(file);
    }
  }
}

fileDropZone.ondragover = function() {
  this.className = 'drop-zone drop';
  return false;
}

fileDropZone.ondragleave = function() {
  this.className = 'drop-zone';
  return false;
}

fileDropZone.onclick = function() {
  fileInput.click();
}

function addToFileQueue(file) {
  if(!file){
    console.log('Invalid file');
    return;
  }
  fileQueue.push(file);
  //send over the file meta info
  console.log('file meta info: ' + file.size + ' ' + file.name);
  sendChannelMsg('[file-meta]' + file.size + '|' + file.name);
  if(!willKeepSending && isDataChannelOK){//only manually start again when it's certain that sendFile() won't call itself again and when the connection is OK
    sendFile();
  }
}

fileInput.addEventListener('change', handleFileInputChange, false);//todo the above sendFile action will move to here

////////////////////////////////////////////////
//Socket stuff
//todo temporary method to get roomName name, update later
let tunnelCode = prompt('Enter a Tunnel code:');
console.log('Tunnel code:' + tunnelCode);

//verify roomName name and join, if invalid name, generate a random name

if(tunnelCode === null || tunnelCode.trim() === ''){
  tunnelCode = makeRandomRoomId();
}

roomLabel.textContent = 'Tunnel code: ' + tunnelCode;

roomLabel.onclick = function(){
  copyToClipboard(tunnelCode);
  const snackbar = document.getElementById("snackbar");
  snackbar.textContent = 'Copied TunnelCode \"' + tunnelCode + '\" to clipboard!';
  snackbar.className = 'show';//show snackbar and disappear 3 seconds later
  setTimeout(function(){ snackbar.className = snackbar.className.replace("show", ""); }, 3000);
};

let socket = io.connect();

function copyToClipboard(str) {
  const el = document.createElement('textarea');
  el.value = str;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function makeRandomRoomId() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 6; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

socket.emit('create or join', tunnelCode);
console.log('Attempted to create or  join roomName', tunnelCode);


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
  isBaseConnectionOK = true;
  statusText.textContent = 'Connecting...';
  createPcIfReady();
});

socket.on('joined', function(roomName) {
  console.log('joined: ' + roomName);
  isBaseConnectionOK = true;
  isInitiator = false;
  statusText.textContent = 'Connecting...';
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

// receives message via signaling method
socket.on('msg', function(msg) {
  console.log('Client received message:', msg);
  if (msg === 'mediaStreamReady') {//remote media stream ready, for the future
    createPcIfReady();
  } else if (msg.type === 'offer') {//got offer
    console.log('got remote offer sdp');
    if (!isInitiator /*shouldn't be initiator here (always pass), but just in case*/ && !isPcOK) {
      createPcIfReady();
    }
    pc.setRemoteDescription(new RTCSessionDescription(msg));
    createAnswer();
  } else if (msg.type === 'answer' && isPcOK) {//got answer
    console.log('got remote answer sdp');
    pc.setRemoteDescription(new RTCSessionDescription(msg));
  } else if (msg.type === 'ice' && isPcOK) {//got ice
    console.log('got remote ice');
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: msg.label,
      candidate: msg.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (msg === 'bye' && isPcOK) {//got disconnect signal, disconnect
    handleRemoteDisconnect();
  }
});

//send message via signaling method
function sendSignalMsg(msg) {
  console.log('Client sending message: ', msg);
  socket.emit('msg', msg);
}
//end of socket events
////////////////////////////////////////////////

//sendFileButton.addEventListener('click', () => sendFile());//todo temporary, will be automatic later, this is for easier debugging
abortButton.addEventListener('click', () => {
  if (fileReader && fileReader.readyState === 1) {
    console.log('Abort read!');
    fileReader.abort();//don't disconnect yet, this is just aborting the file reading, maybe user will choose a different file
  }
});

allowTransferButton.onclick = allowTransferF;
//allowTransferButton.addEventListener('click', () => allowTransferF());

function allowTransferF(){
  allowTransferButton.style.display = 'none';//no need for later
  prepareReceiveFile();
  allowedTransfer = true;
  sendChannelMsg('ack-file');//notify remote side that local client is ready to receive file
  abortButton.style.display = '';//show abort btn
}

async function handleFileInputChange() {
  let fileList = fileInput.files;
  if(fileList.length < 1 || !fileList[0]){
    alert('No file chosen');
    console.log('No file chosen');
  }else{
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      console.log('file[' + i + '].name = ' + file.name);
      addToFileQueue(file);
    } 
  }
}

//start creating peer connection if everything is ready
function createPcIfReady() {
  console.log('>>>>>>> createPcIfReady() ', isPcOK, isBaseConnectionOK);
  if (!isPcOK /*&& typeof localStream !== 'undefined'/*not used for now*/ && isBaseConnectionOK) {
    console.log('>>>>>> creating peer connection');
    createPc();
  }
}

//notify remote end to disconnect before window closes, no need to clean up local side since everything is freed by browser
window.onbeforeunload = function() {
  sendSignalMsg('bye');
};

async function createPc() {
  try {//create peer connection
    pc = new RTCPeerConnection();
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
  console.log('Created local peer connection object pc');
  //pc.addStream(localStream);//not used for now
  isPcOK = true;

//create data channels
  const transferChannelOptions = {
    priority: 'high',
    negotiated: false,
    id: 101,//manual symmetric set up
    maxPacketLifeTime: 10000//10 secs
  }
  transferChannel = pc.createDataChannel('transferChannel', transferChannelOptions);
  transferChannel.binaryType = 'arraybuffer';
  console.log('Created transfer data channel');

  //set channel listeners
  transferChannel.onopen = onTransferChannelStateChange;
  transferChannel.onclose = onTransferChannelStateChange;
  transferChannel.onmessage = onReceiveFromTransferChannel;
  transferChannel.onerror = onDataChannelError;

  const msgChannelOptions = {
    priority: 'medium',
    negotiated: false,
    id: 102,//manual symmetric set up
  }
  //create msg channel
  msgChannel = pc.createDataChannel('msgChannel', msgChannelOptions);

  //listeners
  msgChannel.onopen = onMsgChannelStateChange;
  msgChannel.onclose = onMsgChannelStateChange;
  msgChannel.onmessage = onReceiveFromMsgChannel;
  msgChannel.onerror = onDataChannelError;
  console.log('Created msg data channel');

  console.log('isInitiator:', isInitiator);
  if (isInitiator) {
    createOffer();
  }

  //set peer connection listeners
  pc.addEventListener('icecandidate', onLocalIce);
  pc.onaddstream = handleRemoteStreamAdded;
  pc.onremovestream = handleRemoteStreamRemoved;
}

function createOffer(){
  console.log('creating local offer sdp')
  pc.createOffer(setAndSendLocalSdp, onCreateOfferError);
}

function createAnswer() {
  console.log('creating local answer');
  pc.createAnswer(setAndSendLocalSdp, onCreateSdpError);
}

function setAndSendLocalSdp(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('set local sdp and sending to remote', sessionDescription);
  sendSignalMsg(sessionDescription);
}

function onCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function onCreateSdpError(error) {
  trace('Failed to create sdp: ' + error.toString());
}

function onLocalIce(iceContent) {
  console.log('Local ICE candidate: ', event.candidate);
  console.log('icecandidate event: ', iceContent);
  if (iceContent.candidate) {
    //send local ice to remote
    sendSignalMsg({
      type: 'ice',
      label: iceContent.candidate.sdpMLineIndex,
      id: iceContent.candidate.sdpMid,
      candidate: iceContent.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

// function requestTurn(turnURL) {
//   var turnExists = false;
//   for (var i in pcConfig.iceServers) {
//     if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
//       turnExists = true;
//       turnReady = true;
//       break;
//     }
//   }
//   if (!turnExists) {
//     console.log('Getting TURN server from ', turnURL);
//     // No TURN server. Get one from computeengineondemand.appspot.com:
//     var xhr = new XMLHttpRequest();
//     xhr.onreadystatechange = function() {
//       if (xhr.readyState === 4 && xhr.status === 200) {
//         var turnServer = JSON.parse(xhr.responseText);
//         console.log('Got TURN server: ', turnServer);
//         pcConfig.iceServers.push({
//           'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
//           'credential': turnServer.password
//         });
//         turnReady = true;
//       }
//     };
//     xhr.open('GET', turnURL, true);
//     xhr.send();
//   }
// }

function disconnect() {
  console.log('Hanging up.');
  sendSignalMsg('bye');
  closeDataChannels();
  stopPc();
}

function stopPc() {
  isPcOK = false;
  pc.close();
  pc = null;
}

function handleRemoteDisconnect() {
  console.log('Session terminated by remote end.');
  stopPc();
}

function sendChannelMsg(msg){
  console.log('Sending data channel msg: ' + msg);
  if(isDataChannelOK){
    msgChannel.send(msg);
  }else{
    console.log('Data channel is not open, can\'t send msg now');
  }
}

function sendFile() {
  if(fileQueue.length == 0){
    //all files transferred
    postSendFile();
    return;
  }
  const file = fileQueue[0];
  console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);

  // Handle 0 size files.
  if (file.size === 0) {
    statusText.textContent = 'File is empty, please select a non-empty file';
    console.log('selected file is empty');
    fileQueue.shift();//skip to the next one
    sendFile();
    return;
  }

  //for the very first time, this won't be true, but the following file transfers could be
  if(allowTransfer){
    console.log('start transferring');
    //set btn states
    abortButton.style.display = '';//show cancel button
    sendFileButton.disabled = true;
  }else{
    console.log('remote side didn\'t allow transfer yet, waiting for remote permission...');
    statusText.textContent = 'Files ready, waiting for remote side to accept files...';
    willKeepSending = false;
    return;
  }
  
  statusText.textContent = 'Sending file';

  prepareStatisticStuff();
  
  willKeepSending = true;

  sendProgress.max = file.size;
  sendProgress.style.display = '';//hide send progress bar

  const chunkSize = 16384 * 2;//todo temp
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
    }else{
      //transfer for this file is done, remove this one and continue to the next one
      fileQueue.shift();
      transferChannel.send('transfer_done');
      sendFile();
    }
  });
  const readSlice = o => {
    console.log('readSlice ', o);
    const slice = file.slice(offset, o + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  };
  readSlice(0);//start first
}

function postSendFile(){
  console.log('post send file');
  byterateDiv.innerHTML = '';
  willKeepSending = false;
  statusText.textContent = 'Transfer complete, waiting for more files.';
  abortButton.style.display = 'none';//hide abort btn
  sendProgress.style.display = 'none';//hide send progress bar
}

function prepareReceiveFile() {
  console.log('Preparing to receive file');
  receivedSize = 0;
  //byterateMax = 0;
  downloadAnchor.textContent = '';//clear previous download info stuff
  downloadAnchor.removeAttribute('download');
  if (downloadAnchor.href) {
    URL.revokeObjectURL(downloadAnchor.href);
    downloadAnchor.removeAttribute('href');
  }
  if(remoteFileMetaList.length > 0){
    receiveProgress.style.display = '';//show receive progress bar
    receiveProgress.max = remoteFileMetaList[0].size;
    prepareStatisticStuff();
  }
}

function prepareStatisticStuff(){
  timestampStart = (new Date()).getTime();
  timestampPrev = timestampStart;
  statsInterval = setInterval(displayStats, 500);
  displayStats();
}

function onReceiveFromTransferChannel(event) {
  if(!allowedTransfer){
    console.log('got data even though local client didn\'t accept it. Ignoring it.');
    return;
  }
  if(remoteFileMetaList.length == 0){//missing remote file meta info, should never happen
    console.log('missing file meta info, can only receive file');
    return;
  }
  if(event.data === 'transfer_done'){//transfer of one file is complete
    console.log('File transfer complete');
    receiveProgress.style.display = 'none';//show receive progress bar
    abortButton.style.display = 'none';//hide abort btn
    if (receivedSize === remoteFileMetaList[0].size) {//verify again that we got all the content of the file
      console.log('File' + remoteFileMetaList.name + ' transfer complete');
      const received = new Blob(receiveBuffer);//todo move to stream or other things for larger files
      receiveBuffer = [];//clear buffer
      
      //download
      downloadAnchor.href = URL.createObjectURL(received);
      downloadAnchor.download = remoteFileMetaList[0].name;
      downloadAnchor.textContent =
        `Click to download '${remoteFileMetaList[0].name}' (${remoteFileMetaList[0].size} bytes)`;
      downloadAnchor.style.display = 'block';
      downloadAnchor.click();//automatically 'click' download

      statusText.textContent = 'Transfer complete, waiting for more files.';

      remoteFileMetaList.shift();//remove the completed one, continue to the next one

      //statistics for this file
      const byterate = Math.round(receivedSize /
        ((new Date()).getTime() - timestampStart));
      byterateDiv.innerHTML
        = `Average Speed: ${byterate / 1000} MB/s (max: ${byterateMax / 1000} MB/s)\n`;
      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }
      prepareReceiveFile();//prepare for the next one
    }else{
      console.log('channel signals file complete, but meta data doesn\'t match, something is wrong');
      //todo handle this
    }
  }else{
    console.log(`Received data from transfer channel ${event.data.byteLength}`);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;
    receiveProgress.value = receivedSize;
  }
}

function onTransferChannelStateChange() {
  const readyState = transferChannel.readyState;
  console.log(`Send channel state is: ${readyState}`);
  //send
  if (readyState === 'open') {
    if(msgChannel.readyState === 'open'){
      statusText.textContent = 'Connected, waiting for files';
      isDataChannelOK = true;
    }
    sendFile();//todo may need update
  }else{
    isDataChannelOK = false;
  }
}

function onMsgChannelStateChange() {
  const readyState = msgChannel.readyState;
  console.log(`Msg channel state is: ${readyState}`);
  //other stuff...
  if(transferChannel.readyState === 'open'){
    statusText.textContent = 'Connected, waiting for files';
    isDataChannelOK = true;
  }else{
    isDataChannelOK = false;
  }
}

function onDataChannelError(error){
  console.error('Error in data channel', error);
}

function onReceiveFromMsgChannel(event){
  const msg = event.data;
  console.log('recieved msg from msg data channel: ' + msg);
  if(msg.startsWith('[file-meta]')){//got remote side file meta info, enable accept btn to accept file transfer
    let spliterPos = msg.indexOf('|');
    console.log('file meta: size: ' + Number(msg.substring(11, spliterPos)));
    remoteFileMetaList.push({
      size: Number(msg.substring(11, spliterPos)),
      name: msg.substr(spliterPos + 1)
    });
    statusText.textContent = 'Files incoming, click accept to proceed.';
    allowTransferButton.style.display = '';//show accept button
  }else if(msg === 'ack-file'){//remote side accepted file, start sending
    allowTransfer = true;
    sendFile();
  }
}

// display byterate statistics.
async function displayStats() {
  if (pc && pc.iceConnectionState === 'connected') {
    const stats = await pc.getStats();
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
      byterateDiv.innerHTML = `Current Speed: ${byterate / 1000} MB/s`;
      timestampPrev = activeCandidatePair.timestamp;
      bytesPrev = bytesNow;
      if (byterate > byterateMax) {
        byterateMax = byterate;
      }
    }
  }
}

function closeDataChannels() {
  console.log('Closing data channels');
  transferChannel.close();
  console.log(`Closed data channel with label: ${transferChannel.label}`);
  pc.close();
  pc = null;
  console.log('Closed peer connection');
}

/////////////////////////////////////////
//for the future
//gets local user media and signals gotStream
function getLocalMedia(){
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
  })
  .then(gotLocalStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });
}

function gotLocalStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendSignalMsg('got user media');
  if (isInitiator) {
    maybeStart();
  }
}