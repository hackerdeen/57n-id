var config = require("../../../config.js");
var services = require("../../../services.js");

module.exports = function(req, res) {
    res.render("list-services", {
        isAdmin: req.user.isAdmin,
        services: Object.keys(services.byName).filter(function(key) {
            return !services.byName[key].needMember || req.user.isMember;
        }).map(function(key) {
            var service = services.byName[key];
            var site = service.needMember ? config.memberSite : config.guestSite;
            return {
                name: key,
                url: service.url,
                loginUrl: "https://"+site+"/login?service="+encodeURIComponent(service.url)
            };
        })
    });
};
