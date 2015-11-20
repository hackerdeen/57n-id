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
    if(byName[name]) {
        delete byUrl[byName[name].url];
    }
    byName[name] = service = {
        url: url,
        needMember: needMember
    };
    byUrl[url] = extend({ name: name }, service);
    fs.writeFileSync(config.servicesFile, JSON.stringify(byName));
};

exports.deleteService = function deleteService(name) {
    delete byUrl[byName[name].url];
    delete byName[name];
    fs.writeFileSync(config.servicesFile, JSON.stringify(byName));
};
