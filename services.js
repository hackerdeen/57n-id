var extend = require("util")._extend;
var config = require("./config.js");
var redisc = require("./redis.js");

exports.byName = byName = {};
exports.byUrl = byUrl = {};
redisc.get(config.servicesKey, function(err, reply) {
    extend(byName, JSON.parse(reply || "{}"));
    Object.keys(byName).forEach(function(key) {
        var service = byName[key];
        byUrl[service.url] = extend({ name: key }, service);
    });
});

exports.modifyService = function modifyService(name, url, needMember, done) {
    if(byName[name]) {
        delete byUrl[byName[name].url];
    }
    byName[name] = service = {
        url: url,
        needMember: needMember
    };
    byUrl[url] = extend({ name: name }, service);
    redisc.set(config.servicesKey, JSON.stringify(byName), done);
};

exports.deleteService = function deleteService(name, done) {
    delete byUrl[byName[name].url];
    delete byName[name];
    redisc.set(config.servicesKey, JSON.stringify(byName), done);
};
