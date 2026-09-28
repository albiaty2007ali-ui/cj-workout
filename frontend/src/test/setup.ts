import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals:false بـvitest.config.ts يعني afterEach التلقائي لـ@testing-library/react ما ينسجل
// وحده — بدونه، DOM من اختبار سابق يبقى معلَّق ويسبب "Found multiple elements" باختبار بعده.
afterEach(() => cleanup());
