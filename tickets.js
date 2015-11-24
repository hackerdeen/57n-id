var util = require("util");
var path = require("path");
var moment = require("moment");
var uid2 = require("uid2");

var config = require("./config.js");
var redisc = require("./redis.js");

exports.create = function create(prefix, expires, info, done) {
    if(!done) {
        done = info;
        info = expires;
        expires = moment.duration(5, "m");
    }
    var ticket = prefix+uid2(24);
    redisc.setex(util.format(config.ticketKey, ticket), expires.asSeconds(), JSON.stringify(info), function(err) {
        done(null, ticket);
    });
};

exports.load = function load(ticket, destroy, done) {
    if(!/^[A-Za-z0-9-]+$/.test(ticket)) {
        return done("Invalid ticket");
    }

    var key = util.format(config.ticketKey, ticket);
    if(!destroy) {
        redisc.get(key, parse);
    } else {
        redisc.multi().get(key, parse).
                       del(key).exec();
    }

    function parse(err, reply) {
        if(reply == null) {
            return done("Non-existent ticket");
        }
        done(null, JSON.parse(reply));
    }
};
