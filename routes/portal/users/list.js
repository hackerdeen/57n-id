var async = require("async");
var ldap = require("ldapjs");

var config = require("../../../config.js");

module.exports = function(req, res) {
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
};
