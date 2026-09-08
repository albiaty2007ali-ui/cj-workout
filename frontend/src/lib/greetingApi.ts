export interface GreetingPrompt {
  label: string;
  prompt: string;
}

export interface GreetingResponse {
  text: string | null;
  prompts: GreetingPrompt[];
}
