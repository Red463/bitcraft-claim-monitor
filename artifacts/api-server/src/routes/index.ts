import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bitjitaRouter from "./bitjita";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bitjitaRouter);

export default router;
