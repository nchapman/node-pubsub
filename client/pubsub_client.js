var PubsubClient = Class.create({
  connected: false,
  channels: {},
  reconnectAttempts: 0,
  maxReconnectAttempts: 7,
  
  initialize: function(host, port) {
    this.port = port;
    this.host = host;
    
    this.connect();
  },
  
  connect: function() {
    this.connecting = true;
    this.expectedClose = false;
    
    this.socket = new WebSocket("ws://" + this.host + ":" + this.port);
    
    this.socket.onopen = this.wsonconnect.bind(this);
    this.socket.onmessage = this.wsonmessage.bind(this);
    this.socket.onclose = this.wsondisconnect.bind(this);
    this.socket.onerror = this.wsonerror.bind(this);
    
    this.log("connect -> connecting");
  },
  
  wsonconnect: function() {
    this.log("wsonconnect -> connected");
    
    this.connected = true;
    this.connecting = false;
    this.reconnectAttempts = 0;
    
    this.heartbeat = setInterval(this.ping.bind(this), 30 * 1000);
    
    if (this.onconnect)
      this.onconnect();
  },
  
  wsondisconnect: function() {
    this.log("wsondisconnect -> not connected " + (!this.expectedClose ? " (unexpected)" : ""));

    if (this.heartbeat)
      clearInterval(this.heartbeat);

    this.connected = false;
    this.connecting = false;
    
    this.socket = null;
    delete this.socket;
    
    this.channels = {};

    if (this.ondisconnect)
      this.ondisconnect();

    if (!this.expectedClose && ++this.reconnectAttempts < this.maxReconnectAttempts) {
      var timeout = Math.pow(2, this.reconnectAttempts) * 1000;  // exponential backoff
      
      this.log("wsondisconnect -> trying to reconnect in " + timeout + " ms ...");
      
      setTimeout(function () {
        if (this.onreconnectattempt) 
          this.onreconnectattempt(this.reconnectAttempts);
        
        this.connect();
      }.bind(this), timeout);
    }
  },
  
  wsonmessage: function(e) {
    var args = e.data.evalJSON();
    var command = args.shift();
    
    this.log("wsonmessage -> " + command);
    
    if (this[command])
      this[command].apply(this, args);
  },
  
  wsonerror: function(e) {
    console.error(e);
  },
  
  deliver: function(channel, message) {
    var functions = this.channels[channel];
    var evaledMessage = message.evalJSON();
    
    if (functions)
      for (var i = 0; i < functions.length; i++)
        functions[i](evaledMessage);
        
    this.log("deliver -> " + channel + " -> " + Object.toJSON(message));
  },
  
  ping: function() {
    if (this.connected)
      this.rpc("ping");
  },
  
  subscribe: function(channel, f) {
    if (channel.indexOf("*") >= 0) {
      console.warn("subscribe -> rejected -> " + channel);
      return;
    }
    
    if (this.channels[channel])
      this.channels[channel].push(f);
    else
      this.channels[channel] = [f];
      
    this.rpc("subscribe", channel);
  },
  
  publish: function(channel, message) {
    this.rpc("publish", channel, message);
  },
  
  rpc: function(command) {
    var json = Object.toJSON(Array.prototype.slice.call(arguments));
    
    this.socket.send(json);
    
    this.log("rpc -> " + json);
  },
  
  log: function(message) {
    if (this.logger)
      this.logger(message);
  }
});
