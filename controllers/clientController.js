import Client from "../models/Client.js";

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

// 🔹 Получить одного клиента по ID или slug
export const getClient = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;

    const client = await Client.findOne({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
    });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json(client);
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
