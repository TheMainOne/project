import { verifyAccess } from "../utils/jwt.js";
import User from "../models/user.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = verifyAccess(token);
    const user = await User.findById(decoded.sub).lean();
    if (!user || !user.isActive) return res.status(401).json({ error: "Unauthorized" });

    req.user = { id: user._id, email: user.email, roles: user.roles };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
