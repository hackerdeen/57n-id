var passport = module.exports = require("passport");
var ldap = require("ldapjs");
var moment = require("moment");

var config = require("./config.js");
var users = require("./users.js");

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

        users.loadUser(username, function(err, user) {
            user = user || {};
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

                            users.saveUser(user, function(err) {
                                done(null, user);
                            });
                        });
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
    users.loadUser(username, function(err, user) {
        if(!user) {
            done("Can't read user file");
        }
        done(null, user);
    });
});
