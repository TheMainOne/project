// controllers/adminUsersController.js
import User from "../models/user.js";
import ms from "ms";

/* утилиты  */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

const idToString = (u) => ({ ...u, id: String(u._id), _id: undefined });

/** GET /api/admin/users
 *  ?q=search&role=admin&site=mysite.com::default&active=true&page=1&limit=20&sort=-createdAt
 */
export async function listUsers(req, res, next) {
  try {
    const {
      q,
      role,
      site,
      active,
      page = 1,
      limit = 20,
      sort = "-createdAt",
      select,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const filter = {};
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
      ];
    }

    if (role) filter.roles = { $in: [role] };
    if (req.query.clientId) filter.clientIds = req.query.clientId;

    const scope = req.accessScope;
    if (scope && !scope.isSuperadmin) {
      if (!scope.allowedSiteIds.length) {
        return res.json({ total: 0, page: pageNum, limit: limitNum, users: [] });
      }
      if (site && !scope.allowedSiteIds.includes(site)) {
        return res.json({ total: 0, page: pageNum, limit: limitNum, users: [] });
      }
      filter["sites.siteId"] = site ? site : { $in: scope.allowedSiteIds };
    } else if (site) {
      filter["sites.siteId"] = site;
    }

    const proj = (select || "_id email name roles isActive clientIds sites.createdAt sites.siteId sites.clientId sites.role sites.isActive createdAt")
      .split(",");

    if (active === "true") filter.isActive = { $ne: false };
    if (active === "false") filter.isActive = false;

    const [items, total] = await Promise.all([
      User.find(filter)
        .select(proj.join(" "))
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      total,
      page: pageNum,
      limit: limitNum,
      users: items.map(idToString),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/users/:id */
export async function getUserById(req, res, next) {
  try {
const u = await User.findById(req.params.id)
  .select("_id email name roles isActive timezone clientIds sites.siteId sites.clientId sites.role sites.isActive createdAt")
  .lean();

    if (!u) return res.status(404).json({ error: "Not found" });
    return res.json(idToString(u));
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/users  {email, password, name, roles?, sites?, isActive?} */
/** POST /api/admin/users
 *  body: { email, password, name?, roles?, isActive?, timezone?, clientIds?: string[], sites?: SiteAccess[] }
 */
export async function createUser(req, res, next) {
  try {
    const body = pick(req.body, ["email","password","name","roles","isActive","timezone","clientIds","sites"]);
    if (!body.email || !body.password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const exists = await User.findOne({ email: body.email }).lean();
    if (exists) return res.status(409).json({ error: "Email already exists" });

    // нормализация clientIds -> массив строк/ObjectId
    if (body.clientIds && !Array.isArray(body.clientIds)) {
      return res.status(400).json({ error: "clientIds must be an array" });
    }

    // нормализация sites -> массив объектов {siteId, clientId?, role?, isActive?}
    if (body.sites && !Array.isArray(body.sites)) {
      return res.status(400).json({ error: "sites must be an array of objects" });
    }
    if (Array.isArray(body.sites)) {
      for (const s of body.sites) {
        if (!s?.siteId) return res.status(400).json({ error: "each site must include siteId" });
      }
    }

    const user = await User.create(body);

    const out = await User.findById(user._id)
      .select("_id email name roles isActive timezone clientIds sites.siteId sites.clientId sites.role sites.isActive createdAt")
      .lean();

    return res.status(201).json(idToString(out));
  } catch (err) {
    next(err);
  }
}


/** PATCH /api/admin/users/:id  {name?, email?, roles?, sites?, isActive?, timezone?} */
export async function updateUser(req, res, next) {
  try {
    const updates = pick(req.body, ["name", "email", "roles", "sites", "isActive", "timezone"]);

// нельзя снимать роль superadmin у последнего супер-админа
    if (Array.isArray(updates.roles)) {
      const target = await User.findById(req.params.id).lean();
      if (!target) return res.status(404).json({ error: "Not found" });

      const isTargetSuper = (target.roles || []).includes("superadmin");
      const willBeSuper = updates.roles.includes("superadmin");

      if (isTargetSuper && !willBeSuper) {
        const superCount = await User.countDocuments({ roles: "superadmin", _id: { $ne: target._id } });
        if (superCount === 0) {
          return res.status(400).json({ error: "Cannot remove the last superadmin" });
        }
      }
    }

    const u = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
      .select("_id email name roles sites isActive createdAt timezone")
      .lean();

    if (!u) return res.status(404).json({ error: "Not found" });
    return res.json(idToString(u));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/users/:id/password  {password} */
export async function updateUserPassword(req, res, next) {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 chars" });
    }
    const u = await User.findById(req.params.id).select("+password");
    if (!u) return res.status(404).json({ error: "Not found" });
    u.password = password; // pre-save hook Ð² Ð¼Ð¾Ð´ÐµÐ»Ð¸ Ð·Ð°Ñ…ÐµÑˆÐ¸Ñ€ÑƒÐµÑ‚
    await u.save();
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/users/:id/roles  {roles: string[]}  (Ñ‚Ð¾Ð»ÑŒÐºÐ¾ superadmin) */
export async function updateUserRoles(req, res, next) {
  try {
    const { roles } = req.body || {};
    if (!Array.isArray(roles)) return res.status(400).json({ error: "roles must be an array" });

    // защита «последнего супер-админа»
    const target = await User.findById(req.params.id).lean();
    if (!target) return res.status(404).json({ error: "Not found" });

    const isTargetSuper = (target.roles || []).includes("superadmin");
    const willBeSuper = roles.includes("superadmin");
    if (isTargetSuper && !willBeSuper) {
      const superCount = await User.countDocuments({ roles: "superadmin", _id: { $ne: target._id } });
      if (superCount === 0) {
        return res.status(400).json({ error: "Cannot remove the last superadmin" });
      }
    }

    const u = await User.findByIdAndUpdate(req.params.id, { $set: { roles } }, { new: true })
      .select("_id email name roles sites isActive")
      .lean();

    return res.json(idToString(u));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/users/:id/sites  {sites: string[] | {add?:string[], remove?:string[]}} */
export async function updateUserSites(req, res, next) {
  try {
    let update;
    if (Array.isArray(req.body?.sites)) {
      update = { $set: { sites: req.body.sites } };
    } else {
      const add = Array.isArray(req.body?.add) ? req.body.add : [];
      const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];
      update = {
        ...(add.length ? { $addToSet: { sites: { $each: add } } } : {}),
        ...(remove.length ? { $pull: { sites: { $in: remove } } } : {}),
      };
    }

    const u = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select("_id email name roles sites isActive")
      .lean();

    if (!u) return res.status(404).json({ error: "Not found" });
    return res.json(idToString(u));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/users/:id/deactivate {isActive:false} */
export async function deactivateUser(req, res, next) {
  try {
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean")
      return res.status(400).json({ error: "isActive boolean required" });

    // защита «последнего супер-админа»
    if (isActive === false) {
      const target = await User.findById(req.params.id).lean();
      if ((target?.roles || []).includes("superadmin")) {
        const others = await User.countDocuments({
          roles: "superadmin",
          _id: { $ne: target._id },
          isActive: { $ne: false },
        });
        if (others === 0) return res.status(400).json({ error: "Cannot deactivate the last superadmin" });
      }
    }

    const u = await User.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true })
      .select("_id email name roles sites isActive")
      .lean();

    return res.json(idToString(u));
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/users/:id  (Ð¶Ñ‘ÑÑ‚ÐºÐ¾Ðµ ÑƒÐ´Ð°Ð»ÐµÐ½Ð¸Ðµ, Ñ‚Ð¾Ð»ÑŒÐºÐ¾ superadmin) */
export async function deleteUserHard(req, res, next) {
  try {
    const target = await User.findById(req.params.id).lean();
    if (!target) return res.status(404).json({ error: "Not found" });
    if ((target.roles || []).includes("superadmin")) {
      const others = await User.countDocuments({ roles: "superadmin", _id: { $ne: target._id } });
      if (others === 0) return res.status(400).json({ error: "Cannot delete the last superadmin" });
    }
    await User.deleteOne({ _id: target._id });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
