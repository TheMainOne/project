// middleware/authz.js
import { verifyAccess } from "../utils/jwt.js";
import User from "../models/user.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = verifyAccess(token); // -> { sub, email, roles? }

    // тянем только нужные поля
    const user = await User.findById(decoded.sub)
      .select("_id email roles sites isActive timezone")
      .lean();

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.isActive === false) return res.status(403).json({ error: "User is deactivated" });

    req.user = {
      id: String(user._id),
      email: user.email,
      roles: user.roles || [],
      sites: user.sites || [],
      timezone: user.timezone || "UTC",
    };

    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}


export const requireRoles = (allowed = []) => (req, res, next) => {
  const have = (req.user?.roles || []).map(String);
  const ok = allowed.length === 0 || allowed.some(r => have.includes(r));
  if (!ok) return res.status(403).json({ error: "Forbidden" });
  next();
};