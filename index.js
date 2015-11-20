// TODO: user deletion, guest creation, proxy tokens

var url = require("url");
var querystring = require("querystring");
var express = require("express");
var bodyParser = require("body-parser");
var session = require("express-session");
var FileStore = require("session-file-store")(session);
var adaro = require("adaro");
var xmlbuilder = require("xmlbuilder");

var config = require("./config.js");
var middleware = require("./middleware.js");
var services = require("./services.js");
var passport = require("./passport.js");
var tickets = require("./tickets.js");
var routes = require("./routes");

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}

var app = express();
app.engine("dust", adaro());
app.set("view engine", "dust");
app.set("views", config.viewsDir);
app.use(express.static(config.publicDir));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(session({
    store: new FileStore({
        path: config.sessionsDir
    }),
    secret: "thisistotallysecret",
    resave: false,
    saveUninitialized: false,
    name: "TGC-session",
    cookie: { domain: "."+config.memberSite }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(routes);

app.use(function(req, res, next) {
    req.users.saveUser = function() {
        users.saveUser(req.user);
    };

    next();
});

// CAS

app.use(function(req, res, next) {
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
    req.saveService = function() {
        if(req.isValidService() && !req.user.services.some(function(userService) {
            return userService.url == service;
        })) {
            req.user.services.push(services.byUrl[service]);
            req.saveUser();
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
});

app.route("/login").get(function(req, res) {
    if(req.isCorrectUserType() && !req.query.renew) {
        if(req.isValidService()) {
            req.saveService();
            return res.redirectToService({ticket: req.generateServiceTicket(false)});
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
}).post(passport.authenticate("local", {
    failureRedirect: "/login"
}), function(req, res) {
    if(req.isValidService()) {
        if(!req.isCorrectUserType()) {
            req.logout();
            return res.redirect("/login");
        }

        req.saveService();
        return res.redirectToService({ticket: req.generateServiceTicket(true)});
    } else {
        return res.redirect("/");
    }
});

app.route("/logout").get(middleware.requireCorrectSite, function(req, res) {
    if(req.isAuthenticated()) {
      res.render("logout");
    } else {
      res.redirectToService();
    }
}).post(function(req, res) {
    req.logout();
    res.redirectToService();
});

app.get("/validate", function(req, res) {
    if(!req.query.ticket || !req.query.ticket.startsWith("ST-")) {
        return res.send("no\n");
    }

    var info = tickets.load(req.query.ticket, true);

    if(info && info.site == req.hostname && info.service == req.query.service && (!req.query.renew || info.newLogin)) {
        res.send("yes\n");
    } else {
        res.send("no\n");
    }
});

app.get(/\/(?:p3\/)?(service|proxy)Validate$/, function(req, res) {
    var root = xmlbuilder.create("serviceResponse", {
        stringify: {
            eleName: function(val){
                return "cas:"+val;
            }
        }
    }).att("xmlns:cas", "http://www.yale.edu/tp/cas");

    var service = req.query.service;
    var ticket = req.query.ticket;
    var pgtUrl = req.query.pgtUrl;
    var renew = req.query.renew;

    if(!ticket) {
        return err("INVALID_REQUEST", "Invalid request - not all parameters present.");
    }
    if(!ticket.startsWith("ST-") || (req.params[0] == "proxy" && !ticket.startsWith("PT-"))) {
        return err("INVALID_TICKET_SPEC", "Invalid ticket - ticket is not a ST"+(req.params[0] == "proxy" ? " or PT" : "")+".");
    }

    var info = tickets.load(ticket, true);
    if(!info) {
        return err("INVALID_TICKET", "Invalid ticket - ticket does not exist.")
    }
    if(info.site != req.hostname) {
        return err("INVALID_TICKET", "Invalid ticket - wrong domain.");
    }
    if(service != info.service) {
        return err("INVALID_SERVICE", "Invalid service - service does not own this ticket.");
    }
    if(renew && !info.newLogin) {
        return err("INVALID_TICKET", "Invalid ticket - ticket was not from initial login and renew was set.");
    }

    // TODO: process pgtUrl

    var success = root.ele("authenticationSuccess");
    success.ele("user", info.username);

    var attributes = success.ele("attributes");
    attributes.ele("authenticationDate", info.authenticationDate);
    attributes.ele("longTermAuthenticationRequestTokenUsed", "false");
    attributes.ele("isFromNewLogin", info.newLogin);

    if(info.proxies) {
        var proxies = success.ele("proxies");
        info.proxies.forEach(function(proxy) {
            proxies.ele("proxy", proxy);
        });
    }

    res.send(root.toString());

    function err(code, message) {
        root.ele("proxyFailure", {code: code}, message);
        res.send(root.toString());
    }
});

app.get("/proxy", function(req, res) {
    var root = xmlbuilder.create("serviceResponse", {
        stringify: {
            eleName: function(val){
                return "cas:"+val;
            }
        }
    }).att("xmlns:cas", "http://www.yale.edu/tp/cas");

    var pgt = req.query.pgt;
    var targetService = req.query.targetService;

    if(!pgt || !targetService) {
        return err("INVALID_REQUEST", "Invalid request - not all parameters present.");
    }
    if(!pgt.startsWith("PGT-")) {
        return err("INVALID_TICKET_SPEC", "Invalid ticket - ticket is not a PGT.");
    }

    var info = tickets.load(pgt, false);
    if(!info) {
        return err("INVALID_TICKET", "Invalid ticket - ticket does not exist.");
    }
    if(info.site != req.hostname) {
        return err("INVALID_TICKET", "Invalid ticket - wrong domain.");
    }

    var proxies = [info.pgtUrl];
    proxies.push.apply(proxies, info.proxies);
    var ticket = tickets.create("PT-", {
        site: info.site,
        service: targetService,
        username: info.username,
        authenticationDate: info.authenticationDate,
        newLogin: info.newLogin,
        proxies: proxies
    });

    var success = root.ele("proxySuccess");
    success.ele("proxyTicket", ticket);
    res.send(root.toString());

    function err(code, message) {
        root.ele("proxyFailure", {code: code}, message);
        res.send(root.toString());
    }
});

// All set up, let's rock!
app.listen(12000);
