import Item from "../models/Item.js";
import { bulkLookupItems, lookupSingleItem } from "../services/compliance/itemLookupService.js";

export const searchItems = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const partial = req.query.partial !== "false";

    if (!q) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const result = await lookupSingleItem(q, { allowPartial: partial });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const bulkLookup = async (req, res, next) => {
  try {
    const { queries, partial = false } = req.body || {};

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: "Field 'queries' must be a non-empty array" });
    }

    const results = await bulkLookupItems(queries, {
      allowPartial: !!partial,
    });

    return res.json({
      ok: true,
      total: results.length,
      results,
    });
  } catch (err) {
    next(err);
  }
};

export const getItemById = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id).lean();

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    return res.json(item);
  } catch (err) {
    next(err);
  }
};