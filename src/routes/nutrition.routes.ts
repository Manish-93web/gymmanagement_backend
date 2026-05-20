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

// Dashboard — used by frontend dietService.getActiveDietPlan + getCompliance
router.get('/dashboard', nutritionController.getDashboard.bind(nutritionController));

// Diet plan management (simple consumption log + plan CRUD)
router.post('/plan', nutritionController.createPlan.bind(nutritionController));
router.patch('/plan/:planId', nutritionController.updatePlan.bind(nutritionController));

// Simple flat consumption log (frontend dietService.logConsumption format)
router.post('/consumption', nutritionController.logConsumption.bind(nutritionController));

// Custom food creation
router.post('/foods', nutritionController.createCustomFood.bind(nutritionController));

export default router;
