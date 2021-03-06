var url = require("url");
var config = require("../../config.js");
var passport = require("../../passport.js");

exports.get = function(req, res) {
    if(req.isCorrectUserType() && !req.query.renew) {
        if(req.isValidService()) {
            return req.saveService(function(err) {
                req.generateServiceTicket(false, function(err, ticket) {
                    res.redirectToService({ticket: ticket});
                });
            });
        } else {
            return res.redirect("/");
        }
    }
    if(req.query.gateway) {
        return res.redirectToService();
    }
    if(!req.isValidService() && req.hostname == config.guestSite) {
        var myUrl = url.parse(req.url);
        myUrl.host = config.memberSite;
        return res.redirect(url.format(myUrl));
    }

    res.render("login", {
        service: req.query.service
    });
};

exports.post = [passport.authenticate("local", {
    failureRedirect: "/login"
}), function(req, res) {
    if(req.isValidService()) {
        if(!req.isCorrectUserType()) {
            req.logout();
            return res.redirect("/login");
        }

        return req.saveService(function(err) {
            req.generateServiceTicket(true, function(err, ticket) {
                res.redirectToService({ticket: ticket});
           });
        });
    } else {
        return res.redirect("/");
    }
}];
