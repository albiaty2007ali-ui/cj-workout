import "dotenv/config";
import { FirestoreRepository } from "../db/firestoreRepository.js";

const repo = new FirestoreRepository();
const recipes = await repo.findActiveRecipes();
console.log("recipes:", recipes.length, recipes.map((r) => r.slug));
const categories = await repo.listRecipeCategories();
console.log("categories:", categories.length, categories.map((c) => c.name));
const levels = await repo.listLevels();
console.log("levels:", levels.length, "level 1:", levels.find((l) => l.level === 1));
const milestones = await repo.listActiveStreakMilestonesUpTo(1000);
console.log("milestones:", milestones.length);
const tips = await repo.findNutritionTipsByCategory("protein");
console.log("protein tips:", tips.length);

const chicken = recipes.find((r) => r.slug === "grilled-chicken-salad");
console.log("chicken ingredients count:", chicken?.ingredients.length, "steps count:", chicken?.steps.length);
