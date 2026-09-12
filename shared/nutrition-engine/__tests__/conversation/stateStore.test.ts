/**
 * اختبارات conversation/stateStore.ts — تخزين/تحديث ذاكرة المحادثة (المرحلة 5)، وحدة صرفة
 * بدون Gemini/DB حقيقية.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_CONVERSATION_STATE, loadConversationState, nextConversationState, saveConversationState,
} from "../../conversation/stateStore.js";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";

describe("loadConversationState", () => {
  it("مستخدم جديد (conversation_state_json=null) -> الحالة الفارغة", () => {
    const user = makeUser({ id: "s1" });
    expect(loadConversationState(user)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it("JSON تالف -> الحالة الفارغة بأمان، صفر رمي خطأ", () => {
    const user = makeUser({ id: "s2", conversation_state_json: "{not valid json" });
    expect(loadConversationState(user)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it("حالة محفوظة صحيحة -> تُقرأ حرفيًا", () => {
    const saved = { ...EMPTY_CONVERSATION_STATE, active_food: { food_id: 8, food_name: "رز" } };
    const user = makeUser({ id: "s3", conversation_state_json: JSON.stringify(saved) });
    expect(loadConversationState(user).active_food).toEqual({ food_id: 8, food_name: "رز" });
  });
});

describe("nextConversationState", () => {
  it("أداة رجّعت food_id+food_name حقيقيين -> active_food يتحدّث", () => {
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "شكد سعرات الرز؟", "260 سعرة تقريبًا",
      "get_food_nutrition", { food_query: "رز", grams: 100 }, { found: true, food_id: 8, food_name: "تمن (رز)", calories: 130 },
    );
    expect(next.active_food).toEqual({ food_id: 8, food_name: "تمن (رز)" });
    expect(next.last_tool_calls).toHaveLength(1);
    expect(next.last_tool_calls[0].tool).toBe("get_food_nutrition");
  });

  it("last_tool_calls يبقى محصورًا بآخر 3 كحد أقصى", () => {
    let state = EMPTY_CONVERSATION_STATE;
    for (let i = 0; i < 5; i++) {
      state = nextConversationState(state, `رسالة ${i}`, `رد ${i}`, "get_daily_summary", {}, { ok: true, i });
    }
    expect(state.last_tool_calls).toHaveLength(3);
  });

  it("recent_turns يبقى محصورًا بآخر 3 أدوار (مستخدم+نموذج معًا)", () => {
    let state = EMPTY_CONVERSATION_STATE;
    for (let i = 0; i < 4; i++) {
      state = nextConversationState(state, `رسالة ${i}`, `رد ${i}`);
    }
    expect(state.recent_turns.length).toBeLessThanOrEqual(3);
    expect(state.recent_turns[state.recent_turns.length - 1].text).toBe("رد 3");
  });

  it("صفر أداة (رد نصي مباشر) -> last_tool_calls يبقى كما هو، recent_turns يتحدّث فقط", () => {
    const next = nextConversationState(EMPTY_CONVERSATION_STATE, "هلا", "هلا بيك 😄");
    expect(next.last_tool_calls).toEqual([]);
    expect(next.recent_turns).toEqual([{ role: "user", text: "هلا" }, { role: "model", text: "هلا بيك 😄" }]);
  });
});

describe("saveConversationState + loadConversationState — تكامل حقيقي عبر InMemoryRepository", () => {
  it("يُحفَظ ويُقرأ حرفيًا نفس الشي", async () => {
    const repo = new InMemoryRepository();
    const user = makeUser({ id: "s4" });
    await repo.saveUser(user);
    const state = nextConversationState(EMPTY_CONVERSATION_STATE, "مشتهي دولمة", "شكد تريد تقريبًا؟");
    await saveConversationState(repo, user, state);

    const reloadedUser = await repo.findUser("s4");
    const reloadedState = loadConversationState(reloadedUser!);
    expect(reloadedState.recent_turns).toEqual(state.recent_turns);
  });
});
