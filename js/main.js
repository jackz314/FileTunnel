/* eslint no-unused-expressions: 0 */
'use strict';

let pc; //peer connection
let transferChannel;
let msgChannel;
let fileReader;
let isInitiator, isTransferAborted = false;
let isPcReady = false, isSignalServerConnected = false,
  isDataChannelOK = false, 
  isMsgChannelOK = false, 
  isTransferChannelOK = false;
let willKeepSending = false;
let remoteFileMetaList = [];
let allowTransfer = false, allowedTransfer = false;
let isSending = false;
let fileQueue = [];

//elements that will be used
const byterateDiv = document.querySelector('div#byterate');
const abortButton = document.querySelector('button#abortButton');
const downloadAnchor = document.querySelector('a#download');
const sendProgress = document.querySelector('progress#sendProgress');
const receiveProgress = document.querySelector('progress#receiveProgress');
const sendProgressLabel = document.getElementById('sendProgressLabel');
const receiveProgressLabel = document.getElementById('receiveProgressLabel');
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
let totalReceivedSize = 0;

let sendFileOffset = 0;
let totalSentSize = 0;

//calculate speed of transfer
let bytesPrev = 0;
let byterateMax = 0;
let timestampPrev = 0;
let timestampStart;
let statsInterval = null;
let statsIntervalAcc = null;
let sendSpeed = 0;
let receiveSpeed = 0;
let sendMaxSpeed = 0;
let receiveMaxSpeed = 0;
let sendTime = 0;
let receiveTime = 0;
let sendPrevOffset = 0;
let receivePrevSize = 0;
const byteToMB = 1048576;

//the size of the chunk of file to read at a time
const chunkSize = 16384 * 2;//todo temp

//webrtc config
let pcConfig = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'turns:numb.viagenie.ca',
      username: "jackz314college@gmail.com",
      credential: "PYxTXhf6zD4JBet"
    }
  ]
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

  if (e.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file(s)
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      // If dropped items aren't files, reject them
      const item = e.dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        console.log('file[' + i + '].name = ' + file.name);
        addToFileQueue(file);
      }else{
        console.log('dropped none file type, ignored. Kind:', item.kind);
      }
    }
  } else {
    // Use DataTransfer interface to access the file(s) if the above is not supported
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      console.log('file[' + i + '].name = ' + file.name);
      addToFileQueue(file);
    }
  }
}

fileDropZone.ondragover = function() {
  this.className = 'drop-zone drop';
  return false;
}

fileDropZone.ondragleave = function(){
  this.className = 'drop-zone';
  return false;
}

fileDropZone.onclick = () => fileInput.click()

function addToFileQueue(file) {
  if(!file){
    console.log('Invalid file');
    return;
  }
  fileQueue.push(file);
  //send over the file meta info
  console.log('file meta info: ' + file.size + ' ' + file.name);
  if(isDataChannelOK){
    sendChannelMsg('[file-meta]' + file.size + '|' + file.name);
  }else{
    console.log('added file but data channel is not established yet');
    statusText.textContent = 'Files ready, waiting for remote side to dig in...';
  }
  if(willKeepSending){//update the queue length display if is/will be uploading
    sendProgressLabel.innerHTML = 'Send (' + fileQueue.length + ')';
  }
  if(!willKeepSending && isDataChannelOK){//only manually start again when it's certain that sendFile() won't call itself again and when the connection is OK
    sendFile();
  }
}

fileInput.addEventListener('change', handleFileInputChange, false);//todo the above sendFile action will move to here

////////////////////////////////////////////////
//Socket stuff
//todo temporary method to get roomName name, update later
let tunnelCode = prompt('Enter a Tunnel code\nLeave blank to generate a random one:');
console.log('Tunnel code:' + tunnelCode);

//verify roomName name and join, if invalid name, generate a random name

if(tunnelCode === null || tunnelCode.trim() === ''){
  tunnelCode = makeRandomRoomId();
}

roomLabel.textContent = 'Tunnel code: ' + tunnelCode;

roomLabel.onclick = () => {
  //copy room code to the clipboard
  copyToClipboard(tunnelCode);
  const snackbar = document.getElementById("snackbar");
  snackbar.textContent = 'Copied TunnelCode \"' + tunnelCode + '\" to clipboard!';
  snackbar.className = 'show';//show snackbar and disappear 3 seconds later
  setTimeout(function(){ snackbar.className = snackbar.className.replace("show", ""); }, 3000);
};

let socket = io();

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
console.log('Attempted to create or join roomName', tunnelCode);


