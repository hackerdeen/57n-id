var path = require("path");
var util = require("util");
var extend = require("util")._extend;
var moment = require("moment");

var config = require("./config.js");
var redisc = require("./redis.js");
var services = require("./services.js");

exports.loadUser = function loadUser(username, done) {
    redisc.get(util.format(config.userKey, username), function(err, reply) {
        if(reply == null) {
            return done(null, null);
        }
        var user = JSON.parse(reply);

        user.username = username;
        user.authenticationDate = moment(user.authenticationDate);
        user.services = user.services.filter(function(key) {
            return !!services.byName[key];
        }).map(function(key) {
            return extend({ name: key }, services.byName[key]);
        });
        done(null, user);
    });
};

exports.saveUser = function saveUser(user, done) {
    var user = extend({}, user);
    user.services = Object.keys(user.services).map(function(key) {
        return user.services[key].name;
    });
    user.authenticationDate = user.authenticationDate.toISOString();
    var username = user.username;
    delete user.username;
    redisc.set(util.format(config.userKey, username), JSON.stringify(user), done);
};
