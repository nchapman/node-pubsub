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
    
    sys.log("addClient -> " + clients.length + " clients connected");
  },

  removeClient: function(client) {
    clients.splice(clients.indexOf(client), 1);

    for (channel in channels)
      PubSub.unsubscribe(client, channel);
    
    sys.log("removeClient -> " + clients.length + " clients connected");
  },

  subscribe: function(client, channel) {
    if (channel.indexOf("*") >= 0) {
      sys.log("subscribe -> rejected  -> " + channel);
      return;
    }
    
    var clients = channels[channel];
    
    if (clients == undefined)
      clients = [];

    if (clients.length == 0) {
      subscriber.subscribeTo(channel, this.deliver);
      
      sys.log("subscribe -> redis -> " + channel);
    }
    
    clients.push(client);
    channels[channel] = clients;

    sys.log("subscribe -> " + channel);
  },

  unsubscribe: function(client, channel) {
    var clients = channels[channel];
    
    if (clients) {
      var index = clients.indexOf(client);
      
      if (index >= 0) {
        clients.splice(index, 1);
        
        sys.log("unsubscribe -> " + channel);
      }
      
      if (clients.length == 0) {
        subscriber.unsubscribeFrom(channel);
        delete channels[channel];
        
        sys.log("unsubscribe -> redis -> " + channel);
      }
    }
  },
  
  publish: function(client, channel, message) {
    publisher.publish(channel, JSON.stringify(message), function(error, reply) {
      if (error)
        sys.debug(error);
    });
    
    sys.log("publish -> " + channel + " -> " + JSON.stringify(message));
  },
  
  ping: function(client) {
    this.rpc(client, "pong");
  },

  deliver: function(channel, message, subscriptionPattern) {
    var clients = channels[channel];

    for (var i = 0; i < clients.length; i++)
      PubSub.rpc(clients[i], "deliver", channel.toString(), JSON.parse(message.toString()));
      
    sys.log("deliver -> " + channel + " -> " + message.toString());
  },
  
  rpc: function(client, command) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    
    client.write(JSON.stringify(args));
    
    sys.log("rpc -> " + JSON.stringify(args));
  }
};

ws.createServer(function(client) {
  client.addListener("connect", function(resource) {
    sys.log("connect");
    
    PubSub.addClient(this);
  });
  
  client.addListener("data", function(json) {
    var args = JSON.parse(json);
    var command = args.shift();
    
    // Add client as first argument
    args.unshift(this);
    
    if (PubSub[command])
      PubSub[command].apply(PubSub, args);
    else
      sys.log("data: Command not found -> " + command);
  });
  
  client.addListener("close", function() {
    PubSub.removeClient(this);
    
    sys.log("close");
  });
  
  client.addListener("error", function(exception) { 
    sys.log(exception);
  });
}).listen(8081);