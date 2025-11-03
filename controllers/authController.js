import User from "../models/user.js";
import Token from "../models/token.js";
import { signAccess, signRefresh, verifyRefresh } from "../utils/jwt.js";
import ms from "ms";

function parseExpiryToDate(expStr, fallback = "30d") {
  const dur = ms(expStr || fallback); // "30d" -> ms
  return new Date(Date.now() + dur);
}

/** POST /api/auth/register */
export const register = async (req, res) => {
  const { email, password, name } = req.body;

  const exists = await User.findOne({ email }).lean();
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const user = await User.create({ email, password, name });

  const accessToken = signAccess({ sub: user._id.toString(), email: user.email });
  const refreshToken = signRefresh({ sub: user._id.toString() });

  await Token.create({
    userId: user._id,
    refreshToken,
    expiresAt: parseExpiryToDate(process.env.JWT_REFRESH_EXPIRES),
    userAgent: req.headers["user-agent"],
    ip: req.ip
  });

  return res.status(201).json({
    user: { id: user._id, email: user.email, name: user.name, roles: user.roles },
    tokens: { accessToken, refreshToken }
  });
};

/** POST /api/auth/login */
export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await user.comparePassword(password);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const accessToken = signAccess({ sub: user._id.toString(), email: user.email });
  const refreshToken = signRefresh({ sub: user._id.toString() });

  await Token.create({
    userId: user._id,
    refreshToken,
    expiresAt: parseExpiryToDate(process.env.JWT_REFRESH_EXPIRES),
    userAgent: req.headers["user-agent"],
    ip: req.ip
  });

  return res.json({
    user: { id: user._id, email: user.email, name: user.name, roles: user.roles },
    tokens: { accessToken, refreshToken }
  });
};

/** POST /api/auth/refresh */
export const refresh = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

  const stored = await Token.findOne({ refreshToken, revokedAt: { $exists: false } });
  if (!stored) return res.status(401).json({ error: "Invalid refresh token" });

  try {
    const decoded = verifyRefresh(refreshToken);
    const accessToken = signAccess({ sub: decoded.sub });
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
};

/** POST /api/auth/logout */
export const logout = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await Token.updateOne({ refreshToken }, { $set: { revokedAt: new Date() } });
  }
  return res.json({ ok: true });
};

/** GET /api/auth/me (protected) */
export const me = async (req, res) => {
  // req.user проставляется в middleware requireAuth
  return res.json({ user: req.user });
};
