var services = require("../../../services.js");

exports.get = function(req, res) {
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
};

exports.post = function(req, res) {
    if(req.body.delete !== undefined) {
        services.deleteService(req.body.name, redirect);
    } else {
        services.modifyService(req.body.name, req.body.url, req.body.site == "member", redirect);
    }
    function redirect(err) {
        res.redirect("/listServices");
    }
};
