# Tajweed API Comparison Test

## Purpose
Test if Quran Foundation API has more accurate tajweed data than Quran.com API

## Test Verse: 84:14
**Arabic:** إِنَّهُۥ ظَنَّ أَن لَّن يَحُورَ
**Issue:** Quran.com API incorrectly marks ن in أَن as `idgham_ghunnah` (should be `idgham_wo_ghunnah`)

---

## API Endpoints to Test

### 1. Quran.com API (Current)
```
GET https://api.quran.com/api/v4/verses/by_chapter/84
  ?language=en
  &words=true
  &word_fields=text_uthmani,text_uthmani_tajweed,translation,transliteration,char_type_name
  &translation_fields=text
  &translations=131
  &fields=text_uthmani,chapter_id,verse_number
  &per_page=300
```

**Result for 84:14:**
- Word: أَن
- Tajweed: `<rule class="idgham_ghunnah">ن</rule>`
- **Status:** ❌ INCORRECT (should be `idgham_wo_ghunnah`)

---

### 2. Quran Foundation API (Alternative)
```
GET https://api.qurancdn.com/api/qdc/verses
  ?chapter_number=84
  &verse_number=14
  &words=true
  &word_fields=text_uthmani_tajweed,v1_page,text_uthmani
```

**Expected Result:**
- If correct: `<rule class="idgham_wo_ghunnah">` or `<rule class="idgham">` 
- If same error: `<rule class="idgham_ghunnah">`

**Status:** 🔍 NEEDS TESTING

---

## Implementation Plan

### Option A: Switch to Quran Foundation API
**If** their data is more accurate:

1. Update `quran.service.ts`:
```typescript
private quranComUrl = 'https://api.qurancdn.com/api/qdc';
```

2. Update API call in `getSurah()`:
```typescript
const url = `${this.quranComUrl}/verses?chapter_number=${surahNumber}&words=true&word_fields=text_uthmani,text_uthmani_tajweed,translation,transliteration`;
```

3. Update CSS if needed (check if they use `<tajweed>` vs `<rule>`)

**Effort:** 2-4 hours

---

### Option B: Hybrid Approach
Use Quran Foundation as primary, fallback to Quran.com if unavailable

**Pros:**
- Best of both worlds
- Increased reliability

**Cons:**
- More complex
- Double API calls

**Effort:** 4-6 hours

---

### Option C: Manual Override System
Keep Quran.com API, but add override file for known errors

```typescript
const TAJWEED_OVERRIDES = {
  '84:14': {
    word: 'أَن',
    correct_class: 'idgham_wo_ghunnah',
    incorrect_class: 'idgham_ghunnah'
  }
};
```

**Pros:**
- Surgical fix for known issues
- Keep trusted API

**Cons:**
- Manual maintenance
- Doesn't scale well
- Goes against "API-only" approach

**Effort:** 2 hours

---

## Testing Checklist

- [ ] Test Quran Foundation API for verse 84:14
- [ ] Compare tajweed classes for all 10 rules
- [ ] Test 5-10 other verses known to have complex tajweed
- [ ] Check API reliability and speed
- [ ] Verify authentication requirements
- [ ] Test rate limits
- [ ] Check documentation quality

---

## Test Verses (Complex Tajweed)

1. **84:14** - Idghaam issue
2. **2:1** - الم (Madd Lazim)
3. **112:1-4** - Multiple ghunnah and qalqalah
4. **114:4** - Idghaam variations
5. **1:1-7** - Al-Fatiha (all rules)

---

## Decision Criteria

Switch to Quran Foundation API if:
- ✅ 84:14 is correct
- ✅ Other test verses are correct
- ✅ API is reliable and fast
- ✅ Documentation is clear
- ✅ No authentication required
- ✅ Reasonable rate limits

Stay with Quran.com API if:
- ❌ Same errors exist
- ❌ API is slower or unreliable
- ❌ Poor documentation
- ❌ Requires authentication
- ❌ Strict rate limits

---

## Next Steps

1. **Immediate:** Test Quran Foundation API manually
2. **If better:** Implement switch
3. **If same:** Document known errors, continue with Quran.com
4. **Long-term:** Report errors to both APIs
