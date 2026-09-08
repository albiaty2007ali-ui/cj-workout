export interface RecipeCard {
  slug: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fits_remaining: boolean | null;
  category: string | null;
  category_icon: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
}

export interface RecipeCategory {
  id: string;
  name: string;
  icon: string;
  order_index: number;
}

export interface RecipesListResponse {
  categories: RecipeCategory[];
  recipes: RecipeCard[];
  over_target: boolean;
  remaining_calories: number;
}

export interface RecipeIngredient {
  name: string;
  quantity: string | null;
  unit: string | null;
}

export interface RecipeStep {
  step_number: number;
  instruction: string;
  duration: string | null;
  temperature: string | null;
  tip: string | null;
  warning: string | null;
}

export interface RecipeSubstitution {
  ingredient_name: string;
  replacement: string;
}

export interface RecipeDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  difficulty: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  substitutions: RecipeSubstitution[];
}

export interface RecipeDetailResponse {
  recipe: RecipeDetail;
  over_target: boolean;
  remaining_calories: number;
}
