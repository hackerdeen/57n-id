var xmlbuilder = require("xmlbuilder");
var tickets = require("../../tickets.js");

module.exports = function(req, res) {
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

    tickets.load(pgt, false, function(error, info) {
        if(error) {
            return err("INVALID_TICKET", "Invalid ticket - ticket does not exist.");
        }
        if(info.site != req.hostname) {
            return err("INVALID_TICKET", "Invalid ticket - wrong domain.");
        }

        var proxies = [info.pgtUrl];
        proxies.push.apply(proxies, info.proxies);
        tickets.create("PT-", {
            site: info.site,
            service: targetService,
            username: info.username,
            authenticationDate: info.authenticationDate,
            newLogin: info.newLogin,
            proxies: proxies
        }, function(err, ticket) {
            var success = root.ele("proxySuccess");
            success.ele("proxyTicket", ticket);
            res.send(root.toString());
        });
    });

    function err(code, message) {
        root.ele("proxyFailure", {code: code}, message);
        res.send(root.toString());
    }
};
