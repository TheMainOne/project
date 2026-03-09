import User from "../models/user.js";
import Token from "../models/token.js";
import dotenv from "dotenv";
import { signAccess, signRefresh, signExtensionAccess, verifyRefresh } from "../utils/jwt.js";
import ms from "ms";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";

dotenv.config({ path: "/home/ec2-user/project/.env" });

const googleOauthClient = new OAuth2Client();

function parseExpiryToDate(expStr, fallback = "30d") {
  const dur = ms(expStr || fallback); // "30d" -> ms
  return new Date(Date.now() + dur);
}

function toPublicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    sites: user.sites || []
  };
}

async function issueTokens(user, req) {
  const accessToken = signAccess({ sub: user._id.toString(), email: user.email });
  const refreshToken = signRefresh({ sub: user._id.toString() });

  await Token.create({
    userId: user._id,
    refreshToken,
    expiresAt: parseExpiryToDate(process.env.JWT_REFRESH_EXPIRES),
    userAgent: req.headers["user-agent"],
    ip: req.ip
  });

  return { accessToken, refreshToken };
}

/** POST /api/auth/register */
export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({ email, password, name });

    // ⚠️ если нет секрета — тут падает
    const { accessToken, refreshToken } = await issueTokens(user, req);

    return res.status(201).json({
      user: toPublicUser(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (err) {
    return next(err);
  }
};


/** POST /api/auth/login */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const { accessToken, refreshToken } = await issueTokens(user, req);


    
    return res.json({
      user: toPublicUser(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/auth/google */
export const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const audience = process.env.GOOGLE_CLIENT_ID_FOR_AUTH;

    if (!audience) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID_FOR_AUTH is missing" });
    }

    let payload;
    try {
      const ticket = await googleOauthClient.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const email = payload?.email?.toLowerCase().trim();
    const googleId = payload?.sub;
    const name = payload?.name?.trim();

    if (!email || !googleId) {
      return res.status(401).json({ error: "Invalid Google token payload" });
    }

    if (payload.email_verified === false) {
      return res.status(403).json({ error: "Google email is not verified" });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        name,
        googleId,
        emailVerified: true,
        password: randomBytes(32).toString("hex"),
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
        loginCount: 1
      });
    } else {
      if (user.googleId && user.googleId !== googleId) {
        return res.status(409).json({ error: "Google account mismatch for this email" });
      }

      if (!user.googleId) user.googleId = googleId;
      if (!user.name && name) user.name = name;
      if (!user.emailVerified) user.emailVerified = true;
      user.lastLoginAt = new Date();
      user.lastSeenAt = new Date();
      user.loginCount = (user.loginCount || 0) + 1;
      await user.save();
    }

    const { accessToken, refreshToken } = await issueTokens(user, req);

    return res.json({
      user: toPublicUser(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/auth/refresh */
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

    const stored = await Token.findOne({ refreshToken, revokedAt: { $exists: false } });
    if (!stored) return res.status(401).json({ error: "Invalid refresh token" });

    const decoded = verifyRefresh(refreshToken);
    const accessToken = signAccess({ sub: decoded.sub });
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
};


/** POST /api/auth/logout */
export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      await Token.updateOne({ refreshToken }, { $set: { revokedAt: new Date() } });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
};


/** GET /api/auth/me (protected) */
export const me = async (req, res) => {
  const u = await User.findById(req.user.sub || req.user.id)
    .lean()
    .select('_id email name roles sites isActive timezone');

  if (!u) return res.status(404).json({ error: 'User not found' });

  return res.json({
    id: String(u._id),
    email: u.email,
    name: u.name,
    roles: u.roles || ['user'],
    sites: u.sites || [],       
    isActive: u.isActive !== false,
    timezone: u.timezone || 'UTC',
  });
};


/** POST /api/auth/extension-token (protected) */
export const issueExtensionToken = async (req, res, next) => {
  try {
    const requestedScopes = Array.isArray(req.body?.scopes) ? req.body.scopes : [];
    const allowedScopes = ["compliance:read", "compliance:analyze"];

    const scopes = requestedScopes
      .map((s) => String(s).trim())
      .filter((s) => allowedScopes.includes(s));

    if (!scopes.length) {
      return res.status(400).json({ error: "At least one valid scope is required" });
    }

    const token = signExtensionAccess({
      sub: req.user.id,
      email: req.user.email,
      scope: scopes.join(" "),
      type: "extension",
    });

    return res.json({ token, scope: scopes.join(" ") });
  } catch (err) {
    return next(err);
  }
};