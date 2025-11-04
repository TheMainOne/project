import User from "../models/user.js";
import Token from "../models/token.js";
import { signAccess, signRefresh, verifyRefresh } from "../utils/jwt.js";
import ms from "ms";

function parseExpiryToDate(expStr, fallback = "30d") {
  const dur = ms(expStr || fallback); // "30d" -> ms
  return new Date(Date.now() + dur);
}

/** POST /api/auth/register */
export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({ email, password, name });

    // ⚠️ если нет секрета — тут падает
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
      user: { id: user._id, email: user.email, name: user.name, roles: user.roles, sites: user.sites || [] },
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