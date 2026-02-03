// controllers/clientController.js
import crypto from "crypto";
import mongoose from "mongoose";
import Client from "../models/Client.js";
import User from "../models/user.js";
import ClientDocument from "../models/ClientDocument.js";
import s3 from "../services/amazon/s3Client.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

function slugify(s = "") {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function findClientByIdOrSlug(idOrSlug, projection = null) {
  const filter = isObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  return Client.findOne(filter, projection);
}

async function ensureUniqueSlug(base, currentId = null) {
  let slug = slugify(base);
  let counter = 1;

  // если обновляем и slug не менялся — ок
  const exists = async (s) => {
    const q = { slug: s };
    if (currentId) q._id = { $ne: currentId };
    return Client.exists(q);
  };

  while (await exists(slug)) {
    slug = `${slugify(base)}-${counter++}`;
  }
  return slug;
}

// преобразуем частичный config в dot-пути: { "config.welcomeMessage": "...", ... }
function buildConfigDotUpdates(cfg = {}, prefix = "config") {
  const out = {};
  const walk = (obj, pfx) => {
    Object.entries(obj || {}).forEach(([k, v]) => {
      const key = `${pfx}.${k}`;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v, key);
      } else {
        out[key] = v;
      }
    });
  };
  walk(cfg, prefix);
  return out;
}

// нормализация users массива согласно схеме
function normalizeUsers(users = []) {
  return (users || []).map(u => {
    const userId =
      typeof u.userId === "string" && isObjectId(u.userId)
        ? new mongoose.Types.ObjectId(u.userId)
        : u.userId; // допускаем уже ObjectId
    return {
      userId,
      role: u.role || "viewer",
      addedAt: u.addedAt ? new Date(u.addedAt) : new Date(),
    };
  });
}

// ====== CREATE ======
export const createClient = async (req, res, next) => {
  try {
    const { name, slug, siteId, isActive, apiKey, config, users } = req.body || {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Field 'name' is required" });
    }

    // slug
    const finalSlug = await ensureUniqueSlug(slug || name);

    // siteId (если нет — сгенерим)
    const finalSiteId = siteId || `SITE_${Date.now().toString(36).toUpperCase()}`;

    // apiKey (если нет — сгенерим безопасный)
    const finalApiKey = apiKey || crypto.randomBytes(24).toString("hex");

    // users (опционально)
    const finalUsers = Array.isArray(users) ? normalizeUsers(users) : [];

    const client = await Client.create({
      name,
      slug: finalSlug,
      siteId: finalSiteId,
      isActive: isActive !== undefined ? !!isActive : true,
      apiKey: finalApiKey,
      config: config || {}, // mongoose сам проставит дефолты
      users: finalUsers,
    });

    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
};

// ====== LIST (с фильтрацией/пагинацией) ======
export const getAllClients = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const { active, q } = req.query;
    const scope = req.accessScope;

    const filter = {};
    if (scope && !scope.isSuperadmin) {
      if (!scope.allowedSiteIds.length) {
        return res.json({ total: 0, page, clients: [] });
      }
      filter.siteId = { $in: scope.allowedSiteIds };
    }

    if (active !== undefined) filter.isActive = active === "true";
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { siteId: { $regex: q, $options: "i" } },
      ];
    }

    const [clients, total] = await Promise.all([
      Client.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Client.countDocuments(filter),
    ]);

    res.json({ total, page, clients });
  } catch (err) {
    next(err);
  }
};

