var url = require("url");
var querystring = require("querystring");

var config = require("../../config.js");
var users = require("../../users.js");
var services = require("../../services.js");
var tickets = require("../../tickets.js");

module.exports = function(req, res, next) {
    var service = req.query.service || req.body.service;
    req.generateServiceTicket = function(newLogin) {
        return tickets.create("ST-", {
            site: req.hostname,
            service: service,
            username: req.user.username,
            authenticationDate: req.user.authenticationDate.toISOString(),
            newLogin: newLogin
        });
    };
    req.isValidService = function() {
        return service && services.byUrl[service] &&
          (services.byUrl[service].needMember ? config.memberSite : config.guestSite) == req.hostname;
    };
    req.saveService = function(done) {
        if(req.isValidService() && !req.user.services.some(function(userService) {
            done(null, userService.url == service);
        })) {
            req.user.services.push(services.byUrl[service]);
            users.saveUser(req.user, done);
        }
    };
    res.redirectToService = function(params) {
        if(req.isValidService()) {
            var serviceUrl = url.parse(service);
            if(serviceUrl.search) {
                serviceUrl.search += "&"+querystring.stringify(params);
            } else {
                serviceUrl.search = "?"+querystring.stringify(params);
            }
            res.redirect(url.format(serviceUrl));
        } else {
            res.redirect("/");
        }
    };
    req.isCorrectUserType = function() {
        return req.isAuthenticated() && (req.hostname == config.guestSite || req.user.isMember);
    };

    next();
};
