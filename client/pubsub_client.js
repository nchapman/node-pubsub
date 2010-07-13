var PubSubClient = Class.create({
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
    //this.socket.onerror = this.errored.bind(this);
  },
  
  wsonconnect: function() {
    this.connected = true;
    this.connecting = false;
    this.reconnectAttempts = 0;
    
    this.heartbeat = setInterval(this.ping.bind(this), 30 * 1000);
    
    if (this.onconnect)
      this.onconnect();
    
    console.log("wsonconnect: connected")
  },
  
  wsondisconnect: function() {
    console.log("not connected " + (!this.expectedClose ? " (unexpected)" : ""));

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
      
      console.log("trying to reconnect in " + timeout + " ms ...");
      
      setTimeout(function () {
        if (this.onreconnectattempt) 
          this.onreconnectattempt(this.reconnectAttempts);
        
        this.connect();
      }.bind(this), timeout);
    }
  },
  
  wsonmessage: function(e) {
    var arguments = e.data.evalJSON();
    var command = arguments.shift();
    
    if (this[command])
      this[command].apply(this, arguments);
  },
  
  deliverMessage: function(channel, message) {
    var functions = this.channels[channel];
    
    if (functions)
      for (var i = 0; i < functions.length; i++)
        functions[i](message);
  },
  
  ping: function() {
    if (this.socket)
      this.triggerRemote("ping");
  },
  
  subscribe: function(channel, f) {
    if (this.channels[channel])
      this.channels[channel].push(f);
    else
      this.channels[channel] = [f];
      
    this.triggerRemote("subscribe", channel);
  },
  
  publish: function(channel, message) {
    this.triggerRemote("publish", channel, message);
  },
  
  triggerRemote: function(command) {
    this.socket.send(Object.toJSON(Array.prototype.slice.call(arguments)));
  }
});