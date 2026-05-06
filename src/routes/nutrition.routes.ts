import { Router } from 'express';
import nutritionController from '../controllers/nutrition.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();

// Food search is accessible to any authenticated user
router.get('/foods/search', authenticate, nutritionController.searchFood.bind(nutritionController));
router.get('/foods/:foodId', authenticate, nutritionController.getFoodById.bind(nutritionController));

// Macro calculator (no tenant context needed)
router.post('/calculate', authenticate, nutritionController.calculateMacros.bind(nutritionController));

// Nutrition logging requires tenant context
router.use(authenticate, tenantContext);

router.post('/log', nutritionController.logMeal.bind(nutritionController));
router.get('/logs', nutritionController.getNutritionLogs.bind(nutritionController));
router.delete('/logs/:logId', nutritionController.deleteNutritionLog.bind(nutritionController));
router.get('/summary', nutritionController.getNutritionSummary.bind(nutritionController));
router.get('/stats/weekly', nutritionController.getWeeklyNutritionStats.bind(nutritionController));

export default router;