//start of socket events
socket.on('created', function(roomName) {
  console.log('Created roomName ' + roomName);
  statusText.textContent = 'Waiting for remote side to dig in';
  isInitiator = true;
});

socket.on('full', function(roomName) {
  console.log('Room ' + roomName + ' is full');
  tunnelCode = prompt('Enter another Tunnel code, this tunnel is full :(');//re-prompt if the room is taken
  socket.emit('create or join', tunnelCode);
});

socket.on('join', function (roomName){
  console.log('Another peer made a request to join roomName ' + roomName);
  console.log('This peer is the initiator of roomName ' + roomName + '!');
  isSignalServerConnected = true;
  statusText.textContent = 'Connecting...';
  createPcIfReady();
});

socket.on('joined', function(roomName) {
  console.log('joined: ' + roomName);
  isSignalServerConnected = true;
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
    if (!isInitiator /*shouldn't be initiator here (always pass), but just in case*/ && !isPcReady) {
      createPcIfReady();
    }
    pc.setRemoteDescription(new RTCSessionDescription(msg));
    createAnswer();
  } else if (msg.type === 'answer' && isPcReady) {//got answer
    console.log('got remote answer sdp');
    pc.setRemoteDescription(new RTCSessionDescription(msg));
  } else if (msg.type === 'ice' && isPcReady) {//got ice
    console.log('got remote ice');
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: msg.label,
      candidate: msg.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (msg === 'bye' && isPcReady) {//got disconnect signal, disconnect
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
    fileReader.abort();//don't disconnect yet, this is just aborting the file reading, maybe user will choose a different file
  }
  isTransferAborted = true;
  abortButton.style.display = 'none';
  sendChannelMsg('[abort]');
  console.log('Abort transfer!');
  statusText.textContent = 'Transfer aborted';
  resetTransferStuff();
});

allowTransferButton.onclick = allowTransferF;
//allowTransferButton.addEventListener('click', () => allowTransferF());

function allowTransferF(){
  allowTransferButton.style.display = 'none';//no need for later
  prepareReceiveFile();
  allowedTransfer = true;
  sendChannelMsg('[ack-file]');//notify remote side that local client is ready to receive file
  abortButton.style.display = '';//show abort btn
}

function clearStatistics() {
  totalSentSize = 0;//reset these total values after one round
  totalReceivedSize = 0;
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  byterateMax = 0;
  // bytesPrev = 0;
  // timestampPrev = 0;
}

function resetTransferStuff(){
  receiveBuffer.length = 0;//clear buffer
  fileQueue.length = 0;//clear local queue
  remoteFileMetaList.length = 0;//clear remote file queue
  abortButton.style.display = 'none';
  sendProgress.value = 0;
  sendProgress.max = 0;
  sendProgressContainer.style.display = 'none';
  receiveProgress.value = 0;
  receiveProgress.max = 0;
  receiveProgressContainer.style.display = 'none';

  //statistic stuff
  clearStatistics();
  byterateDiv.innerHTML = '';
  // statsIntervalAcc = null;
  byterateMax = 0;
  // sendSpeed = 0;
  // receiveSpeed = 0;
  // sendMaxSpeed = 0;
  // receiveMaxSpeed = 0;
  // sendTime = 0;
  // receiveTime = 0;
  // sendPrevOffset = 0;
  // receivePrevSize = 0;
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
  console.log('>>>>>>> createPcIfReady() ', isPcReady, isSignalServerConnected);
  if (!isPcReady /*&& typeof localStream !== 'undefined'/*not used for now*/ && isSignalServerConnected) {
    console.log('>>>>>> creating peer connection');
    createPc().then(result => {
      if(!result){
        console.log("Create peer connection failed.");
      }
    });
  }
}

//notify remote end to disconnect before window closes, no need to clean up local side since everything is freed by browser
window.onbeforeunload = function() {
  disconnect();
};

