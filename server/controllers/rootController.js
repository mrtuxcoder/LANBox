function getApiStatus(req, res) {
  res.json({
    name: "LANBox",
    message: "LANBox photo API is running",
  });
}

module.exports = { getApiStatus };
