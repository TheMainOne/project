import Client from "../models/Client.js";
import User from "../models/user.js";
import ClientDocument from "../models/ClientDocument.js";

// 🔹 helper для slug
function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// 🔹 Создать клиента
export const createClient = async (req, res, next) => {
  try {
    const { name, slug, siteId, isActive, config } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Field 'name' is required" });
    }

    // если slug не передан — сгенерируем из имени
    let newSlug = slug ? slugify(slug) : slugify(name);
    // проверим уникальность slug
    let counter = 1;
    while (await Client.exists({ slug: newSlug })) {
      newSlug = `${slugify(name)}-${counter++}`;
    }

    const client = await Client.create({
      name,
      slug: newSlug,
      siteId: siteId || `SITE_${Date.now().toString(36).toUpperCase()}`,
      isActive: isActive !== undefined ? isActive : true,
      config: config || {},
    });

    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
};

// 🔹 Получить всех клиентов (с фильтрацией и пагинацией)
export const getAllClients = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, active } = req.query;
    const filter = {};
    if (active !== undefined) filter.isActive = active === "true";

    const clients = await Client.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Client.countDocuments(filter);
    res.json({ total, page: Number(page), clients });
  } catch (err) {
    next(err);
  }
};

// 🔹 Обновить клиента
export const updateClient = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const updateData = req.body;

    if (updateData.slug) {
      updateData.slug = slugify(updateData.slug);
    }

    const client = await Client.findOneAndUpdate(
      { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] },
      updateData,
      { new: true }
    );

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json(client);
  } catch (err) {
    next(err);
  }
};

// 🔹 Удалить клиента
export const deleteClient = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;

    const client = await Client.findOneAndDelete({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
    });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json({ message: "Client deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export async function getClient(req, res) {
  try {
    const idOrSlug = req.params.id;
    const byId = idOrSlug.match(/^[0-9a-fA-F]{24}$/);
    const client = await Client.findOne(byId ? { _id: idOrSlug } : { slug: idOrSlug })
      .lean();

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
}

export async function listClientUsers(req, res) {
  try {
    const idOrSlug = req.params.id;
    const client = await Client.findOne(idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? { _id: idOrSlug } : { slug: idOrSlug }).lean();
    if (!client) return res.status(404).json({ error: "Client not found" });

    const ids = (client.users || []).map(u => u.userId).filter(Boolean);
    const users = ids.length ? await User.find({ _id: { $in: ids } }, { email: 1 }).lean() : [];

    const emailById = Object.fromEntries(users.map(u => [String(u._id), u.email]));

    res.json((client.users || []).map(u => ({
      userId: String(u.userId),
      email: emailById[String(u.userId)] || "(unknown)",
      role: u.role,
      addedAt: u.addedAt,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}


export async function listClientDocuments(req, res) {
  try {
    const idOrSlug = req.params.id;
    const client = await Client.findOne(idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? { _id: idOrSlug } : { slug: idOrSlug });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const docs = await ClientDocument
      .find({ clientId: client._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(docs.map(d => ({
      _id: d._id,
      title: d.title,
      fileName: d.fileName,
      fileSize: d.fileSize,
      isActive: d.isActive,
      createdAt: d.createdAt,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