async function createPc() {
  try {//create peer connection
    pc = new RTCPeerConnection(pcConfig);
    console.log('Created RTCPeerConnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return false;
  }
  console.log('Created local peer connection object pc');
  //pc.addStream(localStream);//not used for now
  isPcReady = true;

//create data channels
  const transferChannelOptions = {
    priority: 'high',
    negotiated: true,
    id: 1,//manual symmetric set up
    maxPacketLifeTime: 10000//10 secs
  }
  transferChannel = pc.createDataChannel('transferChannel', transferChannelOptions);
  transferChannel.binaryType = 'arraybuffer';
  transferChannel.bufferedAmountLowThreshold = chunkSize * 125;
  console.log('Created transfer data channel');

  //set channel listeners
  transferChannel.onopen = onTransferChannelStateChange;
  transferChannel.onclose = onTransferChannelStateChange;
  transferChannel.onmessage = onReceiveFromTransferChannel;
  transferChannel.onerror = onDataChannelError;

  const msgChannelOptions = {
    priority: 'medium',
    negotiated: true,
    id: 2,//manual symmetric set up
  }
  //create msg channel, out of band approach
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
  
  return true;
}

function createOffer(){
  console.log('creating local offer, generating local sdp')
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
  console.log('Disconnecting from tunnel.');
  sendSignalMsg('bye');
  closeDataChannels();
  stopPc();
}

function stopPc() {
  isPcReady = false;
  pc.close();
  pc = null;
}

function handleRemoteDisconnect() {
  console.log('Session terminated by remote end.');
  stopPc();
  statusText.textContent = 'Remote user left, waiting for someone to join...';
  resetTransferStuff();
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
  if(fileQueue.length === 0){
    //all files transferred
    //Everything is now in the buffer, now waiting for the actual transfer to finish.
    console.log("all data buffered, waiting for transfer to finish");
    statusText.textContent = 'Waiting for remote side to finish receiving data, don\'t close the window yet';
    transferChannel.bufferedAmountLowThreshold = 0;
    transferChannel.onbufferedamountlow = () => {
      sendFileComplete();
      transferChannel.bufferedAmountLowThreshold = chunkSize * 125;
      transferChannel.onbufferedamountlow = null;
    };
    return;
  }
  isSending = true;
  const file = fileQueue[0];
  console.log(`Sending file: ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);

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
  
  statusText.textContent = 'Sending file...';
  byterateDiv.innerHTML = '';

  sendProgressLabel.textContent = 'Send (' + fileQueue.length + ')';

  prepareStatisticStuff();
  
  willKeepSending = true;

  sendProgress.max = file.size;
  sendProgressContainer.style.display = '';//hide send progress bar

  fileReader = new FileReader();
  sendFileOffset = 0;
  fileReader.addEventListener('error', error => console.error('Error reading file:', error));
  fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
  fileReader.addEventListener('load', e => {
    if(isTransferAborted){
      console.log('file transfer in progress but aborted');
      return;
    }
    // console.log('FileRead.onload ', e);
    transferChannel.send(e.target.result);
    sendFileOffset += e.target.result.byteLength;
    sendProgress.value = sendFileOffset - transferChannel.bufferedAmount;
    totalSentSize += e.target.result.byteLength;
    // console.log('send progress: ', sendFileOffset);
    // console.log('data channel buffered amount', transferChannel.bufferedAmount)
    if (sendFileOffset < file.size) {//file read is not finished, continue
      if(transferChannel.bufferedAmount >= chunkSize * 250){//too much is queued in the data channel, wait and start reading later
        // console.log('too much buffered in the data channel, waiting to read later');
        transferChannel.onbufferedamountlow = () => {//resume reading file when the queue is cleared below the threshold
          // console.log('data channel buffer cleared under threshold, continue reading');
          readSlice(sendFileOffset);//continue to read
          transferChannel.onbufferedamountlow = null;
        }
      }else{//otherwise continue normal reading and transferring
        readSlice(sendFileOffset);
      }
    }else{//file read is finished, stop this one and move on to the next
      //transfer for this file is done
      fileQueue.shift();//remove current file from queue
      transferChannel.send('[transfer_done]');//indicate transfer done
      sendFile();//continue to the next one
    }
  });
  const readSlice = offset => {
    // console.log('readSlice', offset);
    const slice = file.slice(sendFileOffset, offset + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  };
  readSlice(0);//start first
}

function sendFileComplete(){
  console.log('files sent');
  byterateDiv.innerHTML = '';
  willKeepSending = false;
  statusText.textContent = 'Transfer complete, waiting for more files.';
  abortButton.style.display = 'none';//hide abort btn
  sendProgressContainer.style.display = 'none';//hide send progress bar
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  displayFinalStatistics();
  isSending = false;
}

function prepareReceiveFile() {
  console.log('Preparing to receive file');
  receivedSize = 0;
  abortButton.style.display = '';
  //byterateMax = 0;
  downloadAnchor.textContent = '';//clear previous download info stuff
  downloadAnchor.removeAttribute('download');
  if (downloadAnchor.href) {
    URL.revokeObjectURL(downloadAnchor.href);
    downloadAnchor.removeAttribute('href');
  }
  if(remoteFileMetaList.length > 0){
    receiveProgressLabel.innerHTML = 'Receive (' + remoteFileMetaList.length + ')';
    statusText.textContent = 'Receiving file...';
    receiveProgressContainer.style.display = '';//show receive progress bar
    receiveProgress.max = remoteFileMetaList[0].size;
    prepareStatisticStuff();
  }
}

function prepareStatisticStuff(){
  console.log('preparing statistic stuff');
  timestampStart = (new Date()).getTime();
  timestampPrev = timestampStart;
  //todo temp
  statsInterval = setInterval(displayStats, 500);
  displayStats();
}

// function displayStatsSend(){
//   console.log('display stats acc');
//   sendSpeed = Math.abs((sendFileOffset - sendPrevOffset)/0.1);//bytes/sec
//   // receiveSpeed = Math.abs((receivedSize - receivePrevSize)/0.1);
//   sendTime += 0.1;//sec
//   // receiveTime += 0.1;//sec
//   if(sendSpeed > sendMaxSpeed) sendMaxSpeed = sendSpeed;
//   // if(receiveSpeed > receiveMaxSpeed) receiveMaxSpeed = receiveSpeed;
//   byterateDiv.innerHTML
//   = `Upload Speed: ${sendSpeed/byteToMB} MB/s. Average Upload Speed: ${(sendTime/sendFileOffset) / byteToMB} MB/s (max: ${sendMaxSpeed / byteToMB} MB/s)\n
//   Download Speed: ${receiveSpeed/byteToMB} MB/s. Average Download Speed: ${(receiveTime/receivedSize) / byteToMB} MB/s (max: ${receiveMaxSpeed / byteToMB} MB/s)`;
// }

// function displayStatsReceive(){
//   console.log('display stats acc');
//   // sendSpeed = Math.abs((sendFileOffset - sendPrevOffset)/0.1);//bytes/sec
//   receiveSpeed = Math.abs((receivedSize - receivePrevSize)/0.1);
//   // sendTime += 0.1;//sec
//   receiveTime += 0.1;//sec
//   // if(sendSpeed > sendMaxSpeed) sendMaxSpeed = sendSpeed;
//   if(receiveSpeed > receiveMaxSpeed) receiveMaxSpeed = receiveSpeed;
//   byterateDiv.innerHTML
//   = `Upload Speed: ${sendSpeed/byteToMB} MB/s. Average Upload Speed: ${(sendTime/sendFileOffset) / byteToMB} MB/s (max: ${sendMaxSpeed / byteToMB} MB/s)\n
//   Download Speed: ${receiveSpeed/byteToMB} MB/s. Average Download Speed: ${(receiveTime/receivedSize) / byteToMB} MB/s (max: ${receiveMaxSpeed / byteToMB} MB/s)`;
// }

function displayFinalStatistics() {
  //statistics for this file
  let totalSize = isSending ? totalSentSize : totalReceivedSize;
  const byterate = Math.round(totalSize /
    ((new Date()).getTime() - timestampStart));
  byterateDiv.innerHTML
    = `Average Speed: ${(byterate / 1024).toFixed(3)} MB/s (Max: ${(byterateMax / 1024).toFixed(3)} MB/s)\n`;
  clearStatistics();
}

function onReceiveFromTransferChannel(event) {
  if(!allowedTransfer){
    console.log('got data even though local client didn\'t accept it. Ignoring it.');
    return;
  }
  if(remoteFileMetaList.length === 0){//missing remote file meta info, should never happen
    console.log('missing file meta info, can only receive file');
    return;
  }
  if(event.data === '[transfer_done]'){//transfer of one file is complete
    console.log('File transfer complete');
    receiveProgressContainer.style.display = 'none';//hide receive progress bar
    abortButton.style.display = 'none';//hide abort btn
    if (receivedSize === remoteFileMetaList[0].size) {//verify again that we got all the content of the file
      console.log('File' + remoteFileMetaList.name + ' transfer complete');
      const received = new Blob(receiveBuffer);//todo move to stream or other things for larger files
      receiveBuffer.length = 0;//clear buffer
      receivedSize = 0;
      
      //download
      downloadAnchor.href = URL.createObjectURL(received);
      downloadAnchor.download = remoteFileMetaList[0].name;
      downloadAnchor.textContent =
        `Click to download '${remoteFileMetaList[0].name}' (${remoteFileMetaList[0].size} bytes)`;
      //downloadAnchor.style.display = 'block';//todo not dislaying for now
      downloadAnchor.click();//automatically 'click' download

      statusText.textContent = 'Transfer complete, waiting for more files.';

      remoteFileMetaList.shift();//remove the completed one, continue to the next one

      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }

      displayFinalStatistics();
    }else{
      console.log('channel signals file complete, but meta data doesn\'t match, something is wrong');
      //todo handle this
    }
  }else{
    // console.log(`Received data from transfer channel ${event.data.byteLength}`);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;
    receiveProgress.value = receivedSize;
    totalReceivedSize += event.data.byteLength;
  }
}

function onAllDataChannelReady(){
  if(fileQueue.length === 0){
    statusText.textContent = 'Connected, waiting for files';
  }else{
    statusText.textContent = 'Files ready, waiting for remote side to accept files...';
  }
  //isDataChannelOk should always be false but just in case (make sure it wasn't done)
  //send all the file info to remote if there's already files in queue
  if(!isDataChannelOK && fileQueue.length > 0){
    isDataChannelOK = true;
    console.log('data channel opened after files are loaded in, sending file infos now to remote');
    fileQueue.forEach((file, index) =>{
      console.log(index + ' - file meta info: ' + file.size + ' ' + file.name);
      sendChannelMsg('[file-meta]' + file.size + '|' + file.name);
    });
    //sendFile();
  }
  isDataChannelOK = true;
}

function onTransferChannelStateChange() {
  const readyState = transferChannel.readyState;
  console.log(`Transfer channel state is: ${readyState}`);
  //send
  if (readyState === 'open') {
    isTransferChannelOK = true;
    if(isMsgChannelOK){
      console.log('transfer channel ready after msg channel is ready');
      onAllDataChannelReady();
    }else{
      isDataChannelOK = false;
    }
  }else{
    isDataChannelOK = false;
    isTransferChannelOK = false;
  }
}

function onMsgChannelStateChange() {
  const readyState = msgChannel.readyState;
  console.log(`Msg channel state is: ${readyState}`);
  //other stuff...
  if(readyState === 'open'){
    isMsgChannelOK = true;
    if(isTransferChannelOK){
      console.log('msg channel ready after transfer channel is ready');
      onAllDataChannelReady();
    }else{
      isDataChannelOK = false;
    }
  }else{
    isDataChannelOK = false;
    isMsgChannelOK = false;
  }
}

function onDataChannelError(error){
  console.error('Error in data channel', error);
}

function onReceiveFromMsgChannel(event){
  const msg = event.data;
  console.log('received msg from msg data channel: ' + msg);
  if(msg.startsWith('[file-meta]')){//got remote side file meta info, enable accept btn to accept file transfer
    let splitterPos = msg.indexOf('|');
    console.log('file meta: size: ' + Number(msg.substring(11, splitterPos)));
    remoteFileMetaList.push({
      size: Number(msg.substring(11, splitterPos)),
      name: msg.substr(splitterPos + 1)
    });
    if(!allowedTransfer){//only show for the first time
      statusText.textContent = 'Files incoming, click accept to proceed.';
      allowTransferButton.style.display = '';//show accept button
    }else{
      prepareReceiveFile();//prepare for the next one
    }
  }else if(msg === '[ack-file]'){//remote side accepted file, start sending
    allowTransfer = true;
    sendFile();
  }else if(msg === '[abort]'){//remote end aborted file transfer
    isTransferAborted = true;
    statusText.textContent = 'Remote side aborted transfer';
    resetTransferStuff();
  }/*else if(msg === '[rcv-file]'){//remote received the file, can close window/connection now
    sendFileComplete();
  }*/
}

//get the active transport ICE Candidate Pair that transports the data
async function getTransportCandidatePair(){
  if (pc && pc.iceConnectionState === 'connected') {
    const stats = await pc.getStats();
    let pair;
    stats.forEach(report => {
      if (report.type === 'transport') {
        pair = stats.get(report.selectedCandidatePairId);
      }
    });
    return pair;
  }else return null;
}

// display byterate statistics.
async function displayStats() {
  // console.log('displaying stats');
  let activeCandidatePair = await getTransportCandidatePair();
  if (activeCandidatePair) {
    if (timestampPrev === activeCandidatePair.timestamp) {
      return;
    }
    // calculate current byterate
    const bytesNow = isSending ? sendFileOffset - transferChannel.bufferedAmount : activeCandidatePair.bytesReceived;
    const byterate = Math.round((bytesNow - bytesPrev)/
      (activeCandidatePair.timestamp - timestampPrev));
    byterateDiv.innerHTML = `Current Speed: ${(byterate / 1024).toFixed(3)} MB/s`;
    timestampPrev = activeCandidatePair.timestamp;
    bytesPrev = bytesNow;
    if (byterate > byterateMax) {
      byterateMax = byterate;
    }
  }else{
    console.log("ice cand. pair is null");
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
/*
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
}*/
