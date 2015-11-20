var url = require("url");
var config = require("./config.js");

exports.requireLogin = function requireLogin(req, res, next) {
    if(req.isAuthenticated()) {
        next();
    } else {
        res.redirect("/login");
    }
}

exports.requireAdmin = function requireAdmin(req, res, next) {
    if(req.isAuthenticated() && req.user.isAdmin) {
        next();
    } else {
        res.redirect("/");
    }
}

exports.requireCorrectSite = function requireCorrectSite(req, res, next) {
    if(!req.isAuthenticated()) {
        return next();
    }

    if(req.hostname == config.guestSite && req.user.isMember) {
        var domain = config.memberSite;
    } else if(req.hostname == config.memberSite && !req.user.isMember) {
        var domain = config.guestSite;
    } else {
        return next();
    }

    var myUrl = url.parse(req.url);
    myUrl.host = domain;
    res.redirect(url.format(myUrl));
}
