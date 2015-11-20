exports.get = function(req, res) {
    if(req.isAuthenticated()) {
      res.render("logout");
    } else {
      res.redirectToService();
    }
};

exports.post = function(req, res) {
    req.logout();
    res.redirectToService();
};
