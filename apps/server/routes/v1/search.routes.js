import express from "express";
import { authMiddleware } from "../../middlewares/authMiddleware.js";
import { ANY_ROLE } from "@demo-panel/shared/roles";
import { globalSearch } from "../../controllers/v1/search.controller.js";

const router = express.Router();

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Search every record, log and screen the caller may read
 *     description: >
 *       Searches the sources declared in config/searchSources.js (ADR-016).
 *       Each source is included only when the caller passes the same
 *       permission gate as its own list route, and the role's data scope is
 *       applied. At most 5 hits per source; groups with no hits are omitted.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Text to find. Shorter than 2 characters returns no groups.
 *     responses:
 *       200:
 *         description: Results grouped by source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isOk:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     term:
 *                       type: string
 *                       nullable: true
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string }
 *                           label: { type: string }
 *                           path: { type: string }
 *                           link: { type: string, enum: [record, list] }
 *                           items:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: string }
 *                                 title: { type: string }
 *                                 subtitle: { type: string, nullable: true }
 *                                 matches:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       field: { type: string }
 *                                       label: { type: string }
 *                                       value: { type: string }
 *       401:
 *         description: Not logged in
 */
router.get("/search", authMiddleware(ANY_ROLE), globalSearch);

export default router;
