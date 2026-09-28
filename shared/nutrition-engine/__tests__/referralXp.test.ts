/**
 * اختبارات grantReferralXp (حزمة تطوير الإحالة) — idempotency حقيقية (لا تكرار حتى بإعادة
 * الطلب)، سقف أقصى يوقف المنح، صفر تأثير على مستخدم غير مرتبط.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { grantReferralXp, REFERRAL_XP, MAX_REFERRAL_XP_GRANTS, REFERRAL_XP_REASON } from "../referral.js";

describe("grantReferralXp", () => {
  it("يمنح XP لصاحب الإحالة عند تسجيل مستخدم جديد عبر رابطه", async () => {
    const repo = new InMemoryRepository();
    const referrer = makeUser({ id: "ref1", xp: 0 });
    await repo.saveUser(referrer);

    const granted = await grantReferralXp(repo, referrer, "newUser1");
    expect(granted).toBe(true);

    const saved = await repo.findUser("ref1");
    expect(saved?.xp).toBe(REFERRAL_XP);
  });

  it("idempotency حقيقية: نفس newUserId مرتين -> XP مرة وحدة فقط، صفر تكرار حتى بإعادة الطلب", async () => {
    const repo = new InMemoryRepository();
    const referrer = makeUser({ id: "ref2", xp: 0 });
    await repo.saveUser(referrer);

    const first = await grantReferralXp(repo, referrer, "newUser2");
    const referrerAfterFirst = (await repo.findUser("ref2"))!;
    const second = await grantReferralXp(repo, referrerAfterFirst, "newUser2");

    expect(first).toBe(true);
    expect(second).toBe(false);
    const saved = await repo.findUser("ref2");
    expect(saved?.xp).toBe(REFERRAL_XP); // مو REFERRAL_XP*2
  });

  it("مستخدمون جدد مختلفون -> XP منفصل لكل واحد (صفر تداخل idempotency)", async () => {
    const repo = new InMemoryRepository();
    const referrer = makeUser({ id: "ref3", xp: 0 });
    await repo.saveUser(referrer);

    await grantReferralXp(repo, referrer, "newUserA");
    const afterA = (await repo.findUser("ref3"))!;
    await grantReferralXp(repo, afterA, "newUserB");

    const saved = await repo.findUser("ref3");
    expect(saved?.xp).toBe(REFERRAL_XP * 2);
  });

  it("السقف الأقصى يوقف منح XP إضافي بعد الوصول له، بلا خطأ", async () => {
    const repo = new InMemoryRepository();
    let referrer = makeUser({ id: "ref4", xp: 0 });
    await repo.saveUser(referrer);

    for (let i = 0; i < MAX_REFERRAL_XP_GRANTS; i++) {
      await grantReferralXp(repo, referrer, `bulk-${i}`);
      referrer = (await repo.findUser("ref4"))!;
    }
    expect(referrer.xp).toBe(REFERRAL_XP * MAX_REFERRAL_XP_GRANTS);

    const overCapGranted = await grantReferralXp(repo, referrer, "one-too-many");
    expect(overCapGranted).toBe(false);
    const finalUser = await repo.findUser("ref4");
    expect(finalUser?.xp).toBe(REFERRAL_XP * MAX_REFERRAL_XP_GRANTS); // صفر زيادة بعد السقف
  });

  it("كل منحة تُسجَّل بالـLedger بالسبب الصحيح (تدقيق حقيقي، مو رقم فقط)", async () => {
    const repo = new InMemoryRepository();
    const referrer = makeUser({ id: "ref5", xp: 0 });
    await repo.saveUser(referrer);

    await grantReferralXp(repo, referrer, "newUser5");
    const txs = await repo.listXpTransactionsByReason("ref5", REFERRAL_XP_REASON);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBe(REFERRAL_XP);
  });
});

describe("countUsersReferredBy (حزمة لوحة دعوة صديق)", () => {
  it("يحسب فقط المستخدمين اللي referred_by يطابق المستخدم المطلوب", async () => {
    const repo = new InMemoryRepository();
    const referrer = makeUser({ id: "ref6", xp: 0 });
    const other = makeUser({ id: "other1", xp: 0 });
    await repo.saveUser(referrer);
    await repo.saveUser(other);
    await repo.saveUser(makeUser({ id: "friend1", referred_by: "ref6" }));
    await repo.saveUser(makeUser({ id: "friend2", referred_by: "ref6" }));
    await repo.saveUser(makeUser({ id: "friend3", referred_by: "other1" }));

    expect(await repo.countUsersReferredBy("ref6")).toBe(2);
    expect(await repo.countUsersReferredBy("other1")).toBe(1);
  });

  it("يرجّع صفر لمستخدم بدون أي إحالات، بدون خطأ", async () => {
    const repo = new InMemoryRepository();
    await repo.saveUser(makeUser({ id: "lonely1" }));
    expect(await repo.countUsersReferredBy("lonely1")).toBe(0);
  });

  it("قد يتجاوز عدد المُحالين الفعلي سقف منح XP (referred_count مستقل عن xp_grants_cap)", async () => {
    const repo = new InMemoryRepository();
    let referrer = makeUser({ id: "ref7", xp: 0 });
    await repo.saveUser(referrer);
    for (let i = 0; i < MAX_REFERRAL_XP_GRANTS; i++) {
      await grantReferralXp(repo, referrer, `bulk7-${i}`);
      referrer = (await repo.findUser("ref7"))!;
      await repo.saveUser(makeUser({ id: `bulk7-${i}`, referred_by: "ref7" }));
    }
    // إحالة إضافية بعد السقف: تسجّل referred_by (نفس ما يصير حقيقةً عند auth-register.mts)
    // لكن صفر XP إضافي — referred_count الحقيقي (21) يختلف عمدًا عن xp_grants_used (20).
    await repo.saveUser(makeUser({ id: "over-cap-friend", referred_by: "ref7" }));
    const overCapGranted = await grantReferralXp(repo, referrer, "over-cap-friend");

    expect(overCapGranted).toBe(false);
    expect(await repo.countUsersReferredBy("ref7")).toBe(MAX_REFERRAL_XP_GRANTS + 1);
    expect(await repo.countXpTransactionsByReason("ref7", REFERRAL_XP_REASON)).toBe(MAX_REFERRAL_XP_GRANTS);
  });
});
