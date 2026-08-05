import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { issueExtensionToken } from "../controllers/authController.js";
import { extensionTokenSchema } from "../validators/authValidators.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("ECN extension scopes require the ecn_user role", async () => {
  const res = responseRecorder();
  await issueExtensionToken(
    {
      body: { scopes: ["ecn:read", "ecn:analyze"] },
      user: { id: "user-1", email: "user@example.test", roles: ["user"] },
    },
    res,
    (error) => { throw error; }
  );
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /ecn_user/);
});
test("ecn_user can receive read/analyze extension scopes but never ecn:write", async () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "ecn-auth-test-secret-that-is-long-enough";
  try {
    const res = responseRecorder();
    await issueExtensionToken(
      {
        body: { scopes: ["ecn:read", "ecn:analyze"] },
        user: {
          id: "507f1f77bcf86cd799439011",
          email: "mdc@example.test",
          roles: ["user", "ecn_user"],
        },
      },
      res,
      (error) => { throw error; }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scope, "ecn:read ecn:analyze");
    const claims = jwt.verify(res.body.token, process.env.JWT_ACCESS_SECRET);
    assert.equal(claims.type, "extension");
    assert.equal(claims.scope, "ecn:read ecn:analyze");
    assert.equal(claims.scope.includes("ecn:write"), false);

    const invalid = extensionTokenSchema.validate({ scopes: ["ecn:write"] });
    assert.ok(invalid.error);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});

test("existing compliance extension scopes remain available without ecn_user", async () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "ecn-auth-test-secret-that-is-long-enough";
  try {
    const res = responseRecorder();
    await issueExtensionToken(
      {
        body: { scopes: ["compliance:read"] },
        user: { id: "507f1f77bcf86cd799439011", email: "user@example.test", roles: ["user"] },
      },
      res,
      (error) => { throw error; }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scope, "compliance:read");
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});
