var ldap = require("ldapjs");
var asn1 = require("asn1");

var config = require("../../../config.js");

exports.get = function(req, res) {
    res.render("register");
};

exports.post = function(req, res) {
    var client = ldap.createClient({
        url: config.ldapUrl
    });

    var userDN = new ldap.RDN({uid: req.body.username}).toString()+","+config.ldapUsersDN;

    client.bind(config.idSystemDN, config.idSystemPassword, function(err) {
        client.add(userDN, {
            objectClass: ["inetOrgPerson", "simpleSecurityObject"],
            uid: req.body.username,
            cn: req.body.gn,
            givenName: req.body.gn,
            sn: req.body.sn,
            userPassword: ""
        }, function(err) {
            if(err) {
                return res.redirect("/register");
            }

            editPassword(function(err) {
                client.unbind();
                if(err) {
                    return res.redirect("/changePassword");
                }

                res.redirect("/login");
            });
        });
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
};
