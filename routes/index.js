var express = require("express");

var router = module.exports = express.Router();
router.use(require("./cas"));
router.use(require("./portal"));
