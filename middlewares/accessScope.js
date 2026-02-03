import mongoose from "mongoose";
import Client from "../models/Client.js";
import User from "../models/user.js";

function uniqStrings(values = []) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function getActiveSiteIds(sites = []) {
  if (!Array.isArray(sites)) return [];
  return uniqStrings(
    sites
      .filter((s) => s?.isActive !== false)
      .map((s) => s?.siteId)
  );
}

function isSuperadmin(user) {
  return Array.isArray(user?.roles) && user.roles.includes("superadmin");
}

function hasSiteAccess(scope, siteId) {
  if (scope?.isSuperadmin) return true;
  const sid = String(siteId || "").trim();
  return !!sid && Array.isArray(scope?.allowedSiteIds) && scope.allowedSiteIds.includes(sid);
}

function buildClientLookupFilter(identifier) {
  const value = String(identifier || "").trim();
  const or = [
    { slug: value },
    { siteId: value },
    { domains: value },
  ];

  if (mongoose.isValidObjectId(value)) {
    or.unshift({ _id: new mongoose.Types.ObjectId(value) });
  }

  return { $or: or };
}

async function resolveClient(identifier) {
  if (!identifier) return null;
  return Client.findOne(buildClientLookupFilter(identifier))
    .select("_id siteId")
    .lean();
}

function extractSiteIdsFromPayload(body = {}) {
  const siteIds = [];

  if (Array.isArray(body?.sites)) {
    for (const item of body.sites) {
      if (typeof item === "string") siteIds.push(item);
      else if (item?.siteId) siteIds.push(item.siteId);
    }
  }

  if (Array.isArray(body?.add)) {
    for (const item of body.add) {
      if (typeof item === "string") siteIds.push(item);
      else if (item?.siteId) siteIds.push(item.siteId);
    }
  }

  if (Array.isArray(body?.remove)) {
    for (const item of body.remove) {
      if (typeof item === "string") siteIds.push(item);
      else if (item?.siteId) siteIds.push(item.siteId);
    }
  }

  return uniqStrings(siteIds);
}

function hasOverlap(left = [], right = []) {
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  return left.some((v) => rightSet.has(v));
}

export function attachAccessScope(req, _res, next) {
  const allowedSiteIds = getActiveSiteIds(req.user?.sites || []);
  req.accessScope = {
    isSuperadmin: isSuperadmin(req.user),
    allowedSiteIds,
  };
  next();
}

export function enforceClientAccessByParam() {
  return async (req, res, next, value) => {
    try {
      const scope = req.accessScope;
      if (!scope) return res.status(500).json({ error: "Access scope is not initialized" });
      if (scope.isSuperadmin) return next();

      const client = await resolveClient(value);
      if (!client) return next(); // let controller return 404

      if (!hasSiteAccess(scope, client.siteId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function enforceSitesPayloadWithinScope(req, res, next) {
  const scope = req.accessScope;
  if (!scope || scope.isSuperadmin) return next();

  const payloadSiteIds = extractSiteIdsFromPayload(req.body);
  if (!payloadSiteIds.length) return next();

  const denied = payloadSiteIds.filter((sid) => !scope.allowedSiteIds.includes(sid));
  if (denied.length) {
    return res.status(403).json({
      error: "Forbidden",
      deniedSiteIds: denied,
    });
  }

  return next();
}

export function enforceUserAccessByParam() {
  return async (req, res, next, value) => {
    try {
      const scope = req.accessScope;
      if (!scope) return res.status(500).json({ error: "Access scope is not initialized" });
      if (scope.isSuperadmin) return next();

      if (String(req.user?.id || "") === String(value)) return next();
      if (!mongoose.isValidObjectId(value)) return next();

      const target = await User.findById(value).select("sites.siteId").lean();
      if (!target) return next(); // let controller return 404

      const targetSiteIds = uniqStrings((target.sites || []).map((s) => s?.siteId));
      if (!hasOverlap(scope.allowedSiteIds, targetSiteIds)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
