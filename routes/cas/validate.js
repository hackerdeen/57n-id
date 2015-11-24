var xmlbuilder = require("xmlbuilder");
var tickets = require("../../tickets.js");

exports.cas1 = function(req, res) {
    if(!req.query.ticket || !req.query.ticket.startsWith("ST-")) {
        return res.send("no\n");
    }

    tickets.load(req.query.ticket, true, function(err, info) {
        if(!err && info.site == req.hostname && info.service == req.query.service && (!req.query.renew || info.newLogin)) {
            res.send("yes\n");
        } else {
            res.send("no\n");
        }
    });
};

exports.cas3 = function(req, res) {
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

    tickets.load(ticket, true, function(error, info) {
        if(error) {
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
    });

    function err(code, message) {
        root.ele("proxyFailure", {code: code}, message);
        res.send(root.toString());
    }
};
