var path = require("path");
var fs = require("fs");
var extend = require("util")._extend;
var moment = require("moment");

var config = require("./config.js");
var services = require("./services.js");

exports.loadUser = function loadUser(username) {
    try {
        var user = JSON.parse(fs.readFileSync(path.join(config.usersDir, username)));
    } catch(e) {
        return null;
    }

    user.username = username;
    user.authenticationDate = moment(user.authenticationDate);
    user.services = user.services.filter(function(key) {
        return !!services.byName[key];
    }).map(function(key) {
        return extend({ name: key }, services.byName[key]);
    });
    return user;
};

exports.saveUser = function saveUser(user) {
    var user = extend({}, user);
    user.services = Object.keys(user.services).map(function(key) {
        return user.services[key].name;
    });
    user.authenticationDate = user.authenticationDate.toISOString();
    var username = user.username;
    delete user.username;
    fs.writeFileSync(path.join(config.usersDir, username), JSON.stringify(user));
};
