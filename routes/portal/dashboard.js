var config = require("../../config.js");
var extend = require("util")._extend;

module.exports = function(req, res) {
    res.render("dashboard", {
        username: req.user.username,
        isAdmin: req.user.isAdmin,
        services: req.user.services.map(function(service) {
            var site = service.needMember ? config.memberSite : config.guestSite;
            return extend({
                loginUrl: "https://"+site+"/login?service="+encodeURIComponent(service.url)
            }, service);
        })
    });
};
