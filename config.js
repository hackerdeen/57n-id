var path = require("path");
var fs = require("fs");

// Configurable
exports.memberSite = memberSite = "id.57north.org.uk";
exports.guestSite = guestSite = "guest."+memberSite;
exports.ldapUrl = ldapUrl = "ldap://localhost";
exports.ldapUsersDN = ldapUsersDN = "ou=users,dc=57north,dc=org,dc=uk";
exports.ldapGroupsDN = ldapGroupsDN = "ou=groups,dc=57north,dc=org,dc=uk";
exports.memberGroup = memberGroup = "cn=members,"+ldapGroupsDN;
exports.adminGroup = adminGroup = "cn=id-admins,"+ldapGroupsDN;
exports.idSystemDN = idSystemDN = "uid=id-admin,ou=special-users,dc=57north,dc=org,dc=uk";
exports.idSystemPassword = idSystemPassword = fs.readFileSync(path.join(__dirname, "ldap-password.txt"), "utf8").trim();
exports.redisUrl = redisUrl = "/tmp/redis-57n-id.sock";

// Probably don't touch these
exports.publicDir = publicDir = path.join(__dirname, "public");
exports.viewsDir = viewsDir = path.join(__dirname, "views");
exports.servicesKey = servicesKey = "services";
exports.userKey = userKey = "u:%s";
exports.ticketKey = ticketKey = "t:%s";
exports.sessionPrefis = sessionPrefix = "s:";
