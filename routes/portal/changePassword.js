var ldap = require("ldapjs");
var asn1 = require("asn1");

var config = require("../../config.js");

exports.get = function(req, res) {
    res.render("change-password");
};

exports.post = function(req, res) {
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
};
