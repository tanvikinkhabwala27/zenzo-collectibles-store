const handleRequest = require("../server");

module.exports = async function vercelHandler(req, res) {
  const route = Array.isArray(req.query?.path)
    ? req.query.path.join("/")
    : String(req.query?.path || "");
  const incomingUrl = new URL(req.url, "http://localhost");
  incomingUrl.searchParams.delete("path");
  req.url = `/api/${route}${incomingUrl.search}`;
  return handleRequest(req, res);
};
