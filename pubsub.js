var sys        = require("sys");
var http       = require("http");
var ws         = require("./lib/ws");
var subscriber = require("./lib/redis-client").createClient();
var publisher  = require("./lib/redis-client").createClient();

var clients = [];
var channels = {};

var PubSub = {
  addClient: function(client) {
    clients.push(client);
    
    sys.log("addClient: " + clients.length + " clients connected");
  },

  removeClient: function(client) {
    clients.splice(clients.indexOf(client), 1);

    for (var i = 0; i < channels.length; i++)
      if (channels[i].indexOf(client) >= 0)
        channels[i].splice(channels[i].indexOf(client), 1);
    
    sys.log("removeClient: " + clients.length + " clients connected");
  },

  subscribe: function(channel) {
    if (channels[channel])
      channels[channel].push(this);
    else
      channels[channel] = [this];

    subscriber.subscribeTo(channel, PubSub.deliverMessage);
    
    sys.log("subscribe: " + channel);
  },

  unsubscribe: function(channel, client) {
    try {
      var clients = channels[channel];
      clients.splice(clients.indexOf(client), 1);
    } catch (e) {
      sys.debug("channel doesn't exist: " + e);
    }
  },
  
  publish: function(channel, message) {
    publisher.publish(channel, JSON.stringify(message), function(error, reply) {
      if (error)
        sys.debug(error);
    });
    
    sys.log("publish: " + channel + ": " + JSON.stringify(message));
  },
  
  ping: function() {
    PubSub.triggerRemote(this, "pong");
  },

  deliverMessage: function(channel, message, subscriptionPattern) {
    sys.debug(channel + ": " + message);
    
    var clients = channels[channel];

    for (var i = 0; i < clients.length; i++) {
      PubSub.triggerRemote(clients[i], "deliverMessage", channel.toString(), JSON.parse(message.toString()));
    }
  },
  
  triggerRemote: function(client, command) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    
    client.write(JSON.stringify(args));
    
    sys.log("triggerRemote: " + JSON.stringify(args));
  }
};

ws.createServer(function(client) {
  client.addListener("connect", function(resource) {
    sys.log("connect");
    
    PubSub.addClient(this);
  });
  
  client.addListener("data", function(json) {
    var arguments = JSON.parse(json);
    var command = arguments.shift();
    
    if (PubSub[command])
      PubSub[command].apply(this, arguments);
  });
  
  client.addListener("close", function() { 
    sys.log("close");
    
    PubSub.removeClient(this);
  });
  
  client.addListener("error", function(exception) { 
    sys.error(exception);
  });
}).listen(8081);