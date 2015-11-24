// TODO: proxy tokens

var express = require("express");
var bodyParser = require("body-parser");
var session = require("express-session");
var RedisStore = require('connect-redis')(session);
var adaro = require("adaro");

var config = require("./config.js");
var redisc = require("./redis.js");
var passport = require("./passport.js");
var routes = require("./routes");

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}

var app = express();
app.engine("dust", adaro());
app.set("view engine", "dust");
app.set("views", config.viewsDir);
app.use(express.static(config.publicDir));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(session({
    store: new RedisStore({
        client: redisc,
        prefix: config.sessionPrefix,
    }),
    secret: "thisistotallysecret",
    resave: false,
    saveUninitialized: false,
    name: "TGC-session",
    cookie: { domain: "."+config.memberSite }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(routes);

// All set up, let's rock!
app.listen(12000);
