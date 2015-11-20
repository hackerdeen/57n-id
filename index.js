// TODO: user deletion, guest creation, proxy tokens

var async = require("async");
var path = require("path");
var fs = require("fs");
var url = require("url");
var querystring = require("querystring");
var extend = require("util")._extend;
var express = require("express");
var bodyParser = require("body-parser");
var session = require("express-session");
var FileStore = require("session-file-store")(session);
var adaro = require("adaro");
var passport = require("passport");
var ldap = require("ldapjs");
var asn1 = require("asn1");
var uid2 = require("uid2");
var moment = require("moment");
var xmlbuilder = require("xmlbuilder");

var config = require("./config.js");
var services = require("./services.js");

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}

function loadUser(username) {
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
}

function saveUser(user) {
    var user = extend({}, user);
    user.services = Object.keys(user.services).map(function(key) {
        return user.services[key].name;
    });
    user.authenticationDate = user.authenticationDate.toISOString();
    var username = user.username;
    delete user.username;
    fs.writeFileSync(path.join(config.usersDir, username), JSON.stringify(user));
}

passport.use(new (require('passport-local').Strategy)(function(username, password, done) {
    var client = ldap.createClient({
        url: config.ldapUrl
    });
    var userDN = new ldap.RDN({uid: username}).toString()+","+config.ldapUsersDN;
    client.bind(userDN, password, function(err) {
        if(err) {
            client.unbind();
            if(err instanceof ldap.InvalidCredentialsError) {
                return done(null, false, { message: "Invalid username or password." });
            }
            return done(err);
        }

        var user = loadUser(username) || {};
        user.username = username;
        user.services = user.services || [];
        user.authenticationDate = moment();
        user.isMember = false;
        user.isAdmin = false;
        client.search(userDN, {
            scope: "base",
            filter: "(uid=*)",
            attributes: ["uid"]
        }, function(err, res) {
            if(err) {
                client.unbind();
                return done(err);
            }

            res.on("searchEntry", function(entry) {
                user.username = entry.object.uid;
            }).on("error", function(err) {
                client.unbind();
                done(err);
            }).on("end", function(result) {
                if(result.status != 0) {
                    client.unbind();
                    return done(ldap.getError(result));
                }

                client.search(config.ldapGroupsDN, {
                    scope: "sub",
                    filter: "(member="+userDN+")",
                    attributes: ["dn"]
                }, function(err, res) {
                    if(err) {
                        client.unbind();
                        return done(err);
                    }

                    res.on("searchEntry", function(entry) {
                        var dn = entry.dn.toString();
                        if(dn == config.memberGroup) {
                           user.isMember = true;
                        } else if(dn == config.adminGroup) {
                            user.isAdmin = true;
                        }
                    }).on("error", function(err) {
                        client.unbind();
                        done(err);
                    }).on("end", function(result) {
                        client.unbind();
                        if(result.status != 0) {
                            return done(ldap.getError(result));
                        }

                        saveUser(user);
                        done(null, user);
                    });
                });
            });
        });
    });
}));

passport.serializeUser(function(user, done) {
    done(null, user.username);
});

passport.deserializeUser(function(username, done) {
    var user = loadUser(username);
    if(!user) {
        done("Can't read user file");
    }
    done(null, user);
});

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

function requireLogin(req, res, next) {
    if(req.isAuthenticated()) {
        next();
    } else {
        res.redirect("/login");
    }
}

function requireAdmin(req, res, next) {
    if(req.isAuthenticated() && req.user.isAdmin) {
        next();
    } else {
        res.redirect("/");
    }
}