// ====== GET ONE (с простой статистикой) ======
export const getClient = async (req, res) => {
  try {
     const idOrSlug = req.params.id;
    const byId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);

    const client = await (byId
      ? Client.findById(idOrSlug).lean()
      : Client.findOne({ slug: idOrSlug }).lean());

    if (!client) return res.status(404).json({ error: "Client not found" });


    const [docCount, userCount] = await Promise.all([
      ClientDocument.countDocuments({ clientId: client._id }),
      Promise.resolve((client.users || []).length),
    ]);

    return res.json({
      ...client,
      stats: { documents: docCount, users: userCount },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// ====== UPDATE (частичный, со слиянием config; можно заменить users) ======
export const updateClient = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const payload = req.body || {};
    const client = await findClientByIdOrSlug(idOrSlug);

    if (!client) return res.status(404).json({ error: "Client not found" });

    const updates = {};

    // name
    if (typeof payload.name === "string") updates.name = payload.name;

    // slug (с уникальностью)
    if (payload.slug) {
      const newSlug = await ensureUniqueSlug(payload.slug, client._id);
      updates.slug = newSlug;
    }

    // siteId
    if (typeof payload.siteId === "string") updates.siteId = payload.siteId;

    // isActive
    if (typeof payload.isActive === "boolean") updates.isActive = payload.isActive;

    // apiKey (можно задать/поменять явно)
    if (typeof payload.apiKey === "string") updates.apiKey = payload.apiKey;

    // config — частичное слияние через dot-path
    if (payload.config && typeof payload.config === "object") {
      Object.assign(updates, buildConfigDotUpdates(payload.config));
    }

    // users — если передали массив — заменяем целиком
    if (Array.isArray(payload.users)) {
      updates.users = normalizeUsers(payload.users);
    }

    const updated = await Client.findByIdAndUpdate(
      client._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ====== DELETE ======
export const deleteClient = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const client = await findClientByIdOrSlug(idOrSlug);

    if (!client) return res.status(404).json({ error: "Client not found" });

    await Client.deleteOne({ _id: client._id });

    res.json({ message: "Client deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// ====== USERS MANAGEMENT (удобные узкие endpoints) ======

// добавить пользователя в client.users
export const addClientUser = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const { userId, role = "viewer" } = req.body || {};
    if (!userId || !isObjectId(userId)) {
      return res.status(400).json({ error: "Valid 'userId' is required" });
    }

    const client = await findClientByIdOrSlug(idOrSlug);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const entry = {
      userId: new mongoose.Types.ObjectId(userId),
      role,
      addedAt: new Date(),
    };

    // не дублировать
    const already = (client.users || []).some(
      u => String(u.userId) === String(entry.userId)
    );
    if (already) return res.status(409).json({ error: "User already added to client" });

    client.users.push(entry);
    await client.save();

    res.json(client);
  } catch (err) {
    next(err);
  }
};

// изменить роль пользователя в client.users
export const updateClientUserRole = async (req, res, next) => {
  try {
    const { idOrSlug, userId } = req.params;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ error: "Field 'role' is required" });

    const client = await findClientByIdOrSlug(idOrSlug);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const idx = (client.users || []).findIndex(u => String(u.userId) === String(userId));
    if (idx === -1) return res.status(404).json({ error: "User not found in client" });

    client.users[idx].role = role;
    await client.save();

    res.json(client);
  } catch (err) {
    next(err);
  }
};

// удалить пользователя из client.users
export const removeClientUser = async (req, res, next) => {
  try {
    const { idOrSlug, userId } = req.params;
    const client = await findClientByIdOrSlug(idOrSlug);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const before = client.users.length;
    client.users = client.users.filter(u => String(u.userId) !== String(userId));
    if (client.users.length === before) {
      return res.status(404).json({ error: "User not found in client" });
    }

    await client.save();
    res.json(client);
  } catch (err) {
    next(err);
  }
};

// ====== API KEY ROTATION ======
export const rotateClientApiKey = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const client = await findClientByIdOrSlug(idOrSlug);
    if (!client) return res.status(404).json({ error: "Client not found" });

    client.apiKey = crypto.randomBytes(24).toString("hex");
    await client.save();

    res.json({ apiKey: client.apiKey });
  } catch (err) {
    next(err);
  }
};

// ====== Вспомогательные, как у тебя ======
export async function listClientUsers(req, res) {
  try {
    const idOrSlug = req.params.id;
    const client = await findClientByIdOrSlug(idOrSlug, "_id");
    if (!client) return res.status(404).json({ error: "Client not found" });

    // По users коллекции, если ты используешь поле user.clientIds
    const users = await User.find({ clientIds: client._id }).lean({ virtuals: true });

    const out = users.map(u => {
      const { password, __v, ...rest } = u;
      return { ...rest, id: String(u._id) };
    });

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function listClientDocuments(req, res) {
  try {
    const idOrSlug = req.params.id;
    const client = await findClientByIdOrSlug(idOrSlug, "_id");
    if (!client) return res.status(404).json({ error: "Client not found" });

    const docs = await ClientDocument.find({ clientId: client._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(
      docs.map(d => ({
        _id: d._id,
        title: d.title,
        fileName: d.fileName,
        fileSize: d.fileSize,
        isActive: d.isActive,
        createdAt: d.createdAt,
        s3Url: d.s3Url,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
