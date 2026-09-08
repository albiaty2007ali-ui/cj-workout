"""اختبارات nutrition_ai/dataset_tools/dedup.py — فهرس SQLite حقيقي بـtmp_path، بدون Flask."""
from nutrition_ai.dataset_tools.dedup import DedupIndex


def test_new_text_is_not_duplicate(tmp_path):
    index = DedupIndex(str(tmp_path / "index.sqlite"))
    assert index.is_duplicate("اكلت بيضتين", "تم تسجيل الفطور") is False
    index.close()


def test_same_text_marked_duplicate_after_seen(tmp_path):
    index = DedupIndex(str(tmp_path / "index.sqlite"))
    index.mark_seen("اكلت بيضتين", "تم تسجيل الفطور", source="test")
    index.commit()
    assert index.is_duplicate("اكلت بيضتين", "تم تسجيل الفطور") is True
    index.close()


def test_normalization_catches_diacritic_and_alef_variants(tmp_path):
    index = DedupIndex(str(tmp_path / "index.sqlite"))
    index.mark_seen("أكلت بيضتين", "تم تسجيل الفطور", source="test")
    index.commit()
    # نفس الجملة بشكل ألف مختلف (ا بدل أ) لازم تنكشف كتكرار بعد التطبيع
    assert index.is_duplicate("اكلت بيضتين", "تم تسجيل الفطور") is True
    index.close()


def test_different_output_is_not_duplicate(tmp_path):
    index = DedupIndex(str(tmp_path / "index.sqlite"))
    index.mark_seen("اكلت بيضتين", "تم تسجيل الفطور", source="test")
    index.commit()
    assert index.is_duplicate("اكلت بيضتين", "رد مختلف تمامًا") is False
    index.close()


def test_index_is_resumable_across_instances(tmp_path):
    path = str(tmp_path / "index.sqlite")
    first = DedupIndex(path)
    first.mark_seen("اكلت بيضتين", "تم تسجيل الفطور", source="test")
    first.close()

    second = DedupIndex(path)
    assert second.is_duplicate("اكلت بيضتين", "تم تسجيل الفطور") is True
    second.close()


def test_context_manager_commits_and_closes(tmp_path):
    path = str(tmp_path / "index.sqlite")
    with DedupIndex(path) as index:
        index.mark_seen("اكلت بيضتين", "تم تسجيل الفطور", source="test")

    with DedupIndex(path) as index2:
        assert index2.is_duplicate("اكلت بيضتين", "تم تسجيل الفطور") is True
