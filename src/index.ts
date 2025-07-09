import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db";
import "dotenv/config";
const eFileUpload = require("express-fileupload");
import { mainRoutes } from "./mainRoutes";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5000mb" }));
app.use(eFileUpload());
app.use(
  express.urlencoded({
    limit: "5000mb",
    extended: true,
    parameterLimit: 50000000,
  })
);

app.get("/status", (req, res) => {
  res.json({ status: "Server is running" });
});

app.use("/api", mainRoutes);

app.listen(process.env.PORT, async () => {
  console.log(`Server is running on port ${process.env.PORT}`);
  await connectDB();
});
