var express = require("express");
var middleware = require("../../middleware.js");

var requireLogin = middleware.requireLogin,
    requireCorrectSite = middleware.requireCorrectSite,
    requireAdmin = middleware.requireAdmin;

var dashboard = require("./dashboard.js");
var services = require("./services");
var users = require("./users");
var changePassword = require("./changePassword.js");

var router = module.exports = express.Router();
router.get("/", requireLogin, requireCorrectSite, dashboard);
router.get("/listServices", requireLogin, requireCorrectSite, services.list);
router.route(/^\/(create|edit)Service$/).get(requireAdmin, requireCorrectSite, services.edit.get).
                                         post(requireAdmin, services.edit.post);
router.route("/changePassword").get(requireCorrectSite, changePassword.get).
                                post(changePassword.post);
router.get("/listUsers", requireAdmin, requireCorrectSite, users.list);
router.route(/^\/(create|edit)User$/).get(requireAdmin, requireCorrectSite, users.edit.get).
                                      post(middleware.requireAdmin, users.edit.post);
