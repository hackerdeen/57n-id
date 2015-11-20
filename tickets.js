var fs = require("fs");
var path = require("path");
var moment = require("moment");
var uid2 = require("uid2");

var config = require("./config.js");

exports.create = function create(prefix, expires, info) {
    if(!info) {
        info = expires;
        expires = moment().add(5, "m");
    }
    var ticket = prefix+uid2(24);
    fs.writeFileSync(path.join(config.ticketsDir, ticket), JSON.stringify({
        expires: expires.toISOString(),
        info: info
    }));
    return ticket;
};

exports.load = function load(ticket, destroy) {
    if(!/^[A-Za-z0-9-]+$/.test(ticket)) {
        return null;
    }

    try {
        var packet = JSON.parse(fs.readFileSync(path.join(config.ticketsDir, ticket)));
    } catch (e) {
        return null;
    }

    if(destroy) {
        try {
            fs.unlinkSync(path.join(config.ticketsDir, ticket));
        } catch (e) {}
    }

    if(moment(packet.expires).isBefore()) {
        return null;
    } else {
        return packet.info;
    }
};
