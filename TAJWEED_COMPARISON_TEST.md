# Tajweed Comparison Test Plan

## ✅ What We've Verified So Far

### From Console Analysis:
1. ✅ API is returning `<rule>` tags with correct class names
2. ✅ HTML quotes are being added correctly
3. ✅ All 13 unique tajweed classes are being matched by CSS
4. ✅ Colors are being computed and applied
5. ✅ 80 rule tags found in Surah 84
6. ✅ Verse 14 has 8 rule tags, all with correct classes

### CSS Rules Working:
- ✅ `ham_wasl` → Cyan (38, 198, 218)
- ✅ `laam_shamsiyah` → Gray (158, 158, 158)
- ✅ `madda_*` → Red (239, 83, 80)
- ✅ `ikhafa` → Amber (255, 213, 79)
- ✅ `ghunnah` → Green (102, 187, 106)
- ✅ `qalaqah` → Purple (186, 104, 200)
- ✅ `idgham_ghunnah` → Blue (66, 165, 245)
- ✅ `idgham_wo_ghunnah` → Gray (189, 189, 189)
- ✅ `slnt` → Gray (158, 158, 158)

## 🔍 Remaining Issues to Investigate

### Issue 1: Words Without Tajweed Data

From the debug logs, we saw:
- **Verse 1, Word 1**: `'إِذَا'` has `has_rule_tag: false` (NO tajweed data from API)

**Question:** Does Quran.com show colors on this word? If yes, they might be:
- Using client-side logic to add colors
- Using a different API or additional data source
- Using a font-based system instead of HTML tags

### Issue 2: Color Value Differences

Our colors are based on Material Design. Quran.com might use different shades.

**Our Dark Mode Colors:**
- Green: `#66BB6A` (Material Green 400)
- Blue: `#42A5F5` (Material Blue 400)
- Red: `#EF5350` (Material Red 400)
- Purple: `#BA68C8` (Material Purple 300)
- Amber: `#FFD54F` (Material Amber 300)
- Gray (idgham_wo): `#BDBDBD` (Material Gray 400)
- Gray (silent/laam): `#9E9E9E` (Material Gray 500)
- Cyan: `#26C6DA` (Material Cyan 400)

**Quran.com might use different values!**

## 🧪 Testing Instructions

### Test 1: Coverage Analysis (NEW!)

I've added logging that shows:
- How many words HAVE tajweed data
- How many words DON'T have tajweed data
- Coverage percentage
- Sample words without tajweed

**Steps:**
1. Clear cache: `localStorage.clear(); location.reload();`
2. Navigate to Surah 84
3. Look for: `📊 TAJWEED COVERAGE ANALYSIS`
4. Copy the output

**Expected Output:**
```javascript
📊 TAJWEED COVERAGE ANALYSIS: {
  total_verses: 25,
  words_with_tajweed: 150,
  words_without_tajweed: 30,
  coverage_percentage: "83.3%",
  sample_words_without_tajweed: [
    {verse: 1, text: "إِذَا", tajweed_html: "إِذَا"},
    ...
  ]
}
```

This will tell us if Quran.com is coloring letters that our API doesn't provide colors for!

### Test 2: Exact Color Comparison

For each screenshot you sent, please tell me:

**Verse 84:14** (إِنَّهُۥ ظَنَّ أَن لَّن يَحُورَ):

| Letter | Our Color | Quran.com Color | Match? |
|---|---|---|---|
| نّ (in إِنَّهُۥ) | Green | ? | ? |
| ۥ (in إِنَّهُۥ) | Red | ? | ? |
| نّ (in ظَنَّ) | Green | ? | ? |
| َن (in أَن) | Gray | ? | ? |
| ل (in لَّن) | Gray | ? | ? |
| َن (in لَّن) | Blue | ? | ? |
| ي (in يَحُورَ) | Blue | ? | ? |
| ُو (in يَحُورَ) | Red | ? | ? |

Fill in the "Quran.com Color" column and tell me which don't match!

### Test 3: Side-by-Side Visual

Take a new screenshot of:
1. **Your app** (Surah 84, verses 1-6) - Dark Mode
2. **Quran.com** (Surah 84, verses 1-6) - Dark Mode

Put them side by side and circle/mark the letters that look different.

## 🎯 Next Steps

After you run Test 1 and send me the coverage analysis, I'll:
1. ✅ Know if the API is missing tajweed data for some words
2. ✅ Compare our colors to Quran.com's exact colors
3. ✅ Fix any remaining differences

---

**Build Status:** ✅ **Compiled successfully!**

**Action:** Clear cache, reload, and copy the `📊 TAJWEED COVERAGE ANALYSIS` output!
