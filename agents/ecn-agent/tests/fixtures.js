import { APPROVALS, FIELDS, normalizeSheet } from "../src/smartsheet.js";
export const SHEET_ID = "5485143814104964";

export function rawSheet({ count = 1, offset = 0, length = count, version = 4 } = {}) {
  const ids = [...new Set([...Object.values(FIELDS), ...APPROVALS.flatMap(([, contact, status]) => [contact, status])])];
  const columns = ids.map((id, index) => ({ id: Number(id), index, title: "Column " + index, type: "TEXT_NUMBER" }));
  return {
    id: Number(SHEET_ID),
    name: "Synthetic ECF",
    version,
    totalRowCount: count,
    columns,
    rows: Array.from({ length }, (_, i) => ({
      id: 1000 + offset + i,
      rowNumber: offset + i + 1,
      createdAt: "2026-11-17T14:00:00Z",
      modifiedAt: "2026-11-17T15:00:00Z",
      cells: [
        { columnId: Number(FIELDS.ecnNumber), value: "20261117-" + String(offset + i + 1).padStart(2, "0") },
        { columnId: Number(FIELDS.status), value: "Initial Review" },
        { columnId: Number(FIELDS.site), value: "0071 CleanPack" },
        { columnId: Number(FIELDS.itemNumber), value: "SYNTHETIC-ITEM" },
        { columnId: Number(FIELDS.itemDescription), value: "Synthetic sample" },
        { columnId: Number(FIELDS.description), value: "Test-only description." },
      ],
    })),
  };
}

export const normalizedSheet = () => normalizeSheet(rawSheet());
