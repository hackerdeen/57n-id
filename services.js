var fs = require("fs");
var extend = require("util")._extend;
var config = require("./config.js");

exports.byName = byName = JSON.parse(fs.readFileSync(config.servicesFile));
exports.byUrl = byUrl = {};
Object.keys(byName).forEach(function(key) {
    var service = byName[key];
    byUrl[service.url] = extend({ name: key }, service);
});

exports.modifyService = function modifyService(name, url, needMember) {
    byName[name] = {
        url: url,
        needMember: needMember
    };
    fs.writeFileSync(config.servicesFile, JSON.stringify(byName));
};

exports.deleteService = function deleteService(name) {
    delete byName[name];
    fs.writeFileSync(config.servicesFile, JSON.stringify(byName));
};
