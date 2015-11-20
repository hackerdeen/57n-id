var express = require("express");
var middleware = require("../../middleware.js");

var requireCorrectSite = middleware.requireCorrectSite;

var login = require("./login.js");
var logout = require("./logout.js");
var validate = require("./validate.js");
var proxy = require("./proxy.js");

var router = module.exports = express.Router();
router.use(require("./middleware.js"));
router.route("/login").get(login.get).post(login.post);
router.route("/logout").get(requireCorrectSite, logout.get).post(logout.post);
router.get("/validate", validate.cas1);
router.get(/\/(?:p3\/)?(service|proxy)Validate$/, validate.cas3);
router.get("/proxy", proxy);
