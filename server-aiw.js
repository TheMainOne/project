import express from "express";
import router from "./api/widget/widget.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Хелсчек
app.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));

// Монтируем твой роутер ИМЕННО на корень -> конечные пути: /chat и /ping (из aiw.js)
app.use("/", router);

const PORT = 8088;
app.listen(PORT, () => {
  console.log(`AIW server listening on :${PORT}`);
});
