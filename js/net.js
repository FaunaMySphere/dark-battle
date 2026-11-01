// Dark Battle multiplayer — same serverless stack as FaunaMySphere:
//  1) PeerJS (public broker, WebRTC data channels), star topology: whoever grabs the fixed
//     host id relays for everyone; if the host leaves, a client re-claims the id.
//  2) Nostr public relays (ephemeral events) as a parallel/fallback transport, so players
//     whose WebRTC can't connect (strict NAT, no TURN) still share the world.
// Messages are deduped per sender by sequence number, so both transports can run at once.
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const KIND = 20428; // ephemeral (20000-29999): relays forward but don't store
const NOSTR_FLUSH_MS = 380;

export class Net {
  constructor(room) {
    this.room = room;
    this.topic = 'darkbattle-' + room;
    this.hostId = 'darkbattle-' + room + '-host';
    this.id = (() => {
      try {
        let v = localStorage.getItem('db_id');
        if (!/^p[a-z0-9]{6,12}$/.test(v || '')) { v = 'p' + Math.random().toString(36).slice(2, 10); localStorage.setItem('db_id', v); }
        return v;
      } catch (_) { return 'p' + Math.random().toString(36).slice(2, 10); }
    })();
    this.seq = 0; this.sess = Math.random().toString(36).slice(2, 7);
    this.handlers = [];
    this.lastSeq = new Map();   // sender -> last seq seen
    this.peer = null; this.isHost = false; this.hostConn = null; this.conns = new Set();
    this.socks = []; this.relayUp = 0; this.sk = null;
    this.nostrQ = []; this.nostrLatest = new Map(); // keyed latest-only messages (state)
    this.p2pUp = false; this.stopped = false;
  }
  get online() { return this.p2pUp || this.relayUp > 0; }
  on(fn) { this.handlers.push(fn); }
  start() {
    this.startRelays();
    this.startPeer();
    setInterval(() => this.flushNostr(), NOSTR_FLUSH_MS);
    setInterval(() => this.heal(), 7000);
  }
  // ---- outgoing ----
  // key: if set, only the latest message with this key is sent on the (rate-limited) relay path
  send(m, key) {
    m.f = this.id; m.n = this.sess; m.s = ++this.seq;
    const raw = JSON.stringify(m);
    if (this.isHost) { for (const c of this.conns) if (c.open) try { c.send(raw); } catch (_) {} }
    else if (this.hostConn && this.hostConn.open) try { this.hostConn.send(raw); } catch (_) {}
    if (key) this.nostrLatest.set(key, m); else this.nostrQ.push(m);
  }
  flushNostr() {
    if (!this.relayUp || !window.NostrTools) { this.nostrQ.length = 0; return; }
    const batch = this.nostrQ.splice(0, 40);
    for (const m of this.nostrLatest.values()) batch.push(m);
    this.nostrLatest.clear();
    if (!batch.length) return;
    let ev;
    try {
      ev = NostrTools.finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['t', this.topic]], content: JSON.stringify({ b: batch }) }, this.sk);
    } catch (_) { return; }
    const frame = JSON.stringify(['EVENT', ev]);
    for (const w of this.socks) if (w.readyState === 1) try { w.send(frame); } catch (_) {}
  }
  // ---- incoming ----
  deliver(m, viaHostRelay) {
    if (!m || typeof m !== 'object' || !m.f || m.f === this.id) return;
    const k = m.f + ':' + m.n, last = this.lastSeq.get(k) || 0;
    if (m.s <= last) return;
    this.lastSeq.set(k, m.s);
    if (this.lastSeq.size > 500) this.lastSeq.clear();
    for (const h of this.handlers) try { h(m); } catch (e) { console.warn(e); }
  }
  // ---- PeerJS star ----
  startPeer() {
    if (!window.Peer || this.stopped) return;
    this.asClient();
  }
  cleanupPeer() {
    try { this.peer && this.peer.destroy(); } catch (_) {}
    this.peer = null; this.hostConn = null; this.isHost = false; this.conns.clear(); this.p2pUp = false;
  }
  asClient() {
    this.cleanupPeer();
    let pr; try { pr = new Peer(); } catch (_) { return; }
    this.peer = pr;
    pr.on('open', () => {
      if (this.peer !== pr) return;
      const c = pr.connect(this.hostId, { reliable: true });
      const to = setTimeout(() => { if (this.peer === pr && !c.open) this.asHost(); }, 7000);
      c.on('open', () => { clearTimeout(to); this.hostConn = c; this.p2pUp = true; });
      c.on('data', d => { let m; try { m = JSON.parse(d); } catch (_) { return; } this.deliver(m); });
      c.on('close', () => { if (this.peer !== pr) return; this.p2pUp = false; setTimeout(() => this.peer === pr && this.asHost(), 300 + Math.random() * 1500); });
    });
    pr.on('error', e => {
      if (this.peer !== pr) return;
      if (e.type === 'peer-unavailable') this.asHost();
    });
    pr.on('disconnected', () => { try { pr.reconnect(); } catch (_) {} });
  }
  asHost() {
    this.cleanupPeer();
    let pr; try { pr = new Peer(this.hostId); } catch (_) { return; }
    this.peer = pr;
    pr.on('open', () => { if (this.peer !== pr) return; this.isHost = true; this.p2pUp = true; });
    pr.on('connection', c => {
      c.on('open', () => this.conns.add(c));
      c.on('data', d => {
        let m; try { m = JSON.parse(d); } catch (_) { return; }
        for (const o of this.conns) if (o !== c && o.open) try { o.send(d); } catch (_) {} // relay
        this.deliver(m);
      });
      c.on('close', () => this.conns.delete(c));
    });
    pr.on('error', e => {
      if (this.peer !== pr) return;
      if (e.type === 'unavailable-id') setTimeout(() => this.peer === pr && this.asClient(), 200 + Math.random() * 800);
    });
    pr.on('disconnected', () => { try { pr.reconnect(); } catch (_) {} });
  }
  // ---- Nostr relays ----
  startRelays() {
    if (!window.NostrTools) return;
    this.sk = NostrTools.generateSecretKey();
    for (const u of RELAYS) this.relayOne(u, 0);
  }
  relayOne(u, fails) {
    if (this.stopped) return;
    let ws; try { ws = new WebSocket(u); } catch (_) { return; }
    ws._u = u; this.socks.push(ws);
    ws.onopen = () => {
      ws._open = 1; this.relayUp++;
      ws.send(JSON.stringify(['REQ', 'db', { kinds: [KIND], '#t': [this.topic], since: Math.floor(Date.now() / 1000) - 5 }]));
    };
    ws.onmessage = e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d[0] !== 'EVENT' || !d[2]) return;
      if (Math.abs(Date.now() / 1000 - d[2].created_at) > 30) return;
      let p; try { p = JSON.parse(d[2].content); } catch (_) { return; }
      if (p && Array.isArray(p.b)) for (const m of p.b) this.deliver(m);
    };
    ws.onclose = () => {
      if (ws._open) this.relayUp = Math.max(0, this.relayUp - 1);
      const i = this.socks.indexOf(ws); if (i >= 0) this.socks.splice(i, 1);
      const f = ws._open ? 0 : fails + 1;
      setTimeout(() => this.relayOne(u, f), Math.min(60000, 3000 * Math.pow(2, Math.min(f, 4))));
    };
    ws.onerror = () => {};
  }
  heal() {
    if (this.stopped || !window.Peer) return;
    if (!this.peer || this.peer.destroyed) this.asClient();
    else if (!this.isHost && !(this.hostConn && this.hostConn.open) && this.peer.open) this.asClient();
  }
}
