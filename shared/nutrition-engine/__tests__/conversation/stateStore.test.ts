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

  it("for_logging:true + calories حقيقية -> active_food يحمل حقول التغذية الكاملة (جاهز للتأكيد)", () => {
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "دولمة حبة", "870 سعرة، أثبته؟",
      "get_food_nutrition", { food_id: 12, grams: 700, for_logging: true },
      { found: true, food_id: 12, food_name: "دولمة", grams: 700, calories: 870, protein: 28, carbs: 119, fat: 45.5 },
    );
    expect(next.active_food).toEqual({
      food_id: 12, food_name: "دولمة", grams: 700, calories: 870, protein: 28, carbs: 119, fat: 45.5,
    });
  });

  it("for_logging غير مضبوطة (استعلام معلوماتي بحت) -> active_food بلا حقول تغذية، صفر إذن تأكيد لاحق", () => {
    // نفس سيناريو "شكد سعرات البيتزا؟" الحرج — يمنع "تمام" غير متعلق لاحقًا من التحول لتسجيل وجبة
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "شكد سعرات البيتزا؟", "تقريبًا 250 سعرة لكل قطعة",
      "get_food_nutrition", { food_id: 33, grams: 100 }, // صفر for_logging
      { found: true, food_id: 33, food_name: "بيتزا لحم", grams: 100, calories: 273, protein: 12, carbs: 20, fat: 15 },
    );
    expect(next.active_food).toEqual({ food_id: 33, food_name: "بيتزا لحم" });
    expect((next.active_food as { calories?: number })?.calories).toBeUndefined();
  });

  it("log_meal ناجح (ok:true) -> active_food يُمسح كليًا (يمنع تكرار تسجيل صدفة برد لاحق غير متعلق)", () => {
    const staged = nextConversationState(
      EMPTY_CONVERSATION_STATE, "دولمة حبة", "870 سعرة، أثبته؟",
      "get_food_nutrition", { food_id: 12, grams: 700, for_logging: true },
      { found: true, food_id: 12, food_name: "دولمة", grams: 700, calories: 870 },
    );
    expect(staged.active_food).not.toBeNull();

    const afterLog = nextConversationState(
      staged, "ثبت", "عاشت إيدك، سجلتلك!",
      "log_meal", {}, { ok: true, meal_logged: true, local_reply: "..." },
    );
    expect(afterLog.active_food).toBeNull();
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

  it("record_food_dislike ناجحة -> تُضاف لـdisliked_foods", () => {
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "ما أحب الدجاج", "تمام، أتجنبه بالاقتراحات الجاية",
      "record_food_dislike", { food_name: "دجاج" }, { ok: true, food_name: "دجاج" },
    );
    expect(next.disliked_foods).toEqual(["دجاج"]);
  });

  it("record_food_dislike بنفس الاسم مرتين -> صفر تكرار بالقائمة", () => {
    const first = nextConversationState(
      EMPTY_CONVERSATION_STATE, "ما أحب الدجاج", "تمام",
      "record_food_dislike", { food_name: "دجاج" }, { ok: true, food_name: "دجاج" },
    );
    const second = nextConversationState(
      first, "بعد ما أحب الدجاج", "فهمتك",
      "record_food_dislike", { food_name: "دجاج" }, { ok: true, food_name: "دجاج" },
    );
    expect(second.disliked_foods).toEqual(["دجاج"]);
  });

  it("record_food_dislike بـok:false (اسم فاضي) -> صفر إضافة", () => {
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "...", "؟", "record_food_dislike", { food_name: "" }, { ok: false },
    );
    expect(next.disliked_foods).toEqual([]);
  });

  it("disliked_foods يبقى محصورًا بآخر 15 عنصر كحد أقصى", () => {
    let state = EMPTY_CONVERSATION_STATE;
    for (let i = 0; i < 20; i++) {
      state = nextConversationState(
        state, `ما أحب طعام${i}`, "تمام", "record_food_dislike",
        { food_name: `طعام${i}` }, { ok: true, food_name: `طعام${i}` },
      );
    }
    expect(state.disliked_foods).toHaveLength(15);
    expect(state.disliked_foods[state.disliked_foods.length - 1]).toBe("طعام19");
  });

  it("recommend_foods رجّعت recipes حقيقية -> last_suggestion يتحدّث بأسمائها", () => {
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "شنو آكل؟", "أقترحلك...",
      "recommend_foods", {}, { text: "...", recipes: [{ name: "سلطة دجاج" }, { name: "شوربة عدس" }] },
    );
    expect(next.last_suggestion).toEqual({ source_tool: "recommend_foods", items: ["سلطة دجاج", "شوربة عدس"] });
  });

  it("أداة رجّعت recipes فاضية -> last_suggestion يبقى كما هو (صفر استبدال بلا فائدة)", () => {
    const next = nextConversationState(
      EMPTY_CONVERSATION_STATE, "شنو آكل؟", "ماكو خيار مناسب حاليًا",
      "recommend_foods", {}, { text: "...", recipes: [] },
    );
    expect(next.last_suggestion).toBeNull();
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
