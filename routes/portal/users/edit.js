var extend = require("util")._extend;
var async = require("async");
var ldap = require("ldapjs");
var asn1 = require("asn1");

var config = require("../../../config.js");

exports.get = function(req, res) {
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
                attributes: ["uid", "givenName", "sn", "sshPublicKey"]
            }, function(err, result) {
                if(err) {
                    client.unbind();
                    return res.redirect("/listUsers");
                }

                var dn = "";
                var username = "";
                var givenName = "";
                var sn = "";
                var sshPublicKey = "";

                result.on("searchEntry", function(entry) {
                    dn = entry.dn;
                    username = entry.object.uid;
                    givenName = entry.object.givenName;
                    sn = entry.object.sn;
                    sshPublicKey = entry.object.sshPublicKey;
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
                                    gn: givenName,
                                    sn: sn,
                                    sshPublicKey: sshPublicKey,
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
};

exports.post = function(req, res) {
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
            client.add(userDN, extend({
                objectClass: ["inetOrgPerson", "simpleSecurityObject", "ldapPublicKey"],
                uid: req.body.username,
                cn: req.body.gn,
                givenName: req.body.gn,
                sn: req.body.sn,
                userPassword: ""
            }, req.body.sshPublicKey ? {sshPublicKey: req.body.sshPublicKey} : {}), function(err) {
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
            if("delete" in req.body) {
                return client.del(userDN, function(err) {
                    client.unbind();
                    if(err) {
                        return res.redirect("/editUser?id="+req.body.username);
                    }
                    res.redirect("/listUsers");
                });
            }
            client.modify(userDN, [
                new ldap.Change({
                    operation: "replace",
                    modification: {
                        cn: req.body.gn
                    }
                }),
                new ldap.Change({
                    operation: "replace",
                    modification: {
                        givenName: req.body.gn
                    }
                }),
                new ldap.Change({
                    operation: "replace",
                    modification: {
                        sn: req.body.sn
                    }
                }),
                (req.body.sshPublicKey ? new ldap.Change({
                    operation: "replace",
                    modification: {
                        sshPublicKey: req.body.sshPublicKey
                    }
                }) : new ldap.Change({
                    operation: "delete",
                    modification: {
                        sshPublicKey: []
                    }
                }))
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
};
