import express from "express";

const authRouter = express.Router();

authRouter.get("/health", (req, res) => {
  res.status(200).send("OK");
});

export default authRouter;
