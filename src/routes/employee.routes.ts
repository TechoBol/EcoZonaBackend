import { Router } from "express";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../controllers/employee.controller";
import { createPublicInventoryLink } from "../controllers/publicInventory.controller";

const router = Router();

router.get("/get-employees", getEmployees);
router.post("/create-employee", createEmployee);
router.put("/update-employee/:id", updateEmployee);
router.delete("/delete-employee/:id", deleteEmployee);
router.post("/public-inventory-links", createPublicInventoryLink);
export default router;
