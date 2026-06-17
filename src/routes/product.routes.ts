import { Router } from "express";
import {
  createProduct,
  crossInventory,
  getInventoryCrosses,
  getKardex,
  getKardexPro,
  getProducts,
  getPublicProducts,
  getValuedInventory,
  updateProduct,
} from "../controllers/product.controller";

const router = Router();

router.post("/create-product", createProduct);
router.get("/get-public-products", getPublicProducts);
router.get("/get-products", getProducts);
router.put("/update-product/:id", updateProduct);
router.post("/kardex", getKardex);
router.post("/kardex-valorado", getValuedInventory);
router.post("/kardex-pro", getKardexPro);
router.post("/cross-inventory", crossInventory);
router.get("/inventory-cross", getInventoryCrosses);

export default router;
