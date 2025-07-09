import express from "express";
import { fileRoutes } from "./routes/file.route";

const app = express();

// api/files
app.use("/file", fileRoutes)

export const mainRoutes = app;