function requireCorrectSite(req, res, next) {
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

app.use(function(req, res, next) {
    req.saveUser = function() {
        saveUser(req.user);
    };

    next();
});

app.get("/", requireLogin, requireCorrectSite, function(req, res) {
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
});

app.route("/changePassword").get(requireCorrectSite, function(req, res) {
    res.render("change-password");
}).post(function(req, res) {
    if(req.body.newPassword != req.body.newPasswordConfirmation) {
        return res.redirect("/changePassword");
    }

    var client = ldap.createClient({
        url: config.ldapUrl
    });

    var ber = new asn1.Ber.Writer();
    var userDN = new ldap.RDN({uid: req.body.username}).toString()+","+config.ldapUsersDN;
    ber.startSequence();
    ber.writeString(userDN, 0x80);
    ber.writeString(req.body.password, 0x81);
    ber.writeString(req.body.newPassword, 0x82);
    ber.endSequence();

    client.bind(userDN, req.body.password, function(err) {
        if(err) {
            client.unbind();
            return res.redirect("/changePassword");
        }

        client.exop("1.3.6.1.4.1.4203.1.11.1", ber.buffer, function(err) {
            client.unbind();
            if(err) {
                return res.redirect("/changePassword");
            }
            res.render("change-password-confirm");
        });
    });
});

app.get("/listServices", requireLogin, requireCorrectSite, function(req, res) {
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
});

app.route(/^\/(create|edit)Service$/).get(requireAdmin, requireCorrectSite, function(req, res) {
    if(req.query.name) {
        var service = services.byName[req.query.name];
        if(service) {
            return res.render("create-service", {
                name: req.query.name,
                url: service.url,
                needMember: service.needMember
            });
        }
    }
    res.render("create-service");
}).post(requireAdmin, function(req, res) {
    if(req.body.delete !== undefined) {
        services.deleteService(req.body.name);
    } else {
        services.modifyService(req.body.name, req.body.url, req.body.site == "member");
    }
    res.redirect("/listServices");
});

app.get("/listUsers", requireAdmin, requireCorrectSite, function(req, res) {
    var client = ldap.createClient({
        url: config.ldapUrl
    });

    client.bind(config.idSystemDN, config.idSystemPassword, function(err) {
        if(err) {
            client.unbind();
            return res.redirect("/");
        }

        client.search(config.ldapUsersDN, {
            scope: "one",
            filter: "(uid=*)",
            attributes: ["uid"]
        }, function(err, result) {
            if(err) {
                client.unbind();
                return res.redirect("/");
            }

            var users = [];

            result.on("searchEntry", function(entry) {
                users.push({
                    dn: entry.dn,
                    username: entry.object.uid,
                    groups: []
                });
            }).on("error", function(err) {
                client.unbind();
                return res.redirect("/");
            }).on("end", function(result) {
                if(result.status != 0) {
                    return res.redirect("/");
                }

                async.each(users, function(user, done) {
                    client.search(config.ldapGroupsDN, {
                        scope: "sub",
                        filter: "(member="+user.dn+")",
                        attributes: ["cn"]
                    }, function(err, res) {
                        if(err) {
                            return done(err);
                        }

                        res.on("searchEntry", function(entry) {
                            user.groups.push(entry.object.cn);
                        }).on("error", function(err) {
                            done(err);
                        }).on("end", function(result) {
                            if(result.status != 0) {
                                return done(ldap.getError(result));
                            }
                            done();
                        });
                    });
                }, function(err) {
                    client.unbind();
                    if(err) {
                        console.log(err);
                        return res.redirect("/");
                    }

                    res.render("list-users", {
                        users: users
                    });
                });
            });
        });
    });
});

app.route(/^\/(create|edit)User$/).get(requireAdmin, requireCorrectSite, function(req, res) {
    if(req.query.id) {
        var client = ldap.createClient({
            url: config.ldapUrl
        });
        client.bind(config.idSystemDN, config.idSystemPassword, function(err) {
            if(err) {
                client.unbind();
                return res.redirect("/listUsers");
            }

            var userDN = new ldap.RDN({uid: req.query.id}).toString()+","+config.ldapUsersDN;
            client.search(userDN, {
                scope: "base",
                filter: "(uid=*)",
                attributes: ["uid", "cn", "sn"]
            }, function(err, result) {
                if(err) {
                    client.unbind();
                    return res.redirect("/listUsers");
                }

                var dn = "";
                var username = "";
                var cn = "";
                var sn = "";

                result.on("searchEntry", function(entry) {
                    dn = entry.dn;
                    username = entry.object.uid;
                    cn = entry.object.cn;
                    sn = entry.object.sn;
                }).on("error", function(err) {
                    client.unbind();
                    return res.redirect("/");
                }).on("end", function(result) {
                    if(result.status != 0) {
                        return res.redirect("/");
                    }

                    var groups = [];

                    client.search(config.ldapGroupsDN, {
                        scope: "sub",
                        filter: "(objectClass=groupOfNames)",
                        attributes: ["cn"]
                    }, function(err, result) {
                        if(err) {
                            client.unbind();
                            return res.redirect("/listUsers");
                        }

                        result.on("searchEntry", function(entry) {
                            groups.push({
                                dn: entry.dn,
                                name: entry.object.cn,
                                enabled: false
                            });
                        }).on("error", function(err) {
                            client.unbind();
                            res.redirect("/listUsers");
                        }).on("end", function(result) {
                            if(result.status != 0) {
                                return res.redirect("/listUsers");
                            }

                            async.each(groups, function(group, done) {
                                client.compare(group.dn, "member", dn, function(err, matched) {
                                    if(err) {
                                        return done(err);
                                    }
                                    group.enabled = matched;
                                    done();
                                });
                            }, function(err) {
                                client.unbind();
                                if(err) {
                                    return red.redirect("/listUsers");
                                }
                                res.render("create-user", {
                                    username: username,
                                    cn: cn,
                                    sn: sn,
                                    groups: groups
                                });
                            });
                        });
                    });
                });
            });
        });
    } else {
        res.render("create-user");
    }
}).post(requireAdmin, function(req, res) {
    var client = ldap.createClient({
        url: config.ldapUrl
    });

    var userDN = new ldap.RDN({uid: req.body.username}).toString()+","+config.ldapUsersDN;

    client.bind(config.idSystemDN, config.idSystemPassword, function(err) {
        if(err) {
            client.unbind();
            return res.redirect("/"+req.params[0]+"User"+(req.body.username ? "?id="+req.body.username : ""));
        }

        if(req.params[0] == "create") {
            client.add(userDN, {
                objectClass: ["inetOrgPerson", "simpleSecurityObject"],
                uid: req.body.username,
                cn: req.body.cn,
                sn: req.body.sn,
                userPassword: ""
            }, function(err) {
                if(err) {
                    return res.redirect("/createUser");
                }

                editPassword(function(err) {
                    if(err) {
                        client.unbind();
                        return res.redirect("/editUser?id="+req.body.username);
                    }

                    editGroups(req.body.groups || [], function(err) {
                        client.unbind();
                        if(err) {
                            return res.redirect("/editUser?id="+req.body.username);
                        }
                        res.redirect("/listUsers");
                    });
                });
            });
        } else {
            client.modify(userDN, [
                new ldap.Change({
                    operation: "replace",
                    modification: {
                        cn: req.body.cn
                    }
                }),
                new ldap.Change({
                    operation: "replace",
                    modification: {
                        sn: req.body.sn
                    }
                }),
            ], function(err) {
                if(err) {
                    client.unbind();
                    return res.redirect("/createUser");
                }

                editPassword(function(err) {
                    if(err) {
                        client.unbind();
                        return res.redirect("/editUser?id="+req.body.username);
                    }

                    editGroups(req.body.groups || [], function(err) {
                        client.unbind();
                        if(err) {
                            return res.redirect("/editUser?id="+req.body.username);
                        }
                        res.redirect("/listUsers");
                    });
                });
            });
        }
    });

    function editPassword(done) {
        if(req.body.password) {
            var ber = new asn1.Ber.Writer();
            ber.startSequence();
            ber.writeString(userDN, 0x80);
            ber.writeString(req.body.password, 0x82);
            ber.endSequence();

            client.exop("1.3.6.1.4.1.4203.1.11.1", ber.buffer, done);
        } else {
            done();
        }
    }

    function editGroups(newGroups, done) {
        client.search(config.ldapGroupsDN, {
            scope: "sub",
            filter: "(member="+userDN+")",
            attributes: ["dn"]
        }, function(err, result) {
            if(err) {
                return done(err);
            }

            var deleteGroups = [];

            result.on("searchEntry", function(entry) {
                var idx = newGroups.indexOf(entry.dn.toString());
                if(idx == -1) {
                    deleteGroups.push(entry.dn.toString());
                } else {
                    // Can't use delete operator because async assumes arrays don't have holes
                    newGroups.splice(idx, 1);
                }
            }).on("error", function(err) {
                done(err);
            }).on("end", function(result) {
                if(result.status != 0) {
                    return done(ldap.getError(result));
                }

                async.each(deleteGroups, function(group, done) {
                    client.modify(group, new ldap.Change({
                        operation: "delete",
                        modification: {
                            member: userDN
                        }
                    }), done);
                }, function(err) {
                    if(err) {
                        return done(err);
                    }
                    async.each(newGroups, function(group, done) {
                        client.modify(group, new ldap.Change({
                            operation: "add",
                            modification: {
                                member: userDN
                            }
                        }), done);
                    }, done);
                });
            });
        });
    }
});

// CAS

function storeTicketInfo(prefix, expires, info) {
    if(!info) {
        info = expires;
        expires = moment().add(5, "m");
    }
    var ticket = prefix+uid2(24);
    fs.writeFileSync(path.join(config.ticketsDir, ticket), JSON.stringify({
        expires: expires.toISOString(),
        info: info
    }));
    return ticket;
}

function loadTicketInfo(ticket, destroy) {
    if(!/^[A-Za-z0-9-]+$/.test(ticket)) {
        return null;
    }

    try {
        var packet = JSON.parse(fs.readFileSync(path.join(config.ticketsDir, ticket)));
    } catch (e) {
        return null;
    }

    if(destroy) {
        try {
            fs.unlinkSync(path.join(config.ticketsDir, ticket));
        } catch (e) {}
    }

    if(moment(packet.expires).isBefore()) {
        return null;
    } else {
        return packet.info;
    }
}

app.use(function(req, res, next) {
    var service = req.query.service || req.body.service;
    req.generateServiceTicket = function(newLogin) {
        return storeTicketInfo("ST-", {
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

app.route("/logout").get(requireCorrectSite, function(req, res) {
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

    var info = loadTicketInfo(req.query.ticket, true);

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

    var info = loadTicketInfo(ticket, true);
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

    var info = loadTicketInfo(pgt, false);
    if(!info) {
        return err("INVALID_TICKET", "Invalid ticket - ticket does not exist.");
    }
    if(info.site != req.hostname) {
        return err("INVALID_TICKET", "Invalid ticket - wrong domain.");
    }

    var proxies = [info.pgtUrl];
    proxies.push.apply(proxies, info.proxies);
    var ticket = storeTicketInfo("PT-", {
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
