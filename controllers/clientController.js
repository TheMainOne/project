// controllers/clientController.js
import Client from "../models/Client.js";
import User from "../models/user.js"; // проверь регистр и имя файла у модели

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function createClient(req, res, next) {
  try {
    // req.user должен быть установлен JWT-миддлварью
    const authUser = req.user;
    if (!authUser || !authUser._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, slug: rawSlug, siteId: rawSiteId, isActive, config } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Field 'name' is required" });
    }

    // slug и siteId по умолчанию
    const baseSlug = (typeof rawSlug === "string" && rawSlug) ? rawSlug : name;
    const slug = slugify(baseSlug);
    const siteId =
      (typeof rawSiteId === "string" && rawSiteId.trim())
        ? rawSiteId.trim()
        : `${slug || slugify(name)}::default`;

    if (!slug) return res.status(400).json({ error: "Invalid slug" });
    if (!siteId) return res.status(400).json({ error: "Invalid siteId" });

    // Проверка уникальности
    const existingBySlug = await Client.findOne({ slug }).lean();
    if (existingBySlug) {
      return res.status(409).json({ error: "Client with this slug already exists", slug });
    }

    const existingBySiteId = await Client.findOne({ siteId }).lean();
    if (existingBySiteId) {
      return res.status(409).json({ error: "Client with this siteId already exists", siteId });
    }

    // Создание клиента
    const client = await Client.create({
      name: name.trim(),
      slug,
      siteId,
      isActive: typeof isActive === "boolean" ? isActive : true,
      config: (config && typeof config === "object") ? config : {},
    });

    // Линкуем клиента к создателю
    const user = await User.findById(authUser._id);
    if (user) {
      // clientIds
      const ids = new Set((user.clientIds || []).map(String));
      ids.add(String(client._id));
      user.clientIds = Array.from(ids);

      // sites — не распыляем строку! сохраняем siteId в поле
      const sites = Array.isArray(user.sites) ? user.sites : [];
      const hasSite = sites.some((s) => s && s.siteId === siteId);
      if (!hasSite) {
        sites.push({
          siteId,
          role: "owner",
          permissions: [],
          isActive: true,
          joinedAt: new Date(),
        });
      }
      user.sites = sites;

      await user.save();
    }

    // Ответ
    return res.status(201).json({
      id: String(client._id),
      name: client.name,
      slug: client.slug,
      siteId: client.siteId,
      is_active: client.isActive,
      created_at: client.createdAt,
      config: client.config || {},
    });
  } catch (err) {
    console.error("[createClient] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
