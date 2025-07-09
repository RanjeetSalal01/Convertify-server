import express, { Router } from "express";
import { convertAndUpload } from "../controllers/file.controller";

export const fileRoutes: Router = express.Router();

// api/file/convertAndUpload
fileRoutes.post("/convertAndUpload", convertAndUpload);
