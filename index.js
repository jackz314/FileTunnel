'use strict';

const os = require('os');
const nodeStatic = require('node-static');
const http = require('http');
const socketIO = require('socket.io');

const fileServer = new(nodeStatic.Server)();

const PORT = process.env.PORT || 8080;

const app = http.createServer(function(req, res) {
  //nocache(res);
  fileServer.serve(req, res);
}).listen(PORT);

console.log("Server listening on port " + PORT);

// function nocache (res) {
//   res.setHeader('Surrogate-Control', 'no-store')
//   res.setHeader('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');  res.setHeader('Pragma', 'no-cache')
//   res.setHeader('Expires', '0')
// }

let io = socketIO(app);
io.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    let array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
    console.log(arguments);
  }

  socket.on('msg', function(message) {
    log('Client said: ', message);
    const roomCode = Object.keys(io.sockets.adapter.sids[socket.id])[0];
    socket.to(roomCode).emit('msg', message);//send to id belonged room (tunnel)
    ;
    });

  socket.on('create or join', function(room) {
    log('Received request to create or join room ' + room);

    let clientsInRoom = io.sockets.adapter.rooms[room];
    let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    log('Room ' + room + ' now has ' + numClients + ' client(s)');

    if (numClients === 0) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);

    } else if (numClients === 1) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
    } else { // max two clients
      socket.emit('full', room);
    }
  });

  socket.on('ipaddr', function() {
    let ifaces = os.networkInterfaces();
    for (let dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('bye', function(){
    console.log('received bye');
  });

});
