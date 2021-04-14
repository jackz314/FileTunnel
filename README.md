# FileTunnel

### Now live at [filetunnel.appspot.com](https://filetunnel.appspot.com/)

FileTunnel - 2019 HackMerced IV

---

A website that does Peer to Peer file sharing based on [WebRTC](https://webrtc.org/).

Enter a same `TunnelCode` with someone else to connect and share files both ways freely.

### Features

* Duplex p2p file sharing
* Batch transfer
* Connection/Transfer statistics display

## Inspiration
Sharing files is one of the most annoying tasks in my daily life. There's almost always a difference between platforms, devices, and locations, which usually makes the whole thing very difficult and inefficient. So I came up with this idea to hopefully make this process easier, without the limitations and profit models of server-based applications. (and privacy, if that counts)

## What it does
It allows simpler file sharing with people regardless of platform or distance and works across almost all the recent devices and systems.

## How I built it
Basically, I started with [WebRTC](https://webrtc.org/) SDKs, then the Node.JS based Socket.IO server structure (for signaling) , and final deployment on the [Google Cloud Platform](https://cloud.google.com/)
Specifically for the transferring part, there are several stages including the file transfer, queuing, and verification.

## Challenges I ran into
Setting up the basic WebRTC connection on top of the signaling service, especially the whole connection set up process and verification took me a long time. 
Just for reference, the whole process looks kind of like this:
![alt text](https://www.w3.org/TR/webrtc/images/ladder-2party-simple.svg "WebRTC "Simple" Call Flow")
Besides that, it's probably trying to keep track of the file queues on both clients, it's really easy to mess something up here and there on this thing.

## Accomplishments that I'm proud of
It's probably my first successful connection setup, see the above point.
I'm also kind of proud that I set up the project quite easily on GCP, this was my most concerned thing before doing this.

## What I learned
Basically everything I did in this project is new to me, WebRTC, Node.JS, and just general Web development, I've never done this before

## What's next for FileTunnel
* Stability improvement, connection imporvement (p2p is blocked in some scenarios, which would require [TURN](https://en.wikipedia.org/wiki/Traversal_Using_Relays_around_NAT))
* Login feature to keep track of everything (database on the backend)
* Multiparty (more than two) sharing with three possible implementation
  + mesh network that spreads across devices (still p2p)
  + "STAR" configuration with one fastest device act as 'server' (still p2p)
  + optional media servers to aid the performance (not completely p2p)
* Maybe video/audio calls while transferring files to make it more fun
* Use faster file loading/writing APIs/libraries
* UI improvement
* Live chat (corporated with login feature)
