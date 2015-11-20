var path = require("path");

// Configurable
exports.memberSite = memberSite = "id.57north.org.uk";
exports.guestSite = guestSite = "guest."+memberSite;
exports.ldapUrl = ldapUrl = "ldap://localhost";
exports.ldapUsersDN = ldapUsersDN = "ou=users,dc=57north,dc=org,dc=uk";
exports.ldapGroupsDN = ldapGroupsDN = "ou=groups,dc=57north,dc=org,dc=uk";
exports.memberGroup = memberGroup = "cn=members,"+ldapGroupsDN;
exports.adminGroup = adminGroup = "cn=id-admins,"+ldapGroupsDN;
exports.idSystemDN = idSystemDN = "uid=id-admin,ou=special-users,dc=57north,dc=org,dc=uk";
exports.idSystemPassword = idSystemPassword = "poor stood burst island";

// Probably don't touch these
exports.publicDir = publicDir = path.join(__dirname, "public");
exports.viewsDir = viewsDir = path.join(__dirname, "views");
exports.servicesFile = servicesFile = path.join(__dirname, "services.json");
exports.usersDir = usersDir = path.join(__dirname, "users");
exports.ticketsDir = ticketsDir = path.join(__dirname, "tickets");
exports.sessionsDir = sessionsDir = path.join(__dirname, "sessions");
