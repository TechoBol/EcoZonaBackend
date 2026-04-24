import { Router } from 'express'
import { createSale, getSales } from '../controllers/sale.controller'

const router = Router()

router.post('/create-sale', createSale)
router.get("/get-sales", getSales);

export default router