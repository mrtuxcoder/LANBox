const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");

const app = require("../app");

test("GET /health reports that the LANBox server is running", async () => {
  const response = await request(app).get("/health").expect(200);

  assert.deepEqual(response.body, {
    name: "LANBox",
    message: "LANBox server is running",
  });
});
